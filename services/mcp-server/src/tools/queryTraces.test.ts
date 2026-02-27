import { describe, it, expect, vi } from "vitest";
import { queryTraces } from "./queryTraces";
import type { ClickHouseClient } from "@clickhouse/client";
import type { TraceSpanRow } from "../clickhouse/types";

function mockClient(rows: TraceSpanRow[] = []): ClickHouseClient {
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

describe("queryTraces", () => {
  const baseParams = {
    startTime: "2024-01-01T00:00:00Z",
    endTime: "2024-01-02T00:00:00Z",
  };

  it("queries with time range and default limit", async () => {
    const client = mockClient();
    const result = await queryTraces(client, baseParams);

    expect(result.rows).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.query.limit).toBe(20);

    const call = getQueryCall(client);
    expect(call.query).toContain("LIMIT {limit:UInt32}");
  });

  it("adds serviceName filter", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, serviceName: "my-api" });

    const call = getQueryCall(client);
    expect(call.query).toContain("serviceName = {serviceName:String}");
    expect(call.query_params.serviceName).toBe("my-api");
  });

  it("adds operationName filter", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, operationName: "GET /users" });

    const call = getQueryCall(client);
    expect(call.query).toContain("name = {operationName:String}");
    expect(call.query_params.operationName).toBe("GET /users");
  });

  it("adds traceId filter", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, traceId: "abc123" });

    const call = getQueryCall(client);
    expect(call.query).toContain("traceID = {traceId:String}");
    expect(call.query_params.traceId).toBe("abc123");
  });

  it("adds minDurationMs filter converted to nanoseconds", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, minDurationMs: 500 });

    const call = getQueryCall(client);
    expect(call.query).toContain("durationNano >= {minDurationNano:UInt64}");
    expect(call.query_params.minDurationNano).toBe("500000000");
  });

  it("adds hasError filter", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, hasError: true });

    const call = getQueryCall(client);
    expect(call.query).toContain("hasError = true");
  });

  it("does not add hasError filter when false", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, hasError: false });

    const call = getQueryCall(client);
    expect(call.query).not.toContain("hasError = true");
  });

  it("adds spanKind filter", async () => {
    const client = mockClient();
    await queryTraces(client, { ...baseParams, spanKind: 2 });

    const call = getQueryCall(client);
    expect(call.query).toContain("kind = {spanKind:Int32}");
    expect(call.query_params.spanKind).toBe(2);
  });

  it("returns rows from ClickHouse", async () => {
    const row: TraceSpanRow = {
      timestamp: "2024-01-01T00:00:00Z",
      traceId: "trace_1",
      spanId: "span_1",
      parentSpanId: "",
      serviceName: "my-api",
      name: "GET /users",
      kind: 2,
      durationNano: 150000000,
      statusCode: 0,
      statusMessage: "",
      hasError: false,
    };
    const client = mockClient([row]);
    const result = await queryTraces(client, baseParams);

    expect(result.rows).toEqual([row]);
    expect(result.count).toBe(1);
  });
});
