import { describe, it, expect, vi } from "vitest";
import { queryMetrics } from "./queryMetrics";
import type { ClickHouseClient } from "@clickhouse/client";
import type { MetricTimeSeriesRow, MetricSampleRow } from "../clickhouse/types";

function mockClient(
  timeSeriesRows: MetricTimeSeriesRow[] = [],
  sampleRows: MetricSampleRow[] = [],
): ClickHouseClient {
  const queryFn = vi.fn();
  // First call returns time series, second returns samples
  queryFn
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(timeSeriesRows) })
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(sampleRows) });

  return { query: queryFn } as unknown as ClickHouseClient;
}

function getQueryCalls(client: ClickHouseClient) {
  const mock = client.query as ReturnType<typeof vi.fn>;
  return mock.mock.calls.map(
    (c) => c[0] as { query: string; query_params: Record<string, unknown> },
  );
}

describe("queryMetrics", () => {
  const baseParams = {
    startTime: "2024-01-01T00:00:00Z",
    endTime: "2024-01-02T00:00:00Z",
    metricName: "http_requests_total",
  };

  it("queries time series by metric name", async () => {
    const client = mockClient();
    const result = await queryMetrics(client, baseParams);

    expect(result.timeSeries).toEqual([]);
    expect(result.samples).toBeUndefined();
    expect(result.query.metricName).toBe("http_requests_total");

    const calls = getQueryCalls(client);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("metric_name = {metricName:String}");
  });

  it("fetches samples when includeTimeSeries is true and time series exist", async () => {
    const ts: MetricTimeSeriesRow = {
      metricName: "http_requests_total",
      labels: '{"method":"GET"}',
      fingerprint: "12345",
    };
    const sample: MetricSampleRow = {
      metricName: "http_requests_total",
      fingerprint: "12345",
      timestampMs: 1704067200000,
      value: 42,
    };

    const client = mockClient([ts], [sample]);
    const result = await queryMetrics(client, {
      ...baseParams,
      includeTimeSeries: true,
    });

    expect(result.timeSeries).toEqual([ts]);
    expect(result.samples).toEqual([sample]);

    const calls = getQueryCalls(client);
    expect(calls).toHaveLength(2);
    expect(calls[1].query).toContain("fingerprint IN");
    expect(calls[1].query).toContain("unix_milli >= {startMs:Int64}");
  });

  it("skips samples when includeTimeSeries is true but no time series found", async () => {
    const client = mockClient([], []);
    const result = await queryMetrics(client, {
      ...baseParams,
      includeTimeSeries: true,
    });

    expect(result.timeSeries).toEqual([]);
    expect(result.samples).toBeUndefined();

    const calls = getQueryCalls(client);
    expect(calls).toHaveLength(1);
  });

  it("clamps limit to max 100", async () => {
    const client = mockClient();
    const result = await queryMetrics(client, {
      ...baseParams,
      limit: 500,
    });

    expect(result.query.limit).toBe(100);
  });
});
