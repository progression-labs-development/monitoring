#!/usr/bin/env bash
set -euo pipefail

# Provision SigNoz alert rules and notification channels.
# Fetches admin credentials from GCP Secret Manager, logs in to the SigNoz API,
# creates/updates the webhook notification channel and all alert rules.
#
# Usage: bash scripts/provision-alerts.sh [--webhook-url URL]
#
# If --webhook-url is not provided, the script fetches the alert-receiver
# Cloud Run URL from GCP.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_DIR="$SCRIPT_DIR/../services/alert-receiver/alert-rules"

GCP_PROJECT="christopher-little-dev"
ADMIN_SECRET="monitoring-signoz-admin-credentials-secret-dev"
WEBHOOK_SECRET_NAME="monitoring-alert-receiver-webhook-secret-secret-dev"
CLOUD_RUN_SERVICE="alert-receiver"
CLOUD_RUN_REGION="europe-west2"
CHANNEL_NAME="alert-receiver"

# --- Helpers ---

fail() { echo "FAIL: $1" >&2; exit 1; }
info() { echo "INFO: $1"; }

# --- Parse arguments ---

WEBHOOK_URL=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --webhook-url) WEBHOOK_URL="$2"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

# --- Pre-flight checks ---

command -v gcloud >/dev/null 2>&1 || fail "gcloud CLI not found"
command -v curl >/dev/null 2>&1 || fail "curl not found"
command -v jq >/dev/null 2>&1 || fail "jq not found"

# --- Fetch admin credentials ---

info "Fetching SigNoz admin credentials from Secret Manager..."
CREDS=$(gcloud secrets versions access latest \
  --secret="$ADMIN_SECRET" \
  --project="$GCP_PROJECT" 2>/dev/null) || fail "Could not fetch secret '$ADMIN_SECRET'"

URL=$(echo "$CREDS" | jq -r .url)
EMAIL=$(echo "$CREDS" | jq -r .email)
PASSWORD=$(echo "$CREDS" | jq -r .password)

[ -n "$URL" ] && [ "$URL" != "null" ] || fail "Missing 'url' in admin credentials secret"
[ -n "$EMAIL" ] && [ "$EMAIL" != "null" ] || fail "Missing 'email' in admin credentials secret"
[ -n "$PASSWORD" ] && [ "$PASSWORD" != "null" ] || fail "Missing 'password' in admin credentials secret"

info "SigNoz URL: $URL"

# --- Resolve webhook URL ---

if [ -z "$WEBHOOK_URL" ]; then
  info "Fetching alert-receiver Cloud Run URL..."
  # Use the new-format *.run.app URL (first entry in the urls annotation)
  WEBHOOK_URL=$(gcloud run services describe "$CLOUD_RUN_SERVICE" \
    --region="$CLOUD_RUN_REGION" \
    --project="$GCP_PROJECT" \
    --format='json(metadata.annotations)' 2>/dev/null \
    | jq -r '.metadata.annotations["run.googleapis.com/urls"]' \
    | jq -r '.[0]') || fail "Could not fetch Cloud Run URL for '$CLOUD_RUN_SERVICE'"
  [ -n "$WEBHOOK_URL" ] && [ "$WEBHOOK_URL" != "null" ] || fail "Cloud Run service '$CLOUD_RUN_SERVICE' has no URL"
fi

WEBHOOK_URL="${WEBHOOK_URL%/}/webhook"
info "Webhook URL: $WEBHOOK_URL"

# --- Fetch webhook secret ---

info "Fetching webhook secret..."
WEBHOOK_SECRET=$(gcloud secrets versions access latest \
  --secret="$WEBHOOK_SECRET_NAME" \
  --project="$GCP_PROJECT" 2>/dev/null) || fail "Could not fetch secret '$WEBHOOK_SECRET_NAME'"
[ -n "$WEBHOOK_SECRET" ] || fail "Webhook secret is empty"

# --- Login to SigNoz ---

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

# --- Step 1: Create/update notification channel ---

info "Configuring notification channel '$CHANNEL_NAME'..."

EXISTING_CHANNELS=$(api GET "/api/v1/channels") || fail "Could not list notification channels"
EXISTING_CHANNEL_ID=$(echo "$EXISTING_CHANNELS" | jq -r \
  --arg name "$CHANNEL_NAME" \
  '.data[]? | select(.name == $name) | .id // empty')

CHANNEL_PAYLOAD=$(jq -n \
  --arg name "$CHANNEL_NAME" \
  --arg url "$WEBHOOK_URL" \
  --arg secret "$WEBHOOK_SECRET" \
  '{
    name: $name,
    webhook_configs: [{
      send_resolved: true,
      url: $url,
      http_config: {
        authorization: {
          type: "Bearer",
          credentials: $secret
        }
      }
    }]
  }')

if [ -n "$EXISTING_CHANNEL_ID" ]; then
  info "  Updating existing channel (id=$EXISTING_CHANNEL_ID)..."
  api PUT "/api/v1/channels/$EXISTING_CHANNEL_ID" -d "$CHANNEL_PAYLOAD" >/dev/null \
    || fail "Could not update notification channel"
  CHANNEL_ID="$EXISTING_CHANNEL_ID"
else
  info "  Creating new channel..."
  CHANNEL_RESPONSE=$(api POST "/api/v1/channels" -d "$CHANNEL_PAYLOAD") \
    || fail "Could not create notification channel"
  CHANNEL_ID=$(echo "$CHANNEL_RESPONSE" | jq -r '.data.id // .id // empty')
  [ -n "$CHANNEL_ID" ] || fail "Could not extract channel ID from response"
fi

info "  Channel ready (id=$CHANNEL_ID)"

# --- Step 2: Create/update alert rules ---

info "Provisioning alert rules..."

EXISTING_RULES=$(api GET "/api/v1/rules") || fail "Could not list alert rules"

RULE_COUNT=0
CREATED=0
UPDATED=0

for rule_file in "$RULES_DIR"/*.json; do
  [ -f "$rule_file" ] || continue
  RULE_COUNT=$((RULE_COUNT + 1))

  RULE_NAME=$(jq -r '.alert' "$rule_file")
  info "  Processing rule: $RULE_NAME"

  # Inject the notification channel and API version into the rule
  RULE_PAYLOAD=$(jq \
    --arg channel "$CHANNEL_NAME" \
    '. + { preferredChannels: [$channel], version: "v5" } | del(._comment)' \
    "$rule_file")

  # Check if rule already exists by name
  EXISTING_RULE_ID=$(echo "$EXISTING_RULES" | jq -r \
    --arg name "$RULE_NAME" \
    '.data.rules[]? | select(.alert == $name) | .id // empty')

  if [ -n "$EXISTING_RULE_ID" ]; then
    info "    Updating existing rule (id=$EXISTING_RULE_ID)..."
    RULE_PAYLOAD=$(echo "$RULE_PAYLOAD" | jq --arg id "$EXISTING_RULE_ID" '. + {id: $id}')
    api PUT "/api/v1/rules/$EXISTING_RULE_ID" -d "$RULE_PAYLOAD" >/dev/null \
      || { echo "WARN: Failed to update rule '$RULE_NAME'" >&2; continue; }
    UPDATED=$((UPDATED + 1))
  else
    info "    Creating new rule..."
    api POST "/api/v1/rules" -d "$RULE_PAYLOAD" >/dev/null \
      || { echo "WARN: Failed to create rule '$RULE_NAME'" >&2; continue; }
    CREATED=$((CREATED + 1))
  fi
done

echo ""
info "Provisioning complete:"
info "  Notification channel: $CHANNEL_NAME (id=$CHANNEL_ID)"
info "  Rules processed: $RULE_COUNT (created=$CREATED, updated=$UPDATED)"
