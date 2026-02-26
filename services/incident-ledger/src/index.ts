import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getPool, closePool } from "./db/client";
import { runMigrations } from "./db/migrate";
import { health } from "./routes/health";
import { incidents } from "./routes/incidents";

const app = new Hono();

app.route("/", health);
app.route("/", incidents);

async function main() {
  const pool = await getPool();
  await runMigrations(pool);
  console.log("Migrations complete");

  const port = Number(process.env.PORT || 3000);
  console.log(`Incident ledger listening on :${port}`);
  serve({ fetch: app.fetch, port });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down");
  await closePool();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

export { app };
