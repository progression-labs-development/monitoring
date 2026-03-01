# Claude Code Instructions

## Deployment

**ALWAYS deploy by pushing to GitHub on main branch.** The GitHub Actions workflow will automatically run Pulumi to deploy changes.

Do not attempt to run Pulumi locally - use the CI/CD pipeline.

## Infrastructure

- GCP resources are managed via Pulumi in `infra/pulumi/`
- Single environment in GCP project `christopher-little-dev`
- State is stored in GCS: `gs://pulumi-state-christopher-little-dev`
- Workload Identity Federation is configured for GitHub Actions to impersonate `github-actions-pulumi` service account

## Regenerating the Infrastructure Manifest

The `infra/pulumi/infra-manifest.json` file contains IDs of deployed GCP resources. To regenerate it:

```bash
cd infra/pulumi

GOOGLE_PROJECT=christopher-little-dev PULUMI_CONFIG_PASSPHRASE="" \
  pulumi login gs://pulumi-state-christopher-little-dev && \
  pulumi stack select dev && \
  pulumi stack export > /tmp/stack-export.json

# Generate manifest from export
node -e "
const infra = require('@progression-labs-development/infra');
const fs = require('fs');
const data = fs.readFileSync('/tmp/stack-export.json', 'utf-8');
const m = infra.parseStackExport(JSON.parse(data));
fs.writeFileSync('infra-manifest.json', JSON.stringify(m, null, 2));
console.log('Manifest regenerated with', m.resources.length, 'resources');
"
```

**Note:** Requires GCP credentials configured for the `christopher-little-dev` project.

## Secrets Management

### Naming Convention

Secrets follow the pattern: `{project}-{name}-secret-{env}`

Example: `monitoring-signoz-otlp-endpoint-secret-dev`

### Current Secrets

| Secret | Managed By | Description |
|--------|-----------|-------------|
| `monitoring-signoz-otlp-endpoint-secret-dev` | Pulumi (`createSecret`) | SigNoz OTLP endpoints (HTTP + gRPC) |
| `monitoring-signoz-admin-credentials-secret-dev` | Pulumi (`createSecret`) | SigNoz admin email, password, and URL |

All secrets are created via `createSecret` in `infra/pulumi/src/index.ts`. Pulumi keeps values in sync with infrastructure on every `pulumi up`.

The admin password is auto-generated via `@pulumi/random.RandomPassword` and the admin account is auto-registered on first boot via the GCE startup script.

### Verifying Secrets

```bash
# Check OTLP endpoints
gcloud secrets versions access latest \
  --secret=monitoring-signoz-otlp-endpoint-secret-dev \
  --project=christopher-little-dev | jq .

# Check admin credentials
gcloud secrets versions access latest \
  --secret=monitoring-signoz-admin-credentials-secret-dev \
  --project=christopher-little-dev | jq .
```

### SigNoz Login

Retrieve credentials from GCP Secret Manager (see above) and use the v2 session API:

```bash
# Get credentials
CREDS=$(gcloud secrets versions access latest \
  --secret=monitoring-signoz-admin-credentials-secret-dev \
  --project=christopher-little-dev)
URL=$(echo $CREDS | jq -r .url)
EMAIL=$(echo $CREDS | jq -r .email)
PASSWORD=$(echo $CREDS | jq -r .password)

# Get session context (for org ID)
ORG_ID=$(curl -s "$URL/api/v2/sessions/context?email=$EMAIL&ref=$URL" | jq -r '.data.orgs[0].id')

# Login
curl -s "$URL/api/v2/sessions/email_password" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"orgID\":\"$ORG_ID\"}"
```

## Destroying Resources

To tear down all resources, use the destroy workflow:

```bash
gh workflow run destroy.yml

# Monitor the workflow
gh run watch <run-id>
```

## Claude Code Telemetry

Claude Code sessions emit OpenTelemetry metrics and logs to SigNoz via the OTLP gRPC endpoint. Telemetry injection is handled by a `SessionStart` hook in the [`claude-config`](https://github.com/progression-labs-development/claude-config) repo.

### Environment Variables

The following env vars must be set (written to `$CLAUDE_ENV_FILE` by the SessionStart hook):

| Variable | Value | Purpose |
|----------|-------|---------|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `1` | Enables Claude Code's built-in telemetry |
| `OTEL_METRICS_EXPORTER` | `otlp` | Send metrics via OTLP |
| `OTEL_LOGS_EXPORTER` | `otlp` | Send logs via OTLP |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | Use gRPC transport |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(from Secret Manager)* | SigNoz OTLP gRPC endpoint |
| `OTEL_RESOURCE_ATTRIBUTES` | `team=engineering,org=palindrom` | Resource attributes for filtering |

### Retrieving the OTLP Endpoint

The gRPC endpoint is stored in GCP Secret Manager:

```bash
gcloud secrets versions access latest \
  --secret=monitoring-signoz-otlp-endpoint-secret-dev \
  --project=christopher-little-dev | jq -r .grpc
```

### Manual Testing

To manually verify telemetry from a single session:

```bash
# 1. Fetch the OTLP gRPC endpoint
OTLP_GRPC=$(gcloud secrets versions access latest \
  --secret=monitoring-signoz-otlp-endpoint-secret-dev \
  --project=christopher-little-dev | jq -r .grpc)

# 2. Export env vars
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT="$OTLP_GRPC"
export OTEL_RESOURCE_ATTRIBUTES="team=engineering,org=palindrom"

# 3. Run a Claude Code session
claude

# 4. Check the SigNoz UI → Services page for a "claude-code" service
```

### Verifying Telemetry

Use the verification script to confirm data is flowing:

```bash
bash scripts/verify-telemetry.sh
```

The script fetches SigNoz admin credentials, logs in via the API, and queries for recent Claude Code service data. See [scripts/verify-telemetry.sh](../scripts/verify-telemetry.sh).

### Troubleshooting

| Symptom | Check |
|---------|-------|
| No data in SigNoz | Confirm `CLAUDE_CODE_ENABLE_TELEMETRY=1` is set in the session. Run `env | grep OTEL` to verify all vars. |
| Endpoint unreachable | Verify the GCE instance is running and the firewall allows gRPC (port 4317). Check `gcloud compute instances list`. |
| Secret access fails | Ensure `gcloud` is authenticated and has `secretmanager.versions.access` permission on the project. |
| Service not appearing | Telemetry may take 1-2 minutes to appear. Refresh the SigNoz Services page. |
| Hook not running | Check `~/.claude/settings.json` for the `SessionStart` hook. See the [claude-config](https://github.com/progression-labs-development/claude-config) repo. |

## Resource Sizing

| Component | Size | Instance Type | RAM |
|-----------|------|---------------|-----|
| SigNoz GCE | medium | e2-medium | 4GB |

**Note:** SigNoz requires at least `medium` size. The `small` size (e2-small, 2GB) is insufficient to run ClickHouse + OTel collector + query service.
