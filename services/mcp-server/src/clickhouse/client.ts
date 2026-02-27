import { createClient, type ClickHouseClient } from "@clickhouse/client";

export function createClickHouseClient(url: string): ClickHouseClient {
  return createClient({ url });
}

export async function pingClickHouse(
  client: ClickHouseClient,
): Promise<boolean> {
  try {
    const result = await client.ping();
    return result.success;
  } catch {
    return false;
  }
}

export async function queryClickHouse<T>(
  client: ClickHouseClient,
  query: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const result = await client.query({
    query,
    query_params: params,
    format: "JSONEachRow",
  });
  return result.json<T>();
}
