# SigNoz Alert Rules

This directory contains alert rule definitions for our SigNoz observability platform. These alerts monitor Claude Code usage, costs, security events, and telemetry reliability.

## Alert Catalogue

### Cost Alerts

| Alert | File | Severity | Condition | Evaluation |
|-------|------|----------|-----------|------------|
| Session cost spike | `cost-spike-per-session.json` | warning | Single session > $5 | Every 1m, 5m window |
| Daily engineer cost | `cost-spike-daily.json` | warning | Engineer daily spend > $30 | Every 1h, 24h window |
| Weekly project cost | `cost-spike-weekly.json` | warning | Project weekly spend > $200 | Every 6h, 168h window |
| Unusual model usage | `unusual-model-usage.json` | warning | >80% Opus in a day | Every 6h, 24h window |

### Security Alerts

| Alert | File | Severity | Condition | Evaluation |
|-------|------|----------|-----------|------------|
| Blocked command | `blocked-command.json` | critical | Any PreToolUse reject | Every 1m, 5m window |

### Reliability Alerts

| Alert | File | Severity | Condition | Evaluation |
|-------|------|----------|-----------|------------|
| Missing telemetry | `missing-telemetry.json` | warning | No data from engineer in 24h | Every 6h, 24h window |

## Alert Format

Each alert file follows the SigNoz alert rule JSON schema:

```json
{
  "alert": "rule_name",
  "alertType": "METRIC_BASED_ALERT",
  "ruleType": "threshold_rule",
  "condition": {
    "compositeQuery": {
      "builderQueries": { ... },
      "queryType": "builder"
    },
    "op": "1",
    "target": 5.0,
    "matchType": "1"
  },
  "labels": {
    "domain": "cost|security|reliability",
    "severity": "warning|critical"
  },
  "annotations": {
    "description": "Human-readable description with {{$labels.field}} interpolation",
    "summary": "Short summary"
  },
  "evalWindow": "5m0s",
  "frequency": "1m0s",
  "preferredChannels": ["alert-receiver"]
}
```

### Condition operators

| `op` value | Meaning |
|------------|---------|
| `1` | Greater than target |
| `2` | Less than target |
| `3` | Equal to target |
| `4` | Not equal to target |

### Data sources

| `dataSource` | Use case |
|--------------|----------|
| `metrics` | Numeric gauges and counters (e.g., `session.cost.total`) |
| `traces` | Span-based queries (e.g., blocked command events) |
| `logs` | Log-based queries |

## Importing Alerts

### Automated provisioning (recommended)

Use the provisioning script to apply all alerts to SigNoz:

```bash
bash scripts/provision-alerts.sh
```

This script:
1. Fetches SigNoz admin credentials from GCP Secret Manager
2. Logs in to the SigNoz API
3. Creates or updates the notification channel
4. Creates or updates each alert rule

**Note:** The provisioning script currently reads from `services/alert-receiver/alert-rules/`. To use these configs instead, update the `RULES_DIR` variable in the script or copy the files there.

### Manual import via SigNoz API

```bash
# 1. Get an access token (see docs/runbook.md for login steps)
ACCESS_TOKEN="<your-token>"
SIGNOZ_URL="<signoz-url>"

# 2. Create an alert rule
curl -X POST "$SIGNOZ_URL/api/v1/rules" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @configs/alerts/cost-spike-per-session.json

# 3. Repeat for each alert file
for f in configs/alerts/*.json; do
  curl -X POST "$SIGNOZ_URL/api/v1/rules" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$f"
done
```

### Manual import via SigNoz UI

1. Open SigNoz UI > **Alerts** > **New Alert**
2. Switch to **Builder** mode
3. Configure the query, threshold, and labels to match the JSON definition
4. Set the preferred notification channel to `alert-receiver`
5. Save the alert

## Notification Channels

All alerts route to the `alert-receiver` notification channel, which is a webhook pointing to our alert-receiver Cloud Run service. The alert-receiver processes alerts and forwards them to Slack.

The notification channel is configured automatically by `scripts/provision-alerts.sh`.

## Relationship to services/alert-receiver/alert-rules/

The `services/alert-receiver/alert-rules/` directory contains the canonical alert rules that are provisioned by the `scripts/provision-alerts.sh` script. The files in this `configs/alerts/` directory serve as a standalone reference with additional documentation and may include alerts not yet added to the provisioning pipeline.

## Related Resources

- [`scripts/provision-alerts.sh`](../../scripts/provision-alerts.sh) -- automated alert provisioning
- [`services/alert-receiver/`](../../services/alert-receiver/) -- alert-receiver service (processes webhook notifications)
- [`docs/runbook.md`](../../docs/runbook.md) -- SigNoz login and API access
- [`docs/telemetry-setup.md`](../../docs/telemetry-setup.md) -- enabling telemetry for Claude Code
