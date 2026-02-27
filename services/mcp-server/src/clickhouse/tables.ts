export const SIGNOZ_TABLES = {
  logs: "signoz_logs.distributed_logs",
  logResources: "signoz_logs.distributed_logs_v2_resource",
  traces: "signoz_traces.distributed_signoz_index_v3",
  traceSpans: "signoz_traces.distributed_signoz_spans",
  timeSeriesV4: "signoz_metrics.distributed_time_series_v4_1day",
  samplesV4: "signoz_metrics.distributed_samples_v4",
} as const;

export type SignozTable = (typeof SIGNOZ_TABLES)[keyof typeof SIGNOZ_TABLES];
