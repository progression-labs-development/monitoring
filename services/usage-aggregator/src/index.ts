import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { health } from "./routes/health";
import { usageRoute } from "./routes/usage";

const app = new Hono();

app.route("/", health);
app.route("/", usageRoute);

const port = Number(process.env.PORT || 3000);
console.log(`Usage aggregator listening on :${port}`);
serve({ fetch: app.fetch, port });

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  process.exit(0);
});

export { app };
