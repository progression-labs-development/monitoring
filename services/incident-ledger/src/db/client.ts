import { Pool } from "pg";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let pool: Pool | null = null;

async function resolvePassword(): Promise<string> {
  const secretName = process.env.INCIDENT_LEDGER_DB_PASSWORD_SECRET_NAME;
  if (!secretName) {
    // Local dev: fall back to direct password env var
    const direct = process.env.INCIDENT_LEDGER_DB_PASSWORD;
    if (direct) return direct;
    throw new Error(
      "INCIDENT_LEDGER_DB_PASSWORD_SECRET_NAME or INCIDENT_LEDGER_DB_PASSWORD must be set",
    );
  }

  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `${secretName}/versions/latest`,
  });
  const payload = version.payload?.data;
  if (!payload) throw new Error(`Empty secret: ${secretName}`);
  return typeof payload === "string" ? payload : payload.toString();
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;

  const password = await resolvePassword();

  pool = new Pool({
    host: process.env.INCIDENT_LEDGER_DB_HOST,
    port: Number(process.env.INCIDENT_LEDGER_DB_PORT || 5432),
    database: process.env.INCIDENT_LEDGER_DB_DATABASE,
    user: process.env.INCIDENT_LEDGER_DB_USERNAME,
    password,
    max: 10,
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
