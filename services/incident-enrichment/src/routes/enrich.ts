import { Hono } from "hono";
import { getConfig } from "../config";
import { enrichActor } from "../enrichment/enricher";
import type { RawActor } from "../enrichment/types";

const enrichRoute = new Hono();

/**
 * POST /enrich
 * Accepts a raw actor object and returns the enriched version.
 * Called as a step between detection and incident write.
 */
enrichRoute.post("/enrich", async (c) => {
  const config = getConfig();
  const body = await c.req.json<{ actor: RawActor }>();

  if (!body.actor) {
    return c.json({ error: "Missing actor field in request body" }, 400);
  }

  const enriched = await enrichActor(body.actor, {
    githubToken: config.GITHUB_TOKEN,
    slackToken: config.SLACK_TOKEN,
    ssoMappingUrl: config.SSO_MAPPING_URL,
  });

  return c.json({ actor: enriched });
});

/**
 * POST /enrich/batch
 * Accepts an array of raw actor objects and returns enriched versions.
 * Useful for post-processing multiple incidents at once.
 */
enrichRoute.post("/enrich/batch", async (c) => {
  const config = getConfig();
  const body = await c.req.json<{ actors: RawActor[] }>();

  if (!Array.isArray(body.actors)) {
    return c.json({ error: "Missing actors array in request body" }, 400);
  }

  const deps = {
    githubToken: config.GITHUB_TOKEN,
    slackToken: config.SLACK_TOKEN,
    ssoMappingUrl: config.SSO_MAPPING_URL,
  };

  const enriched = await Promise.all(
    body.actors.map((actor) => enrichActor(actor, deps)),
  );

  return c.json({ actors: enriched });
});

export { enrichRoute };
