import { getConfig } from "./config";
import { createClickHouseClient, pingClickHouse } from "./clickhouse/client";
import { createMcpServer } from "./server";
import { startHttpServer } from "./transport";

async function main(): Promise<void> {
  const config = getConfig();
  const clickhouse = createClickHouseClient(config.CLICKHOUSE_URL);

  const server = createMcpServer(clickhouse);
  await startHttpServer(server, config);
  console.log(`MCP server listening on port ${config.PORT}`);

  void pingClickHouse(clickhouse).then((healthy) => {
    if (healthy) {
      console.log("ClickHouse connectivity check passed");
      return;
    }
    console.warn("ClickHouse not reachable during startup health check");
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
