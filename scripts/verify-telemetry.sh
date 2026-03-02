#!/usr/bin/env bash
set -euo pipefail

# Verify Claude Code telemetry is flowing to SigNoz.
# Fetches admin credentials from GCP Secret Manager, logs in to the SigNoz API,
# and checks for recent telemetry data.

GCP_PROJECT="christopher-little-dev"
ADMIN_SECRET="monitoring-signoz-admin-credentials-secret-dev"

# --- Helpers ---

fail() { echo "FAIL: $1" >&2; exit 1; }
warn() { echo "WARN: $1" >&2; }
info() { echo "INFO: $1"; }

# --- Pre-flight checks ---

command -v gcloud >/dev/null 2>&1 || fail "gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
command -v curl >/dev/null 2>&1 || fail "curl not found"
command -v jq >/dev/null 2>&1 || fail "jq not found"

# --- Fetch admin credentials ---

info "Fetching SigNoz admin credentials from Secret Manager..."
CREDS=$(gcloud secrets versions access latest \
  --secret="$ADMIN_SECRET" \
  --project="$GCP_PROJECT" 2>/dev/null) || fail "Could not fetch secret '$ADMIN_SECRET'. Check gcloud auth and permissions."

URL=$(echo "$CREDS" | jq -r .url)
EMAIL=$(echo "$CREDS" | jq -r .email)
PASSWORD=$(echo "$CREDS" | jq -r .password)

[ -n "$URL" ] && [ "$URL" != "null" ] || fail "Missing 'url' in admin credentials secret"
[ -n "$EMAIL" ] && [ "$EMAIL" != "null" ] || fail "Missing 'email' in admin credentials secret"
[ -n "$PASSWORD" ] && [ "$PASSWORD" != "null" ] || fail "Missing 'password' in admin credentials secret"

info "SigNoz URL: $URL"

# --- Login to SigNoz ---

info "Logging in to SigNoz API..."

# Get org ID from session context
CONTEXT=$(curl -sf "$URL/api/v2/sessions/context?email=$EMAIL&ref=$URL" 2>/dev/null) \
  || fail "Could not reach SigNoz session context endpoint at $URL. Is the instance running?"

ORG_ID=$(echo "$CONTEXT" | jq -r '.data.orgs[0].id')
[ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ] || fail "Could not extract org ID from session context"

# Login and extract access token
LOGIN_RESPONSE=$(curl -sf "$URL/api/v2/sessions/email_password" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"orgID\":\"$ORG_ID\"}" 2>/dev/null) \
  || fail "SigNoz login failed. Check admin credentials."

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .data.accessJwt // .accessJwt // empty')
[ -n "$ACCESS_TOKEN" ] || fail "Could not extract access token from login response"

info "Login successful"

# --- Query for Claude Code telemetry ---

info "Querying for services (last 1 hour)..."

START_NS="$(date -v-1H +%s 2>/dev/null || date -d '1 hour ago' +%s)000000000"
END_NS="$(date +%s)000000000"

QUERY_BODY="{\"start\":${START_NS},\"end\":${END_NS},\"compositeQuery\":{\"builderQueries\":{\"A\":{\"dataSource\":\"traces\",\"queryName\":\"A\",\"aggregateOperator\":\"count\",\"aggregateAttribute\":{\"key\":\"\",\"type\":\"\",\"dataType\":\"\",\"isColumn\":false},\"expression\":\"A\",\"groupBy\":[{\"key\":\"serviceName\",\"dataType\":\"string\",\"type\":\"tag\",\"isColumn\":false}],\"stepInterval\":3600}},\"queryType\":\"builder\",\"panelType\":\"table\"}}"

SERVICES_RESPONSE=$(curl -sf "$URL/api/v3/query_range" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST -d "$QUERY_BODY" 2>/dev/null) \
  || fail "Could not query SigNoz v3 API"

# Extract service names from grouped results
ALL_SERVICES=$(echo "$SERVICES_RESPONSE" | jq -r '.data.result[0].series[]?.labels.serviceName // empty' 2>/dev/null)
CLAUDE_SERVICES=$(echo "$ALL_SERVICES" | grep -ic claude || true)

if [ "$CLAUDE_SERVICES" -gt 0 ]; then
  echo ""
  echo "PASS: Found $CLAUDE_SERVICES Claude Code service(s) in SigNoz"
  echo "$ALL_SERVICES" | grep -i claude | while read -r svc; do echo "  - $svc"; done
else
  echo ""
  echo "FAIL: No Claude Code services found in the last hour"
  echo ""
  echo "This is expected if no Claude Code sessions with telemetry enabled have run recently."
  echo "To send test telemetry, follow the manual testing steps in docs/runbook.md."
  echo ""
  if [ -n "$ALL_SERVICES" ]; then
    info "Available services:"
    echo "$ALL_SERVICES" | while read -r svc; do [ -n "$svc" ] && echo "  - $svc"; done
  else
    info "No services found at all (no telemetry data in the last hour)"
  fi
  exit 1
fi
