import { Hono } from "hono";
import { getPool } from "../db/client";
import {
  insertIncident,
  listIncidents,
  getIncident,
  claimIncident,
  resolveIncident,
} from "../db/queries";
import {
  createIncidentSchema,
  listIncidentsSchema,
  claimIncidentSchema,
  resolveIncidentSchema,
} from "../schema/validation";
import { emitEvent } from "../hooks/events";

const incidents = new Hono();

incidents.post("/incidents", async (c) => {
  const body = await c.req.json();
  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const pool = await getPool();
  const incident = await insertIncident(pool, parsed.data);
  emitEvent("incident.created", incident);
  return c.json(incident, 201);
});

incidents.get("/incidents", async (c) => {
  const query = c.req.query();
  const parsed = listIncidentsSchema.safeParse(query);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const pool = await getPool();
  const items = await listIncidents(pool, parsed.data);
  return c.json({ data: items, count: items.length });
});

incidents.get("/incidents/:id", async (c) => {
  const pool = await getPool();
  const incident = await getIncident(pool, c.req.param("id"));
  if (!incident) return c.json({ error: "Not found" }, 404);
  return c.json(incident);
});

incidents.patch("/incidents/:id/claim", async (c) => {
  const body = await c.req.json();
  const parsed = claimIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const pool = await getPool();
  const result = await claimIncident(pool, c.req.param("id"), parsed.data.claimed_by);
  if (!result.success) {
    // Either not found or already claimed
    const existing = await getIncident(pool, c.req.param("id"));
    if (!existing) return c.json({ error: "Not found" }, 404);
    return c.json({ error: "Already claimed", incident: existing }, 409);
  }

  emitEvent("incident.claimed", result.incident!);
  return c.json(result.incident);
});

incidents.patch("/incidents/:id/resolve", async (c) => {
  const body = await c.req.json();
  const parsed = resolveIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const pool = await getPool();
  const incident = await resolveIncident(
    pool,
    c.req.param("id"),
    parsed.data.outcome,
    parsed.data.status,
  );
  if (!incident) {
    const existing = await getIncident(pool, c.req.param("id"));
    if (!existing) return c.json({ error: "Not found" }, 404);
    return c.json({ error: "Cannot resolve — already resolved" }, 409);
  }

  emitEvent("incident.resolved", incident);
  return c.json(incident);
});

export { incidents };
