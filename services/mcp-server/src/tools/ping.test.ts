import { describe, it, expect, vi } from "vitest";
import { ping } from "./ping";
import type { ClickHouseClient } from "@clickhouse/client";

function mockClient(success: boolean): ClickHouseClient {
  return {
    ping: vi.fn().mockResolvedValue({ success }),
  } as unknown as ClickHouseClient;
}

describe("ping tool", () => {
  it("returns ok when ClickHouse is healthy", async () => {
    const result = await ping(mockClient(true));

    expect(result.status).toBe("ok");
    expect(result.clickhouse).toBe(true);
    expect(result.timestamp).toBeDefined();
  });

  it("returns error when ClickHouse is unhealthy", async () => {
    const result = await ping(mockClient(false));

    expect(result.status).toBe("error");
    expect(result.clickhouse).toBe(false);
  });

  it("returns error when ClickHouse ping throws", async () => {
    const client = {
      ping: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as ClickHouseClient;

    const result = await ping(client);

    expect(result.status).toBe("error");
    expect(result.clickhouse).toBe(false);
  });
});
