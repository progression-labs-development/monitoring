import { describe, it, expect, vi } from "vitest";
import { pingClickHouse, queryClickHouse } from "./client";
import type { ClickHouseClient } from "@clickhouse/client";

function mockClient(pingSuccess: boolean): ClickHouseClient {
  return {
    ping: vi.fn().mockResolvedValue({ success: pingSuccess }),
    query: vi.fn(),
  } as unknown as ClickHouseClient;
}

describe("pingClickHouse", () => {
  it("returns true when healthy", async () => {
    const client = mockClient(true);
    expect(await pingClickHouse(client)).toBe(true);
  });

  it("returns false when unhealthy", async () => {
    const client = mockClient(false);
    expect(await pingClickHouse(client)).toBe(false);
  });

  it("returns false when ping throws", async () => {
    const client = {
      ping: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as ClickHouseClient;
    expect(await pingClickHouse(client)).toBe(false);
  });
});

describe("queryClickHouse", () => {
  it("executes query and returns typed results", async () => {
    const rows = [{ id: "1", name: "test" }];
    const client = {
      query: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(rows),
      }),
    } as unknown as ClickHouseClient;

    const result = await queryClickHouse<{ id: string; name: string }>(
      client,
      "SELECT * FROM test WHERE id = {id:String}",
      { id: "1" },
    );

    expect(result).toEqual(rows);
    expect(client.query).toHaveBeenCalledWith({
      query: "SELECT * FROM test WHERE id = {id:String}",
      query_params: { id: "1" },
      format: "JSONEachRow",
    });
  });

  it("works without params", async () => {
    const rows: unknown[] = [];
    const client = {
      query: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(rows),
      }),
    } as unknown as ClickHouseClient;

    const result = await queryClickHouse(client, "SELECT 1");

    expect(result).toEqual([]);
    expect(client.query).toHaveBeenCalledWith({
      query: "SELECT 1",
      query_params: undefined,
      format: "JSONEachRow",
    });
  });
});
