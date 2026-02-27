import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClickHouseClient } from "@clickhouse/client";
import { z } from "zod";
import { ping } from "./tools/ping";
import { queryLogs, type QueryLogsParams } from "./tools/queryLogs";
import { queryTraces, type QueryTracesParams } from "./tools/queryTraces";
import { queryMetrics, type QueryMetricsParams } from "./tools/queryMetrics";
import { formatToolResult } from "./tools/shared";

const queryLogsSchema = {
  startTime: z.string().describe("Start time in ISO 8601 format"),
  endTime: z.string().describe("End time in ISO 8601 format"),
  limit: z.number().optional().describe("Max results (default 20, max 100)"),
  serviceName: z.string().optional().describe("Filter by service name"),
  severityMin: z
    .number()
    .optional()
    .describe("Minimum severity level (1-24)"),
  bodyContains: z.string().optional().describe("Search text in log body"),
  traceId: z.string().optional().describe("Filter by trace ID"),
};

const queryTracesSchema = {
  startTime: z.string().describe("Start time in ISO 8601 format"),
  endTime: z.string().describe("End time in ISO 8601 format"),
  limit: z.number().optional().describe("Max results (default 20, max 100)"),
  serviceName: z.string().optional().describe("Filter by service name"),
  operationName: z
    .string()
    .optional()
    .describe("Filter by operation/span name"),
  traceId: z.string().optional().describe("Filter by trace ID"),
  minDurationMs: z
    .number()
    .optional()
    .describe("Minimum span duration in milliseconds"),
  hasError: z.boolean().optional().describe("Filter to only error spans"),
  spanKind: z
    .number()
    .optional()
    .describe(
      "Filter by span kind (1=Internal, 2=Server, 3=Client, 4=Producer, 5=Consumer)",
    ),
};

const queryMetricsSchema = {
  startTime: z.string().describe("Start time in ISO 8601 format"),
  endTime: z.string().describe("End time in ISO 8601 format"),
  limit: z.number().optional().describe("Max results (default 20, max 100)"),
  metricName: z.string().describe("Metric name to query"),
  includeTimeSeries: z
    .boolean()
    .optional()
    .describe("Include time series sample data (default false)"),
};

// MCP SDK's tool() method has deep type inference issues with Zod optional
// fields (TS2589). We register query tools via a helper that casts away the
// problematic overload resolution while keeping runtime behaviour identical.
function registerTool<P>(
  server: McpServer,
  name: string,
  description: string,
  schema: Record<string, z.ZodType>,
  handler: (params: P) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
): void {
  (server.tool as Function)(name, description, schema, handler);
}

export function createMcpServer(clickhouse: ClickHouseClient): McpServer {
  const server = new McpServer({
    name: "monitoring-mcp",
    version: "0.1.0",
  });

  server.tool(
    "ping",
    "Check MCP server and ClickHouse connectivity",
    async () => {
      const result = await ping(clickhouse);
      return { content: [formatToolResult(result)] };
    },
  );

  registerTool<QueryLogsParams>(
    server,
    "query_logs",
    "Query SigNoz logs from ClickHouse",
    queryLogsSchema,
    async (params) => {
      const result = await queryLogs(clickhouse, params);
      return { content: [formatToolResult(result)] };
    },
  );

  registerTool<QueryTracesParams>(
    server,
    "query_traces",
    "Query SigNoz traces from ClickHouse",
    queryTracesSchema,
    async (params) => {
      const result = await queryTraces(clickhouse, params);
      return { content: [formatToolResult(result)] };
    },
  );

  registerTool<QueryMetricsParams>(
    server,
    "query_metrics",
    "Query SigNoz metrics from ClickHouse",
    queryMetricsSchema,
    async (params) => {
      const result = await queryMetrics(clickhouse, params);
      return { content: [formatToolResult(result)] };
    },
  );

  return server;
}
