import { Hono } from "hono";
import { runSweep } from "../sweep";

const sweepRoute = new Hono();

sweepRoute.post("/sweep", async (c) => {
  try {
    const result = await runSweep();
    const status = result.errors.length > 0 ? 207 : 200;
    return c.json(result, status);
  } catch (err) {
    console.error("Sweep failed:", err);
    return c.json(
      { error: (err as Error).message },
      500,
    );
  }
});

export { sweepRoute };
