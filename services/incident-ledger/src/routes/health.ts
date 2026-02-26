import { Hono } from "hono";
import { getPool } from "../db/client";

const health = new Hono();

health.get("/health", async (c) => {
  try {
    const pool = await getPool();
    await pool.query("SELECT 1");
    return c.json({ status: "ok" });
  } catch {
    return c.json({ status: "error" }, 503);
  }
});

export { health };
