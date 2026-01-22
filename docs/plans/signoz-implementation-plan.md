# Implementation Plan: Replace Grafana LGTM with Lightweight SigNoz

## Overview

Replace the current `grafana/otel-lgtm` placeholder with actual SigNoz, using a minimal resource configuration suitable for development/low-traffic workloads.

## Current State

- **File:** `infra/pulumi/src/components/signoz.ts`
- **Current image:** `grafana/otel-lgtm:latest` (NOT SigNoz)
- **Problem:** Misleading naming, data lost on restart (in-memory only)
- **EFS:** Already provisioned but not mounted

## Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ECS Cluster                          │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Task 1:         │  │ Task 2:                     │  │
│  │ ClickHouse      │  │ SigNoz + OTel Collector     │  │
│  │                 │  │                             │  │
│  │ Port: 8123,9000 │  │ Ports: 8080, 4317, 4318    │  │
│  │ CPU: 1 vCPU     │  │ CPU: 0.75 vCPU             │  │
│  │ Mem: 2 GB       │  │ Mem: 1.5 GB                │  │
│  │                 │  │                             │  │
│  │ EFS mounted     │  │                             │  │
│  └────────┬────────┘  └─────────────┬───────────────┘  │
│           │                         │                   │
│           └───────────┬─────────────┘                   │
│                       │                                 │
│              Service Discovery                          │
│              (CloudMap DNS)                             │
└───────────────────────┼─────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
    ┌────────┐    ┌────────┐    ┌────────┐
    │ ALB    │    │ ALB    │    │ ALB    │
    │ :3301  │    │ :4318  │    │ :4317  │
    │ (UI)   │    │ (HTTP) │    │ (gRPC) │
    └────────┘    └────────┘    └────────┘
```

## Resource Allocation (Lightweight)

| Service | vCPU | Memory | Monthly Cost |
|---------|------|--------|--------------|
| ClickHouse (single-node, no Zookeeper) | 1 | 2 GB | ~$35 |
| SigNoz Core + OTel Collector | 0.75 | 1.5 GB | ~$27 |
| **Total** | **1.75** | **3.5 GB** | **~$62/month** |

## Implementation Steps

### Phase 1: ClickHouse Service

1. **Create ClickHouse task definition**
   - Image: `clickhouse/clickhouse-server:24.1-alpine`
   - Single container (no Zookeeper for simplicity)
   - Mount EFS volume to `/var/lib/clickhouse`
   - Health check: `wget --spider -q localhost:8123/ping`

2. **Create ClickHouse ECS service**
   - Register with Cloud Map as `clickhouse.signoz.local`
   - Internal only (no ALB exposure)

3. **Add EFS IAM permissions**
   - Task role needs `elasticfilesystem:ClientMount` and `ClientWrite`

### Phase 2: SigNoz Service

4. **Run schema migrator (one-time)**
   - Image: `signoz/signoz-schema-migrator:0.111.16`
   - Creates required ClickHouse tables

5. **Create SigNoz task definition**
   - Container 1: `signoz/signoz:0.69.0` (unified frontend + query service)
     - Port 8080 (UI + API)
   - Container 2: `signoz/signoz-otel-collector:0.111.16`
     - Ports 4317 (gRPC), 4318 (HTTP)
   - Environment: `ClickHouseUrl=tcp://clickhouse.signoz.local:9000`

6. **Create SigNoz ECS service**
   - Register with Cloud Map as `signoz.signoz.local`
   - ALB target groups for ports 8080, 4317, 4318

### Phase 3: ALB Updates

7. **Update target groups**
   - UI: port 3301 → container 8080, health check `/api/v1/health`
   - OTLP HTTP: port 4318 → container 4318
   - OTLP gRPC: port 4317 → container 4317 (requires NLB or ALB with gRPC)

### Phase 4: Cleanup

8. **Remove old resources**
   - Delete Grafana LGTM task definition
   - Update security group rules for new ports

9. **Update outputs**
   - `signozUrl` → `http://{alb}:3301`
   - `otelHttpEndpoint` → `http://{alb}:4318`
   - `otelGrpcEndpoint` → `http://{alb}:4317`

## Files to Modify

- `infra/pulumi/src/components/signoz.ts` - Complete rewrite
- `infra/pulumi/src/index.ts` - May need to update SignozOutputs interface

## Security Group Rules

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 8123 | TCP | VPC (10.0.0.0/16) | ClickHouse HTTP |
| 9000 | TCP | VPC (10.0.0.0/16) | ClickHouse native |
| 8080 | TCP | ALB SG | SigNoz UI/API |
| 4317 | TCP | 0.0.0.0/0 | OTLP gRPC |
| 4318 | TCP | 0.0.0.0/0 | OTLP HTTP |

## Verification

1. Check ClickHouse health: `curl http://clickhouse:8123/ping`
2. Check SigNoz UI: `http://{alb}:3301`
3. Send test trace:
   ```bash
   curl -X POST http://{alb}:4318/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}'
   ```
4. Verify trace appears in SigNoz UI

## Rollback Plan

If issues arise:
1. Scale SigNoz services to 0
2. Redeploy Grafana LGTM from git history
3. ClickHouse data remains on EFS for future retry

## Estimated Timeline

- Phase 1 (ClickHouse): 1-2 hours
- Phase 2 (SigNoz): 1-2 hours
- Phase 3 (ALB): 30 minutes
- Phase 4 (Cleanup): 30 minutes
- **Total: 3-5 hours**
