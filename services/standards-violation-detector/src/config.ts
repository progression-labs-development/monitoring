import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  INCIDENT_LEDGER_URL: z.string().url(),
  GITHUB_APP_ID: z.coerce.number(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
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
