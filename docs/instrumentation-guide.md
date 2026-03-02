# Application Instrumentation Guide

This guide covers how to instrument TypeScript (Node.js) and Python applications to send OpenTelemetry traces, metrics, and logs to our SigNoz instance.

## Common Configuration

All applications use the same set of environment variables to configure the OTLP exporter:

```bash
OTEL_SERVICE_NAME=my-service
OTEL_EXPORTER_OTLP_ENDPOINT=<SigNoz OTLP endpoint>
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>
OTEL_RESOURCE_ATTRIBUTES=team=engineering,environment=production
```

### Retrieving the SigNoz endpoint

```bash
# gRPC endpoint (port 4317) -- used by most SDKs
gcloud secrets versions access latest \
  --secret=monitoring-signoz-otlp-endpoint-secret-dev \
  --project=christopher-little-dev | jq -r .grpc

# HTTP endpoint (port 4318) -- alternative for environments that block gRPC
gcloud secrets versions access latest \
  --secret=monitoring-signoz-otlp-endpoint-secret-dev \
  --project=christopher-little-dev | jq -r .http
```

### Standard resource attributes

Every service should include these resource attributes:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `service.name` | Name of the service | `api`, `worker`, `web` |
| `service.version` | Deployed version/commit SHA | `1.2.3`, `abc1234` |
| `deployment.environment` | Environment name | `production`, `staging`, `development` |
| `team` | Owning team | `engineering`, `platform` |

Set these via `OTEL_RESOURCE_ATTRIBUTES`:

```bash
OTEL_RESOURCE_ATTRIBUTES=service.version=1.2.3,deployment.environment=production,team=engineering
```

Or configure them programmatically in your SDK setup.

---

## TypeScript (Node.js)

### Install dependencies

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/exporter-logs-otlp-grpc \
  @opentelemetry/api
```

### Setup: `instrumentation.ts`

Create this file and import it **first** in your application entry point:

```typescript
// src/instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'my-service',
  [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION || '0.0.0',
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
  'team': process.env.TEAM || 'engineering',
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 60_000,
  }),
  logRecordProcessor: new BatchLogRecordProcessor(new OTLPLogExporter()),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs instrumentation to reduce noise
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error shutting down OTel SDK:', err);
      process.exit(1);
    });
});
```

### Usage in application entry point

```typescript
// src/index.ts
import './instrumentation'; // Must be the first import

import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

app.listen({ port: 3000, host: '0.0.0.0' });
```

### Auto-instrumentation coverage

The `@opentelemetry/auto-instrumentations-node` package automatically instruments:

| Library | What is captured |
|---------|-----------------|
| `http` / `https` | Incoming and outgoing HTTP requests |
| Express / Fastify | Route-level spans with path parameters |
| `pg` (PostgreSQL) | Database queries with statement text |
| `mysql2` | Database queries |
| `redis` / `ioredis` | Redis commands |
| `mongodb` | MongoDB operations |
| `grpc` | gRPC client and server calls |
| `dns` | DNS lookups |
| `net` | TCP connections |

### Custom spans for business logic

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

async function processOrder(orderId: string): Promise<void> {
  return tracer.startActiveSpan('process-order', async (span) => {
    try {
      span.setAttribute('order.id', orderId);

      // Your business logic here
      const result = await validateOrder(orderId);
      span.setAttribute('order.valid', result.valid);

      if (!result.valid) {
        span.setStatus({ code: 2, message: 'Order validation failed' });
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Custom metrics

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-service');

const orderCounter = meter.createCounter('orders.processed', {
  description: 'Number of orders processed',
  unit: 'orders',
});

const orderDuration = meter.createHistogram('orders.duration', {
  description: 'Time to process an order',
  unit: 'ms',
});

function processOrder(orderId: string): void {
  const start = Date.now();
  orderCounter.add(1, { 'order.type': 'standard' });

  // ... process order ...

  orderDuration.record(Date.now() - start, { 'order.type': 'standard' });
}
```

### Environment variables

```bash
# Required
OTEL_SERVICE_NAME=my-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://<signoz-host>:4317
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>

# Optional
OTEL_RESOURCE_ATTRIBUTES=team=engineering,deployment.environment=production
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_LOG_LEVEL=info
```

---

## Python

### Install dependencies

```bash
pip install opentelemetry-sdk \
  opentelemetry-exporter-otlp-proto-grpc \
  opentelemetry-instrumentation
```

For auto-instrumentation of common libraries:

```bash
pip install opentelemetry-instrumentation-requests \
  opentelemetry-instrumentation-flask \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-sqlalchemy \
  opentelemetry-instrumentation-psycopg2 \
  opentelemetry-instrumentation-redis
```

### Setup: programmatic configuration

```python
# instrumentation.py
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
import os

resource = Resource.create({
    SERVICE_NAME: os.getenv("OTEL_SERVICE_NAME", "my-service"),
    SERVICE_VERSION: os.getenv("SERVICE_VERSION", "0.0.0"),
    "deployment.environment": os.getenv("DEPLOYMENT_ENV", "development"),
    "team": os.getenv("TEAM", "engineering"),
})

# Traces
tracer_provider = TracerProvider(resource=resource)
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter())
)
trace.set_tracer_provider(tracer_provider)

# Metrics
metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(),
    export_interval_millis=60_000,
)
meter_provider = MeterProvider(
    resource=resource,
    metric_readers=[metric_reader],
)
metrics.set_meter_provider(meter_provider)
```

### Usage in application entry point

```python
# app.py
import instrumentation  # Must be imported first

from flask import Flask

app = Flask(__name__)

@app.route("/health")
def health():
    return {"status": "ok"}
```

### Auto-instrumentation via CLI

Instead of programmatic setup, you can use the `opentelemetry-instrument` CLI wrapper:

```bash
opentelemetry-instrument \
  --service_name my-service \
  --traces_exporter otlp \
  --metrics_exporter otlp \
  --exporter_otlp_endpoint http://<signoz-host>:4317 \
  --exporter_otlp_protocol grpc \
  python app.py
```

Or with environment variables:

```bash
export OTEL_SERVICE_NAME=my-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://<signoz-host>:4317
export OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>
export OTEL_TRACES_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc

opentelemetry-instrument python app.py
```

### Custom spans

```python
from opentelemetry import trace

tracer = trace.get_tracer("my-service")

def process_order(order_id: str) -> None:
    with tracer.start_as_current_span("process-order") as span:
        span.set_attribute("order.id", order_id)

        result = validate_order(order_id)
        span.set_attribute("order.valid", result.valid)

        if not result.valid:
            span.set_status(trace.StatusCode.ERROR, "Order validation failed")
```

### Custom metrics

```python
from opentelemetry import metrics

meter = metrics.get_meter("my-service")

order_counter = meter.create_counter(
    "orders.processed",
    description="Number of orders processed",
    unit="orders",
)

order_duration = meter.create_histogram(
    "orders.duration",
    description="Time to process an order",
    unit="ms",
)

def process_order(order_id: str) -> None:
    import time
    start = time.time()
    order_counter.add(1, {"order.type": "standard"})

    # ... process order ...

    duration_ms = (time.time() - start) * 1000
    order_duration.record(duration_ms, {"order.type": "standard"})
```

### Environment variables

```bash
# Required
OTEL_SERVICE_NAME=my-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://<signoz-host>:4317
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>

# Optional
OTEL_RESOURCE_ATTRIBUTES=team=engineering,deployment.environment=production
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

---

## Verification

### Step 1: Check service appears in SigNoz

1. Open the SigNoz UI
2. Go to **Services** page
3. Your service should appear within 1-2 minutes of sending data
4. Click the service to see traces, metrics, and request rates

### Step 2: Verify traces

1. Go to **Traces** > **Explorer**
2. Filter by `service.name = <your-service>`
3. You should see recent spans with timing data

### Step 3: Check from the CLI

Use the verification script:

```bash
bash scripts/verify-telemetry.sh
```

### Common issues and fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| No data in SigNoz | SDK not initialized | Ensure instrumentation is imported first, before any other imports |
| No data in SigNoz | Wrong endpoint | Verify `OTEL_EXPORTER_OTLP_ENDPOINT` points to `<signoz-host>:4317` (gRPC) or `<signoz-host>:4318` (HTTP) |
| Partial traces | Missing auto-instrumentation package | Install the specific instrumentation package for your library (e.g., `@opentelemetry/instrumentation-pg`) |
| Connection refused | Firewall blocks port | Ensure port 4317 (gRPC) or 4318 (HTTP) is open on the SigNoz instance |
| Authentication error | Missing or wrong ingestion key | Verify `OTEL_EXPORTER_OTLP_HEADERS` includes `signoz-ingestion-key=<valid-key>` |
| Spans but no metrics | Metric exporter not configured | Ensure `PeriodicExportingMetricReader` (TS) or `PeriodicExportingMetricReader` (Python) is configured |
| High memory usage | Too many spans | Increase batch export interval or add sampling: `OTEL_TRACES_SAMPLER=parentbased_traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.1` |
| Service name wrong | Default service name used | Set `OTEL_SERVICE_NAME` or configure `service.name` in the Resource |

## Docker / Container deployments

When running in Docker, pass the environment variables:

```dockerfile
ENV OTEL_SERVICE_NAME=my-service
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-host:4317
ENV OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>
ENV OTEL_RESOURCE_ATTRIBUTES=team=engineering,deployment.environment=production
```

Or via `docker run`:

```bash
docker run \
  -e OTEL_SERVICE_NAME=my-service \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://signoz-host:4317 \
  -e "OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<key>" \
  -e "OTEL_RESOURCE_ATTRIBUTES=team=engineering,deployment.environment=production" \
  my-image
```

## Related Resources

- [Telemetry Setup](./telemetry-setup.md) -- enabling Claude Code telemetry
- [Runbook](./runbook.md) -- SigNoz infrastructure, credentials, and login
- [Observability Stack Spec](./spec/observability-stack.md) -- architecture overview
- [OpenTelemetry JS docs](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry Python docs](https://opentelemetry.io/docs/languages/python/)
- [SigNoz docs](https://signoz.io/docs/)
