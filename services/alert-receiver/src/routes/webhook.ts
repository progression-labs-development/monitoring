import { Hono } from "hono";
import { getConfig } from "../config";
import { signozAlertSchema } from "../alert/types";
import { mapAlertToIncident } from "../alert/mapper";
import { dedup } from "../alert/dedup";
import {
  createIncidentClient,
  type IncidentClient,
  type IncidentPayload,
} from "../incident/client";

const webhookRoute = new Hono();

webhookRoute.post("/webhook", async (c) => {
  const config = getConfig();

  if (config.WEBHOOK_SECRET) {
    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${config.WEBHOOK_SECRET}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }

  const rawBody = await c.req.json();
  const parsed = signozAlertSchema.safeParse(rawBody);

  if (!parsed.success) {
    return c.json({ error: "Invalid payload", details: parsed.error.issues }, 400);
  }

  const payload = parsed.data;
  const incidentClient = createIncidentClient(config.INCIDENT_LEDGER_URL);

  const firingAlerts = payload.alerts.filter((a) => a.status === "firing");
  const resolvedAlerts = payload.alerts.filter((a) => a.status === "resolved");

  // Map firing alerts to incident payloads
  const incidentPayloads = firingAlerts.map(mapAlertToIncident);

  // Dedup against open incidents
  const openIncidents = incidentPayloads.length > 0
    ? await incidentClient.listOpenByType("alert_triggered")
    : [];
  const newPayloads = dedup(incidentPayloads, openIncidents);

  // Create new incidents
  const created = await createIncidents(incidentClient, newPayloads);

  // Auto-resolve matching open incidents for resolved alerts
  const resolved = await resolveMatchingIncidents(
    incidentClient,
    resolvedAlerts.map((a) => `signoz:${a.fingerprint}`),
    openIncidents,
  );

  return c.json({
    firing: firingAlerts.length,
    resolved_alerts: resolvedAlerts.length,
    incidents_created: created,
    incidents_resolved: resolved,
  });
});

async function createIncidents(
  client: IncidentClient,
  payloads: IncidentPayload[],
): Promise<number> {
  let created = 0;
  for (const payload of payloads) {
    await client.createIncident(payload);
    created++;
  }
  return created;
}

async function resolveMatchingIncidents(
  client: IncidentClient,
  resolvedFingerprints: string[],
  openIncidents: Array<{ id: string; fingerprint: string | null }>,
): Promise<number> {
  if (resolvedFingerprints.length === 0) return 0;

  const resolvedSet = new Set(resolvedFingerprints);
  let resolved = 0;

  for (const incident of openIncidents) {
    if (incident.fingerprint && resolvedSet.has(incident.fingerprint)) {
      await client.resolveIncident(incident.id, {
        resolution: "auto_resolved",
        source: "signoz_alert_cleared",
      });
      resolved++;
    }
  }

  return resolved;
}

export { webhookRoute };
