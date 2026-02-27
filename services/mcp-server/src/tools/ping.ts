import type { ClickHouseClient } from "@clickhouse/client";
import { pingClickHouse } from "../clickhouse/client";

export interface PingResult {
  status: "ok" | "error";
  clickhouse: boolean;
  timestamp: string;
}

export async function ping(client: ClickHouseClient): Promise<PingResult> {
  const clickhouse = await pingClickHouse(client);
  return {
    status: clickhouse ? "ok" : "error",
    clickhouse,
    timestamp: new Date().toISOString(),
  };
}
