import { describe, it, expect, vi } from "vitest";
import { queryLogs } from "./queryLogs";
import type { ClickHouseClient } from "@clickhouse/client";
import type { LogRow } from "../clickhouse/types";

function mockClient(rows: LogRow[] = []): ClickHouseClient {
  return {
    query: vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(rows),
    }),
  } as unknown as ClickHouseClient;
}

function getQueryCall(client: ClickHouseClient) {
  const mock = client.query as ReturnType<typeof vi.fn>;
  return mock.mock.calls[0][0] as { query: string; query_params: Record<string, unknown> };
}

describe("queryLogs", () => {
  const baseParams = {
    startTime: "2024-01-01T00:00:00Z",
    endTime: "2024-01-02T00:00:00Z",
  };

  it("queries with time range and default limit", async () => {
    const client = mockClient();
    const result = await queryLogs(client, baseParams);

    expect(result.rows).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.query.limit).toBe(20);

    const call = getQueryCall(client);
    expect(call.query).toContain("timestamp >= {startNano:UInt64}");
    expect(call.query).toContain("timestamp <= {endNano:UInt64}");
    expect(call.query).toContain("LIMIT {limit:UInt32}");
  });

  it("adds serviceName filter", async () => {
    const client = mockClient();
    await queryLogs(client, { ...baseParams, serviceName: "my-api" });

    const call = getQueryCall(client);
    expect(call.query).toContain("resources_string['service.name'] = {serviceName:String}");
    expect(call.query_params.serviceName).toBe("my-api");
  });

  it("adds severityMin filter", async () => {
    const client = mockClient();
    await queryLogs(client, { ...baseParams, severityMin: 9 });

    const call = getQueryCall(client);
    expect(call.query).toContain("severity_number >= {severityMin:UInt8}");
    expect(call.query_params.severityMin).toBe(9);
  });

  it("adds bodyContains filter with ILIKE", async () => {
    const client = mockClient();
    await queryLogs(client, { ...baseParams, bodyContains: "error" });

    const call = getQueryCall(client);
    expect(call.query).toContain("body ILIKE {bodyPattern:String}");
    expect(call.query_params.bodyPattern).toBe("%error%");
  });

  it("adds traceId filter", async () => {
    const client = mockClient();
    await queryLogs(client, { ...baseParams, traceId: "abc123" });

    const call = getQueryCall(client);
    expect(call.query).toContain("trace_id = {traceId:String}");
    expect(call.query_params.traceId).toBe("abc123");
  });

  it("clamps limit to max 100", async () => {
    const client = mockClient();
    const result = await queryLogs(client, { ...baseParams, limit: 500 });

    expect(result.query.limit).toBe(100);
  });

  it("returns rows from ClickHouse", async () => {
    const row: LogRow = {
      timestamp: "1704067200000000000",
      id: "log_1",
      traceId: "trace_1",
      spanId: "span_1",
      severityText: "ERROR",
      severityNumber: 17,
      body: "Something failed",
      resourcesHost: "host-1",
      resourcesService: "my-api",
    };
    const client = mockClient([row]);
    const result = await queryLogs(client, baseParams);

    expect(result.rows).toEqual([row]);
    expect(result.count).toBe(1);
  });
});
