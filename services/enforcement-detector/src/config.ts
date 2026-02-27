import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  EXPECTED_STATE_BUCKET: z.string().min(1),
  EXPECTED_STATE_PATH: z.string().default("expected-state.json"),
  INCIDENT_LEDGER_URL: z.string().url(),
  AWS_REGION: z.string().default("eu-west-2"),
  GCP_PROJECT: z.string().min(1),
  GCP_REGION: z.string().default("europe-west2"),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    config = configSchema.parse(process.env);
  }
  return config;
}
