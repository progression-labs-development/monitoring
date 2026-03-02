import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { health } from "./routes/health";
import { webhookRoute } from "./routes/webhook";

const app = new Hono();

app.route("/", health);
app.route("/", webhookRoute);

const port = Number(process.env.PORT || 3000);
console.log(`Rogue resource detector listening on :${port}`);
serve({ fetch: app.fetch, port });

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  process.exit(0);
});

export { app };
