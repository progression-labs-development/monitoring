import { describe, it, expect, afterAll } from "vitest";
import type { Server } from "node:http";
import { startHttpServer } from "./transport";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config";

function getTestConfig(): Config {
  return {
    CLICKHOUSE_URL: "http://localhost:8123",
    MCP_API_KEY: "test-secret-key",
    PORT: 0,
  };
}

function getPort(server: Server): number {
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

describe("HTTP transport", () => {
  const servers: Server[] = [];

  afterAll(async () => {
    for (const s of servers) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  it("returns 200 for unauthenticated /health", async () => {
    const config = getTestConfig();
    const mcpServer = new McpServer({ name: "test", version: "0.0.1" });
    const server = await startHttpServer(mcpServer, config);
    servers.push(server);

    const res = await fetch(`http://localhost:${getPort(server)}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("returns 401 for missing auth header", async () => {
    const config = getTestConfig();
    const mcpServer = new McpServer({ name: "test", version: "0.0.1" });
    const server = await startHttpServer(mcpServer, config);
    servers.push(server);

    const res = await fetch(`http://localhost:${getPort(server)}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong auth token", async () => {
    const config = getTestConfig();
    const mcpServer = new McpServer({ name: "test", version: "0.0.1" });
    const server = await startHttpServer(mcpServer, config);
    servers.push(server);

    const res = await fetch(`http://localhost:${getPort(server)}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-key",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});
