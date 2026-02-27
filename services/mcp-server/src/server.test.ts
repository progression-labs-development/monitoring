import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";
import type { ClickHouseClient } from "@clickhouse/client";

function mockClient(): ClickHouseClient {
  return {
    ping: vi.fn().mockResolvedValue({ success: true }),
    query: vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([]),
    }),
  } as unknown as ClickHouseClient;
}

async function setupClientServer() {
  const clickhouse = mockClient();
  const mcpServer = createMcpServer(clickhouse);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await mcpServer.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { client, clickhouse };
}

describe("createMcpServer", () => {
  it("lists all registered tools", async () => {
    const { client } = await setupClientServer();

    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    expect(toolNames).toContain("ping");
    expect(toolNames).toContain("query_logs");
    expect(toolNames).toContain("query_traces");
    expect(toolNames).toContain("query_metrics");
    expect(toolNames).toHaveLength(4);
  });

  it("ping tool returns ClickHouse status", async () => {
    const { client } = await setupClientServer();

    const result = await client.callTool({ name: "ping", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.clickhouse).toBe(true);
  });

  it("query_logs tool executes without error", async () => {
    const { client } = await setupClientServer();

    const result = await client.callTool({
      name: "query_logs",
      arguments: {
        startTime: "2024-01-01T00:00:00Z",
        endTime: "2024-01-02T00:00:00Z",
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.rows).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it("query_traces tool executes without error", async () => {
    const { client } = await setupClientServer();

    const result = await client.callTool({
      name: "query_traces",
      arguments: {
        startTime: "2024-01-01T00:00:00Z",
        endTime: "2024-01-02T00:00:00Z",
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.rows).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it("query_metrics tool executes without error", async () => {
    const { client } = await setupClientServer();

    const result = await client.callTool({
      name: "query_metrics",
      arguments: {
        startTime: "2024-01-01T00:00:00Z",
        endTime: "2024-01-02T00:00:00Z",
        metricName: "http_requests_total",
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.timeSeries).toEqual([]);
  });
});
