import { Hono } from "hono";
import {
  queryEndpointUsage,
  queryCliToolUsage,
  generateReport,
} from "../aggregation/queries";

const usageRoute = new Hono();

/**
 * GET /usage/endpoints
 * Query API endpoint usage. Supports ?days=30 and ?max_hits=10 filters.
 */
usageRoute.get("/usage/endpoints", async (c) => {
  const days = Number(c.req.query("days") || 30);
  const maxHits = c.req.query("max_hits");

  try {
    let endpoints = await queryEndpointUsage(days);

    if (maxHits !== undefined) {
      const threshold = Number(maxHits);
      endpoints = endpoints.filter((e) => e.hitCount <= threshold);
    }

    return c.json({ data: endpoints, timeWindowDays: days });
  } catch (err) {
    console.error("Endpoint usage query failed:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

/**
 * GET /usage/cli
 * Query CLI tool usage. Supports ?days=30 and ?max_hits=10 filters.
 */
usageRoute.get("/usage/cli", async (c) => {
  const days = Number(c.req.query("days") || 30);
  const maxHits = c.req.query("max_hits");

  try {
    let cliTools = await queryCliToolUsage(days);

    if (maxHits !== undefined) {
      const threshold = Number(maxHits);
      cliTools = cliTools.filter((t) => t.hitCount <= threshold);
    }

    return c.json({ data: cliTools, timeWindowDays: days });
  } catch (err) {
    console.error("CLI usage query failed:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

/**
 * GET /usage/report
 * Generate a full usage report. Supports ?days=30 (default), 60, or 90.
 */
usageRoute.get("/usage/report", async (c) => {
  const days = Number(c.req.query("days") || 30);

  try {
    const report = await generateReport(days);
    return c.json(report);
  } catch (err) {
    console.error("Report generation failed:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

/**
 * GET /usage/dead-code
 * Return endpoints and CLI tools with zero usage over the specified window.
 * Supports ?days=30 (default), 60, or 90.
 */
usageRoute.get("/usage/dead-code", async (c) => {
  const days = Number(c.req.query("days") || 30);

  try {
    const [endpoints, cliTools] = await Promise.all([
      queryEndpointUsage(days),
      queryCliToolUsage(days),
    ]);

    const deadEndpoints = endpoints.filter((e) => e.classification === "never_used");
    const deadCliTools = cliTools.filter((t) => t.classification === "never_used");

    return c.json({
      timeWindowDays: days,
      deadEndpoints,
      deadCliTools,
      summary: {
        deadEndpoints: deadEndpoints.length,
        deadCliTools: deadCliTools.length,
      },
    });
  } catch (err) {
    console.error("Dead code query failed:", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

export { usageRoute };
