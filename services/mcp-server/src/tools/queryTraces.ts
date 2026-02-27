import type { ClickHouseClient } from "@clickhouse/client";
import { queryClickHouse } from "../clickhouse/client";
import { SIGNOZ_TABLES } from "../clickhouse/tables";
import type { TraceSpanRow } from "../clickhouse/types";
import { toNanoTimestamp, clampLimit } from "./shared";

export interface QueryTracesParams {
  startTime: string;
  endTime: string;
  limit?: number;
  serviceName?: string;
  operationName?: string;
  traceId?: string;
  minDurationMs?: number;
  hasError?: boolean;
  spanKind?: number;
}

export interface QueryTracesResult {
  rows: TraceSpanRow[];
  count: number;
  query: { startTime: string; endTime: string; limit: number };
}

export async function queryTraces(
  client: ClickHouseClient,
  params: QueryTracesParams,
): Promise<QueryTracesResult> {
  const limit = clampLimit(params.limit);
  const startNano = toNanoTimestamp(params.startTime);
  const endNano = toNanoTimestamp(params.endTime);

  const conditions: string[] = [
    "timestamp >= {startNano:DateTime64(9)}",
    "timestamp <= {endNano:DateTime64(9)}",
  ];
  const queryParams: Record<string, unknown> = {
    startNano,
    endNano,
    limit,
  };

  if (params.serviceName) {
    conditions.push("serviceName = {serviceName:String}");
    queryParams.serviceName = params.serviceName;
  }

  if (params.operationName) {
    conditions.push("name = {operationName:String}");
    queryParams.operationName = params.operationName;
  }

  if (params.traceId) {
    conditions.push("traceID = {traceId:String}");
    queryParams.traceId = params.traceId;
  }

  if (params.minDurationMs !== undefined) {
    const minDurationNano = BigInt(params.minDurationMs) * 1_000_000n;
    conditions.push("durationNano >= {minDurationNano:UInt64}");
    queryParams.minDurationNano = String(minDurationNano);
  }

  if (params.hasError === true) {
    conditions.push("hasError = true");
  }

  if (params.spanKind !== undefined) {
    conditions.push("kind = {spanKind:Int32}");
    queryParams.spanKind = params.spanKind;
  }

  const sql = `
    SELECT
      timestamp,
      traceID AS traceId,
      spanID AS spanId,
      parentSpanID AS parentSpanId,
      serviceName,
      name,
      kind,
      durationNano,
      statusCode,
      statusMessage,
      hasError
    FROM ${SIGNOZ_TABLES.traces}
    WHERE ${conditions.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
  `;

  const rows = await queryClickHouse<TraceSpanRow>(client, sql, queryParams);

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
