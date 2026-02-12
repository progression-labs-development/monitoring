import { describe, it, expect, vi } from "vitest";
import { createMcpServer } from "../../src/server.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ClickHouseClient } from "@clickhouse/client";

function mockClient(success: boolean): ClickHouseClient {
  return {
    ping: vi.fn().mockResolvedValue({ success }),
  } as unknown as ClickHouseClient;
}

describe("createMcpServer", () => {
  it("creates a server with ping tool", () => {
    const client = mockClient(true);
    const server = createMcpServer(client);

    expect(server).toBeDefined();
  });

  it("ping tool returns ClickHouse status via MCP protocol", async () => {
    const client = mockClient(true);
    const server = createMcpServer(client);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    const mcpClient = new Client({ name: "test-client", version: "0.0.1" });

    await Promise.all([
      mcpClient.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const result = await mcpClient.callTool({ name: "ping" });

    expect(result.content).toHaveLength(1);
    const text = (result.content as Array<{ type: string; text: string }>)[0]
      .text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("ok");
    expect(parsed.clickhouse).toBe(true);
    expect(parsed.timestamp).toBeDefined();

    await mcpClient.close();
  });
});
