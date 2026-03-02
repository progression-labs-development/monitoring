#!/usr/bin/env bash
set -euo pipefail

# Weekly Cost Report Generator
#
# Queries SigNoz for weekly Claude Code cost data and posts a formatted
# summary to Slack. Designed to run as a scheduled GitHub Actions workflow
# (Fridays at 6pm UTC).
#
# Required environment variables:
#   GCP_PROJECT         - GCP project ID (default: christopher-little-dev)
#   ADMIN_SECRET        - Secret Manager secret name for SigNoz admin credentials
#   SLACK_WEBHOOK_URL   - Slack incoming webhook URL for posting the report
#
# NOTE: This script requires Claude Code telemetry data to be flowing into
# SigNoz before it can produce meaningful reports. Without telemetry data,
# the queries will return empty results.

GCP_PROJECT="${GCP_PROJECT:-christopher-little-dev}"
ADMIN_SECRET="${ADMIN_SECRET:-monitoring-signoz-admin-credentials-secret-dev}"

# --- Helpers ---

fail() { echo "FAIL: $1" >&2; exit 1; }
info() { echo "INFO: $1"; }

# --- Pre-flight checks ---

command -v gcloud >/dev/null 2>&1 || fail "gcloud CLI not found"
command -v curl >/dev/null 2>&1 || fail "curl not found"
command -v jq >/dev/null 2>&1 || fail "jq not found"
command -v bc >/dev/null 2>&1 || fail "bc not found"

[ -n "${SLACK_WEBHOOK_URL:-}" ] || fail "SLACK_WEBHOOK_URL is not set"

# --- Fetch admin credentials and login ---

info "Fetching SigNoz admin credentials from Secret Manager..."
CREDS=$(gcloud secrets versions access latest \
  --secret="$ADMIN_SECRET" \
  --project="$GCP_PROJECT" 2>/dev/null) || fail "Could not fetch secret '$ADMIN_SECRET'"

URL=$(echo "$CREDS" | jq -r .url)
EMAIL=$(echo "$CREDS" | jq -r .email)
PASSWORD=$(echo "$CREDS" | jq -r .password)

[ -n "$URL" ] && [ "$URL" != "null" ] || fail "Missing 'url' in admin credentials"
[ -n "$EMAIL" ] && [ "$EMAIL" != "null" ] || fail "Missing 'email' in admin credentials"
[ -n "$PASSWORD" ] && [ "$PASSWORD" != "null" ] || fail "Missing 'password' in admin credentials"

info "SigNoz URL: $URL"
info "Logging in to SigNoz API..."

CONTEXT=$(curl -sf "$URL/api/v2/sessions/context?email=$EMAIL&ref=$URL" 2>/dev/null) \
  || fail "Could not reach SigNoz session context endpoint"

ORG_ID=$(echo "$CONTEXT" | jq -r '.data.orgs[0].id')
[ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ] || fail "Could not extract org ID"

LOGIN_RESPONSE=$(curl -sf "$URL/api/v2/sessions/email_password" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"orgID\":\"$ORG_ID\"}" 2>/dev/null) \
  || fail "SigNoz login failed"

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .data.accessJwt // .accessJwt // empty')
[ -n "$ACCESS_TOKEN" ] || fail "Could not extract access token"

info "Login successful"

# --- Helper: authenticated API calls ---

api() {
  local method="$1" path="$2"
  shift 2
  curl -sf "$URL$path" \
    -X "$method" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    "$@" 2>/dev/null
}

# --- Time range: last 7 days ---

NOW_S=$(date +%s)
WEEK_AGO_S=$((NOW_S - 7 * 24 * 3600))
START_NS="${WEEK_AGO_S}000000000"
END_NS="${NOW_S}000000000"
WEEK_START=$(date -u -r "$WEEK_AGO_S" +%Y-%m-%d 2>/dev/null || date -u -d "@$WEEK_AGO_S" +%Y-%m-%d)
WEEK_END=$(date -u +%Y-%m-%d)

info "Report period: $WEEK_START to $WEEK_END"

# --- Query 1: Total cost ---

info "Querying total cost..."
TOTAL_COST_BODY=$(jq -n \
  --argjson start "$START_NS" \
  --argjson end "$END_NS" \
  '{
    start: $start,
    end: $end,
    compositeQuery: {
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateOperator: "sum",
          aggregateAttribute: { key: "session.cost.total", type: "Gauge" },
          filters: { items: [], op: "AND" },
          groupBy: [],
          expression: "A"
        }
      },
      queryType: "builder",
      panelType: "table"
    }
  }')

TOTAL_COST_RESPONSE=$(api POST "/api/v3/query_range" -d "$TOTAL_COST_BODY") || true
TOTAL_COST=$(echo "$TOTAL_COST_RESPONSE" | jq -r '.data.result[0].series[0].values[0].value // "0"' 2>/dev/null || echo "0")

# --- Query 2: Top 5 projects by cost ---

info "Querying top projects by cost..."
PROJECT_COST_BODY=$(jq -n \
  --argjson start "$START_NS" \
  --argjson end "$END_NS" \
  '{
    start: $start,
    end: $end,
    compositeQuery: {
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateOperator: "sum",
          aggregateAttribute: { key: "session.cost.total", type: "Gauge" },
          filters: { items: [], op: "AND" },
          groupBy: [{ key: "project.name" }],
          expression: "A",
          orderBy: [{ columnName: "value", order: "desc" }],
          limit: 5
        }
      },
      queryType: "builder",
      panelType: "table"
    }
  }')

PROJECT_COST_RESPONSE=$(api POST "/api/v3/query_range" -d "$PROJECT_COST_BODY") || true
TOP_PROJECTS=$(echo "$PROJECT_COST_RESPONSE" | jq -r '
  [.data.result[0].series[]? |
    { name: .labels["project.name"], cost: (.values[0].value | tonumber | . * 100 | round / 100) }
  ] | .[:5] | map("  - \(.name): $\(.cost)") | join("\n")
' 2>/dev/null || echo "  (no data)")

# --- Query 3: Top 5 engineers by cost ---

info "Querying top engineers by cost..."
ENGINEER_COST_BODY=$(jq -n \
  --argjson start "$START_NS" \
  --argjson end "$END_NS" \
  '{
    start: $start,
    end: $end,
    compositeQuery: {
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateOperator: "sum",
          aggregateAttribute: { key: "session.cost.total", type: "Gauge" },
          filters: { items: [], op: "AND" },
          groupBy: [{ key: "engineer" }],
          expression: "A",
          orderBy: [{ columnName: "value", order: "desc" }],
          limit: 5
        }
      },
      queryType: "builder",
      panelType: "table"
    }
  }')

ENGINEER_COST_RESPONSE=$(api POST "/api/v3/query_range" -d "$ENGINEER_COST_BODY") || true
TOP_ENGINEERS=$(echo "$ENGINEER_COST_RESPONSE" | jq -r '
  [.data.result[0].series[]? |
    { name: .labels.engineer, cost: (.values[0].value | tonumber | . * 100 | round / 100) }
  ] | .[:5] | map("  - \(.name): $\(.cost)") | join("\n")
' 2>/dev/null || echo "  (no data)")

# --- Query 4: Session statistics (average cost, max cost) ---

info "Querying session statistics..."
SESSION_AVG_BODY=$(jq -n \
  --argjson start "$START_NS" \
  --argjson end "$END_NS" \
  '{
    start: $start,
    end: $end,
    compositeQuery: {
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateOperator: "avg",
          aggregateAttribute: { key: "session.cost.total", type: "Gauge" },
          filters: { items: [], op: "AND" },
          groupBy: [],
          expression: "A"
        }
      },
      queryType: "builder",
      panelType: "table"
    }
  }')

SESSION_AVG_RESPONSE=$(api POST "/api/v3/query_range" -d "$SESSION_AVG_BODY") || true
AVG_SESSION_COST=$(echo "$SESSION_AVG_RESPONSE" | jq -r '.data.result[0].series[0].values[0].value // "0"' 2>/dev/null || echo "0")

SESSION_MAX_BODY=$(jq -n \
  --argjson start "$START_NS" \
  --argjson end "$END_NS" \
  '{
    start: $start,
    end: $end,
    compositeQuery: {
      builderQueries: {
        A: {
          dataSource: "metrics",
          queryName: "A",
          aggregateOperator: "max",
          aggregateAttribute: { key: "session.cost.total", type: "Gauge" },
          filters: { items: [], op: "AND" },
          groupBy: [],
          expression: "A"
        }
      },
      queryType: "builder",
      panelType: "table"
    }
  }')

SESSION_MAX_RESPONSE=$(api POST "/api/v3/query_range" -d "$SESSION_MAX_BODY") || true
MAX_SESSION_COST=$(echo "$SESSION_MAX_RESPONSE" | jq -r '.data.result[0].series[0].values[0].value // "0"' 2>/dev/null || echo "0")

# --- Query 5: Model breakdown ---

info "Querying model breakdown..."
MODEL_BODY=$(jq -n \
  --argjson start "$START_NS" \
  --argjson end "$END_NS" \
  '{
    start: $start,
    end: $end,
    compositeQuery: {
      builderQueries: {
        A: {
          dataSource: "traces",
          queryName: "A",
          aggregateOperator: "count",
          aggregateAttribute: { key: "traceID", type: "string" },
          filters: {
            items: [{
              key: { key: "gen_ai.request.model", type: "tag" },
              op: "exists",
              value: ""
            }],
            op: "AND"
          },
          groupBy: [{ key: "gen_ai.request.model" }],
          expression: "A",
          orderBy: [{ columnName: "value", order: "desc" }]
        }
      },
      queryType: "builder",
      panelType: "table"
    }
  }')

MODEL_RESPONSE=$(api POST "/api/v3/query_range" -d "$MODEL_BODY") || true
MODEL_BREAKDOWN=$(echo "$MODEL_RESPONSE" | jq -r '
  [.data.result[0].series[]? |
    { model: .labels["gen_ai.request.model"], count: (.values[0].value | tonumber | floor) }
  ] | map("  - \(.model): \(.count) requests") | join("\n")
' 2>/dev/null || echo "  (no data)")

# --- Format total cost ---

TOTAL_COST_FMT=$(echo "$TOTAL_COST" | awk '{printf "%.2f", $1}')
AVG_SESSION_COST_FMT=$(echo "$AVG_SESSION_COST" | awk '{printf "%.2f", $1}')
MAX_SESSION_COST_FMT=$(echo "$MAX_SESSION_COST" | awk '{printf "%.2f", $1}')

# --- Build Slack message ---

info "Building Slack message..."

SLACK_TEXT="*Weekly Claude Code Cost Report*
_${WEEK_START} to ${WEEK_END}_

*Total Cost:* \$${TOTAL_COST_FMT}
*Average Session Cost:* \$${AVG_SESSION_COST_FMT}
*Highest Single Session:* \$${MAX_SESSION_COST_FMT}

*Top 5 Projects by Cost:*
${TOP_PROJECTS}

*Top 5 Engineers by Cost:*
${TOP_ENGINEERS}

*Model Breakdown:*
${MODEL_BREAKDOWN}"

SLACK_PAYLOAD=$(jq -n --arg text "$SLACK_TEXT" '{text: $text}')

# --- Post to Slack ---

info "Posting report to Slack..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$SLACK_PAYLOAD")

if [ "$HTTP_CODE" = "200" ]; then
  info "Report posted to Slack successfully"
else
  fail "Slack webhook returned HTTP $HTTP_CODE"
fi

# --- Print report to stdout for CI logs ---

echo ""
echo "=== Weekly Cost Report ==="
echo "$SLACK_TEXT"
echo "=========================="
