import type { ClickHouseClient } from "@clickhouse/client";
import { queryClickHouse } from "../clickhouse/client";
import { SIGNOZ_TABLES } from "../clickhouse/tables";
import type { LogRow } from "../clickhouse/types";
import { toNanoTimestamp, clampLimit } from "./shared";

export interface QueryLogsParams {
  startTime: string;
  endTime: string;
  limit?: number;
  serviceName?: string;
  severityMin?: number;
  bodyContains?: string;
  traceId?: string;
}

export interface QueryLogsResult {
  rows: LogRow[];
  count: number;
  query: { startTime: string; endTime: string; limit: number };
}

export async function queryLogs(
  client: ClickHouseClient,
  params: QueryLogsParams,
): Promise<QueryLogsResult> {
  const limit = clampLimit(params.limit);
  const startNano = toNanoTimestamp(params.startTime);
  const endNano = toNanoTimestamp(params.endTime);

  const conditions: string[] = [
    "timestamp >= {startNano:UInt64}",
    "timestamp <= {endNano:UInt64}",
  ];
  const queryParams: Record<string, unknown> = {
    startNano,
    endNano,
    limit,
  };

  if (params.serviceName) {
    conditions.push("resources_string['service.name'] = {serviceName:String}");
    queryParams.serviceName = params.serviceName;
  }

  if (params.severityMin !== undefined) {
    conditions.push("severity_number >= {severityMin:UInt8}");
    queryParams.severityMin = params.severityMin;
  }

  if (params.bodyContains) {
    conditions.push("body ILIKE {bodyPattern:String}");
    queryParams.bodyPattern = `%${params.bodyContains}%`;
  }

  if (params.traceId) {
    conditions.push("trace_id = {traceId:String}");
    queryParams.traceId = params.traceId;
  }

  const sql = `
    SELECT
      timestamp,
      id,
      trace_id AS traceId,
      span_id AS spanId,
      severity_text AS severityText,
      severity_number AS severityNumber,
      body,
      resources_string['host.name'] AS resourcesHost,
      resources_string['service.name'] AS resourcesService
    FROM ${SIGNOZ_TABLES.logs}
    WHERE ${conditions.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
  `;

  const rows = await queryClickHouse<LogRow>(client, sql, queryParams);

  return {
    rows,
    count: rows.length,
    query: {
      startTime: params.startTime,
      endTime: params.endTime,
      limit,
    },
  };
}
