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

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessJwt // .accessJwt // empty')
[ -n "$ACCESS_TOKEN" ] || fail "Could not extract access token from login response"

info "Login successful"

# --- Query for Claude Code telemetry ---

info "Querying for services..."

SERVICES_RESPONSE=$(curl -sf "$URL/api/v1/services" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -G --data-urlencode "start=$(date -v-1H +%s 2>/dev/null || date -d '1 hour ago' +%s)" \
  --data-urlencode "end=$(date +%s)" 2>/dev/null) \
  || fail "Could not query SigNoz services API"

# Check if any service name contains "claude"
CLAUDE_SERVICES=$(echo "$SERVICES_RESPONSE" | jq -r '[.[] | select(.serviceName | test("claude"; "i"))] | length')

if [ "$CLAUDE_SERVICES" -gt 0 ]; then
  echo ""
  echo "PASS: Found $CLAUDE_SERVICES Claude Code service(s) in SigNoz"
  echo "$SERVICES_RESPONSE" | jq -r '.[] | select(.serviceName | test("claude"; "i")) | "  - \(.serviceName)"'
else
  echo ""
  echo "FAIL: No Claude Code services found in the last hour"
  echo ""
  echo "This is expected if no Claude Code sessions with telemetry enabled have run recently."
  echo "To send test telemetry, follow the manual testing steps in docs/runbook.md."
  echo ""
  info "Available services:"
  echo "$SERVICES_RESPONSE" | jq -r '.[] | "  - \(.serviceName)"' 2>/dev/null || echo "  (none)"
  exit 1
fi
