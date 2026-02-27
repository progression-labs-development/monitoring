import type { ClickHouseClient } from "@clickhouse/client";
import { queryClickHouse } from "../clickhouse/client";
import { SIGNOZ_TABLES } from "../clickhouse/tables";
import type { MetricTimeSeriesRow, MetricSampleRow } from "../clickhouse/types";
import { clampLimit } from "./shared";

export interface QueryMetricsParams {
  startTime: string;
  endTime: string;
  limit?: number;
  metricName: string;
  includeTimeSeries?: boolean;
}

export interface QueryMetricsResult {
  timeSeries: MetricTimeSeriesRow[];
  samples?: MetricSampleRow[];
  query: { metricName: string; startTime: string; endTime: string; limit: number };
}

export async function queryMetrics(
  client: ClickHouseClient,
  params: QueryMetricsParams,
): Promise<QueryMetricsResult> {
  const limit = clampLimit(params.limit);
  const startMs = new Date(params.startTime).getTime();
  const endMs = new Date(params.endTime).getTime();

  const timeSeriesSql = `
    SELECT
      metric_name AS metricName,
      labels,
      fingerprint
    FROM ${SIGNOZ_TABLES.timeSeriesV4}
    WHERE metric_name = {metricName:String}
    LIMIT {limit:UInt32}
  `;

  const timeSeries = await queryClickHouse<MetricTimeSeriesRow>(
    client,
    timeSeriesSql,
    { metricName: params.metricName, limit },
  );

  let samples: MetricSampleRow[] | undefined;

  if (params.includeTimeSeries && timeSeries.length > 0) {
    const fingerprints = timeSeries.map((ts) => ts.fingerprint);

    const samplesSql = `
      SELECT
        metric_name AS metricName,
        fingerprint,
        unix_milli AS timestampMs,
        value
      FROM ${SIGNOZ_TABLES.samplesV4}
      WHERE metric_name = {metricName:String}
        AND fingerprint IN ({fingerprints:Array(UInt64)})
        AND unix_milli >= {startMs:Int64}
        AND unix_milli <= {endMs:Int64}
      ORDER BY unix_milli DESC
      LIMIT {limit:UInt32}
    `;

    samples = await queryClickHouse<MetricSampleRow>(client, samplesSql, {
      metricName: params.metricName,
      fingerprints,
      startMs,
      endMs,
      limit,
    });
  }

  return {
    timeSeries,
    ...(samples !== undefined ? { samples } : {}),
    query: {
      metricName: params.metricName,
      startTime: params.startTime,
      endTime: params.endTime,
      limit,
    },
  };
}
