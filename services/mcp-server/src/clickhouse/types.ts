export interface LogRow {
  timestamp: string;
  id: string;
  traceId: string;
  spanId: string;
  severityText: string;
  severityNumber: number;
  body: string;
  resourcesHost: string;
  resourcesService: string;
}

export interface TraceSpanRow {
  timestamp: string;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  serviceName: string;
  name: string;
  kind: number;
  durationNano: number;
  statusCode: number;
  statusMessage: string;
  hasError: boolean;
}

export interface MetricTimeSeriesRow {
  metricName: string;
  labels: string;
  fingerprint: string;
}

export interface MetricSampleRow {
  metricName: string;
  fingerprint: string;
  timestampMs: number;
  value: number;
}

export enum SpanKind {
  Unspecified = 0,
  Internal = 1,
  Server = 2,
  Client = 3,
  Producer = 4,
  Consumer = 5,
}
