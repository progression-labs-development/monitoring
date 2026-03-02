#!/bin/bash
# Claude Code telemetry injection -- SessionStart hook
# Deployed via claude-config, sends all session telemetry to SigNoz
#
# This script is executed by Claude Code at session start. It writes
# OpenTelemetry environment variables to $CLAUDE_ENV_FILE so that
# traces, metrics, and logs are exported to our SigNoz instance.
#
# Prerequisites:
#   - SIGNOZ_KEY env var set, OR 1Password CLI configured with access
#     to op://Engineering/SigNoz/ingestion-key
#   - SIGNOZ_OTLP_ENDPOINT env var set, OR uses default endpoint
#
# Usage (in claude-config settings.json):
#   {
#     "hooks": {
#       "SessionStart": [{
#         "type": "command",
#         "command": "/path/to/telemetry-hook.sh"
#       }]
#     }
#   }

SIGNOZ_KEY="${SIGNOZ_KEY:-$(op read "op://Engineering/SigNoz/ingestion-key" 2>/dev/null || echo "")}"
OTLP_ENDPOINT="${SIGNOZ_OTLP_ENDPOINT:-https://<signoz-host>:4317}"

if [ -z "$SIGNOZ_KEY" ]; then
  echo "Warning: SIGNOZ_KEY not set. Telemetry will not be exported." >&2
  exit 0
fi

if [ -n "$CLAUDE_ENV_FILE" ]; then
  cat >> "$CLAUDE_ENV_FILE" <<TELEMETRY
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=${OTLP_ENDPOINT}
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=${SIGNOZ_KEY}
OTEL_RESOURCE_ATTRIBUTES=team=${PALINDROM_TEAM:-engineering},org=palindrom,engineer=${USER}
TELEMETRY
fi
