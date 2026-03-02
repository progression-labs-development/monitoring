import { getConfig } from "../config";
import { classify } from "./classifier";
import type {
  EndpointUsage,
  CliToolUsage,
  UsageReport,
  ClassificationThresholds,
} from "./types";

interface ClickHouseRow {
  service: string;
  method?: string;
  path?: string;
  tool?: string;
  command?: string;
  hit_count: string;
  last_seen: string | null;
}

/**
 * Query ClickHouse for API endpoint usage aggregated over a time window.
 */
export async function queryEndpointUsage(
  days: number,
  thresholds?: ClassificationThresholds,
): Promise<EndpointUsage[]> {
  const config = getConfig();
  const query = `
    SELECT
      serviceName AS service,
      httpMethod AS method,
      httpRoute AS path,
      count() AS hit_count,
      max(timestamp) AS last_seen
    FROM ${config.CLICKHOUSE_DATABASE}.signoz_index_v2
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND httpRoute != ''
      AND kind = 2
    GROUP BY serviceName, httpMethod, httpRoute
    ORDER BY hit_count DESC
  `;

  const rows = await executeQuery<ClickHouseRow>(config.CLICKHOUSE_URL, query);

  return rows.map((row) => ({
    service: row.service,
    method: row.method ?? "UNKNOWN",
    path: row.path ?? "/unknown",
    hitCount: parseInt(row.hit_count, 10),
    lastSeen: row.last_seen,
    classification: classify(parseInt(row.hit_count, 10), thresholds),
  }));
}

/**
 * Query ClickHouse for CLI tool usage aggregated over a time window.
 */
export async function queryCliToolUsage(
  days: number,
  thresholds?: ClassificationThresholds,
): Promise<CliToolUsage[]> {
  const config = getConfig();
  const query = `
    SELECT
      serviceName AS tool,
      name AS command,
      count() AS hit_count,
      max(timestamp) AS last_seen
    FROM ${config.CLICKHOUSE_DATABASE}.signoz_index_v2
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND kind = 1
      AND stringTagMap['cli.tool'] != ''
    GROUP BY serviceName, name
    ORDER BY hit_count DESC
  `;

  const rows = await executeQuery<ClickHouseRow>(config.CLICKHOUSE_URL, query);

  return rows.map((row) => ({
    tool: row.tool ?? row.service,
    command: row.command ?? "unknown",
    hitCount: parseInt(row.hit_count, 10),
    lastSeen: row.last_seen,
    classification: classify(parseInt(row.hit_count, 10), thresholds),
  }));
}

/**
 * Generate a full usage report for the given time window.
 */
export async function generateReport(
  days: number,
  thresholds?: ClassificationThresholds,
): Promise<UsageReport> {
  const [endpoints, cliTools] = await Promise.all([
    queryEndpointUsage(days, thresholds),
    queryCliToolUsage(days, thresholds),
  ]);

  return {
    timeWindowDays: days,
    generatedAt: new Date().toISOString(),
    endpoints,
    cliTools,
    summary: {
      totalEndpoints: endpoints.length,
      commonlyUsed: endpoints.filter((e) => e.classification === "commonly_used").length,
      rarelyUsed: endpoints.filter((e) => e.classification === "rarely_used").length,
      neverUsed: endpoints.filter((e) => e.classification === "never_used").length,
      totalCliTools: cliTools.length,
      cliCommonlyUsed: cliTools.filter((t) => t.classification === "commonly_used").length,
      cliRarelyUsed: cliTools.filter((t) => t.classification === "rarely_used").length,
      cliNeverUsed: cliTools.filter((t) => t.classification === "never_used").length,
    },
  };
}

async function executeQuery<T>(
  clickhouseUrl: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(clickhouseUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: `${query} FORMAT JSON`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickHouse query failed (${res.status}): ${body}`);
  }

  const result = (await res.json()) as { data: T[] };
  return result.data;
}
