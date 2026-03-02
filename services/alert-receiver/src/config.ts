import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  INCIDENT_LEDGER_URL: z.string().url(),
  WEBHOOK_SECRET: z.string().min(1).optional(),
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
