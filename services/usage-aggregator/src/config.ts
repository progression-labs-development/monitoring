import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_DATABASE: z.string().default("signoz_traces"),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = configSchema.parse(process.env);
  }
  return config;
}

export function resetConfig(): void {
  config = null;
}
