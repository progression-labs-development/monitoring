import { getConfig } from "./config";
import { createClickHouseClient, pingClickHouse } from "./clickhouse/client";
import { createMcpServer } from "./server";
import { startHttpServer } from "./transport";

async function main(): Promise<void> {
  const config = getConfig();
  const clickhouse = createClickHouseClient(config.CLICKHOUSE_URL);

  const maxAttempts = 30;
  const delayMs = 2000;
  let healthy = false;

  for (let i = 1; i <= maxAttempts; i++) {
    healthy = await pingClickHouse(clickhouse);
    if (healthy) {
      console.log(`ClickHouse healthy after ${i} attempt(s)`);
      break;
    }
    if (i < maxAttempts) {
      console.log(
        `ClickHouse not ready (attempt ${i}/${maxAttempts}), retrying in ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (!healthy) {
    console.error(
      `ClickHouse not reachable after ${maxAttempts} attempts, exiting`,
    );
    process.exit(1);
  }

  const server = createMcpServer(clickhouse);
  await startHttpServer(server, config);
  console.log(`MCP server listening on port ${config.PORT}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
