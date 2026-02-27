import { z } from "zod";

const configSchema = z.object({
  CLICKHOUSE_URL: z.string().url().default("http://localhost:8123"),
  MCP_API_KEY: z.string().min(1, "MCP_API_KEY is required"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = configSchema.parse(process.env);
  }
  return config;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  return configSchema.parse(env);
}
