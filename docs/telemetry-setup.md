# Claude Code Telemetry Setup

This guide covers how to enable OpenTelemetry export from Claude Code sessions so that metrics, logs, and traces are sent to our SigNoz instance.

## Overview

Claude Code supports built-in OpenTelemetry telemetry. When enabled, each session emits:

- **Traces** -- spans for tool use, model calls, and session lifecycle
- **Metrics** -- token counts, cost, model usage, session duration
- **Logs** -- structured log events for session activity

Telemetry is injected via a `SessionStart` hook in the [`claude-config`](https://github.com/progression-labs-development/claude-config) repo. The hook writes environment variables to `$CLAUDE_ENV_FILE`, which Claude Code reads on startup.

## How It Works

```
SessionStart hook
       |
       v
  writes env vars to $CLAUDE_ENV_FILE
       |
       v
  Claude Code reads env vars
       |
       v
  OTLP gRPC export to SigNoz
       |
       v
  SigNoz ingests traces/metrics/logs
```

## Environment Variables

The following variables are injected by the SessionStart hook:

| Variable | Value | Purpose |
|----------|-------|---------|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `1` | Enables Claude Code's built-in telemetry |
| `OTEL_METRICS_EXPORTER` | `otlp` | Send metrics via OTLP |
| `OTEL_LOGS_EXPORTER` | `otlp` | Send logs via OTLP |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | Use gRPC transport (port 4317) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | SigNoz OTLP gRPC endpoint | Target for telemetry export |
| `OTEL_EXPORTER_OTLP_HEADERS` | `signoz-ingestion-key=<key>` | Authentication header for SigNoz |
| `OTEL_RESOURCE_ATTRIBUTES` | `team=...,org=palindrom,engineer=...` | Resource attributes for filtering |

## Hook Script

The hook script is located at [`configs/telemetry-hook.sh`](../configs/telemetry-hook.sh) in this repo. It should be deployed via the `claude-config` repo as a `SessionStart` hook.

The hook:

1. Retrieves the SigNoz ingestion key (via `SIGNOZ_KEY` env var or 1Password CLI)
2. Writes all required OTEL environment variables to `$CLAUDE_ENV_FILE`
3. Sets engineer-specific resource attributes for per-person dashboards

### Adding to claude-config

Copy the hook script into your claude-config settings:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "/path/to/telemetry-hook.sh"
      }
    ]
  }
}
```

## Distributing the SigNoz Ingestion Key

The `SIGNOZ_KEY` is required for authenticated telemetry export. We recommend distributing it via **1Password CLI**:

### Option 1: 1Password CLI (recommended)

The hook script automatically fetches the key from 1Password if `SIGNOZ_KEY` is not already set:

```bash
op read "op://Engineering/SigNoz/ingestion-key"
```

**Prerequisites:**
- Install 1Password CLI: `brew install --cask 1password-cli`
- Sign in: `eval $(op signin)`
- Ensure you have access to the "Engineering" vault

### Option 2: Environment variable

Set `SIGNOZ_KEY` in your shell profile (`.zshrc`, `.bashrc`):

```bash
export SIGNOZ_KEY="your-ingestion-key-here"
```

### Option 3: GCP Secret Manager

For CI/CD or automated environments, fetch from GCP Secret Manager:

```bash
export SIGNOZ_KEY=$(gcloud secrets versions access latest \
  --secret=monitoring-signoz-ingestion-key-secret-dev \
  --project=christopher-little-dev)
```

## Engineer-Specific Resource Attributes

The hook sets resource attributes that enable per-person filtering in SigNoz:

| Attribute | Source | Example |
|-----------|--------|---------|
| `engineer` | `$USER` | `chris` |
| `team` | `$PALINDROM_TEAM` (default: `engineering`) | `engineering` |
| `org` | hardcoded | `palindrom` |

These attributes appear on every trace, metric, and log emitted by Claude Code. Use them in SigNoz to:

- Build per-engineer dashboards
- Filter traces by team
- Set up per-person cost alerts
- Track individual usage patterns

### Setting your team

Add to your shell profile:

```bash
export PALINDROM_TEAM="platform"  # or: engineering, product, design
```

If not set, defaults to `engineering`.

## Verifying Telemetry Is Flowing

### Step 1: Check environment variables

After starting a Claude Code session with the hook enabled:

```bash
env | grep -E "OTEL|CLAUDE_CODE_ENABLE"
```

You should see all the variables listed in the table above.

### Step 2: Check SigNoz UI

1. Open the SigNoz UI (see `docs/runbook.md` for URL and credentials)
2. Navigate to **Services** page
3. Look for a `claude-code` service
4. Click into the service to see traces and metrics

### Step 3: Filter by your user

In the SigNoz trace explorer:

1. Go to **Traces** > **Explorer**
2. Add a filter: `resource.engineer = <your-username>`
3. You should see traces from your recent sessions

### Step 4: Run the verification script

```bash
bash scripts/verify-telemetry.sh
```

This script authenticates with SigNoz and queries for recent Claude Code service data. See [`scripts/verify-telemetry.sh`](../scripts/verify-telemetry.sh).

## Troubleshooting

### No telemetry data in SigNoz

| Check | How |
|-------|-----|
| Hook is running | Check `~/.claude/settings.json` for the `SessionStart` hook entry |
| Env vars are set | Run `env \| grep OTEL` inside a Claude Code session |
| `CLAUDE_CODE_ENABLE_TELEMETRY` is `1` | Run `echo $CLAUDE_CODE_ENABLE_TELEMETRY` |
| `SIGNOZ_KEY` is available | Run `op read "op://Engineering/SigNoz/ingestion-key"` or `echo $SIGNOZ_KEY` |
| `CLAUDE_ENV_FILE` exists | The hook only writes if this var is set by Claude Code |

### Endpoint unreachable

- Verify the SigNoz GCE instance is running: `gcloud compute instances list --project=christopher-little-dev`
- Check firewall allows gRPC traffic on port 4317
- Try a direct connection test: `grpcurl -plaintext <signoz-host>:4317 list`

### 1Password CLI errors

- Ensure you are signed in: `op whoami`
- Check vault access: `op vault list`
- Verify the item exists: `op item get "SigNoz" --vault "Engineering" --fields "ingestion-key"`

### Hook not executing

- Confirm the hook file is executable: `chmod +x telemetry-hook.sh`
- Check the hook path in `claude-config` settings is absolute
- Look at Claude Code session logs for hook execution errors

### Data appears delayed

Telemetry may take 1-2 minutes to appear in SigNoz after a session starts. The OTLP exporter batches data before sending. Refresh the SigNoz Services page after waiting.

## Retrieving the OTLP Endpoint

The SigNoz OTLP gRPC endpoint is stored in GCP Secret Manager:

```bash
gcloud secrets versions access latest \
  --secret=monitoring-signoz-otlp-endpoint-secret-dev \
  --project=christopher-little-dev | jq -r .grpc
```

This returns the endpoint in the format `<ip>:4317`.

## Related Resources

- [Runbook](./runbook.md) -- SigNoz infrastructure operations, secrets, credentials
- [Instrumentation Guide](./instrumentation-guide.md) -- instrumenting TypeScript and Python services
- [`configs/telemetry-hook.sh`](../configs/telemetry-hook.sh) -- the hook script source
- [`scripts/verify-telemetry.sh`](../scripts/verify-telemetry.sh) -- telemetry verification script
- [claude-config repo](https://github.com/progression-labs-development/claude-config) -- where the hook is deployed
