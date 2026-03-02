import { Hono } from "hono";
import { getConfig } from "../config";
import { parseCloudTrailEvent, parseGcpAuditLogEvent } from "../events/parser";
import { checkPulumiState, isDeploymentActive } from "../pulumi/stateChecker";
import { toRogueIncident, toDriftIncident } from "../incident/mapper";
import { dedup } from "../incident/dedup";
import { createIncidentClient } from "../incident/client";
import type { CloudTrailEvent, GcpAuditLogEvent } from "../events/types";

const webhookRoute = new Hono();

/**
 * POST /webhook/cloudtrail
 * Receives AWS CloudTrail events via EventBridge.
 */
webhookRoute.post("/webhook/cloudtrail", async (c) => {
  const config = getConfig();
  const body = await c.req.json<CloudTrailEvent>();

  // Ignore events during active Pulumi deployments
  if (config.DEPLOYMENT_LOCK_URL) {
    const deploying = await isDeploymentActive(config.DEPLOYMENT_LOCK_URL);
    if (deploying) {
      return c.json({ skipped: true, reason: "deployment in progress" }, 200);
    }
  }

  const event = parseCloudTrailEvent(body);
  if (!event) {
    return c.json({ skipped: true, reason: "non-create event" }, 200);
  }

  const stateResult = await checkPulumiState(config.PULUMI_STATE_URL, event.resourceId);
  const payload = stateResult.exists
    ? toDriftIncident(event)
    : toRogueIncident(event);

  const incidentType = stateResult.exists ? "drift" : "rogue_resource";

  const client = createIncidentClient(config.INCIDENT_LEDGER_URL);
  const openIncidents = await client.listOpenByType(incidentType);
  const newPayloads = dedup([payload], openIncidents);

  let created = 0;
  for (const p of newPayloads) {
    await client.createIncident(p);
    created++;
  }

  return c.json({
    cloud: "aws",
    eventName: event.eventName,
    resourceId: event.resourceId,
    classification: stateResult.exists ? "drift" : "rogue",
    incidentsCreated: created,
  });
});

/**
 * POST /webhook/gcp-audit
 * Receives GCP Audit Log events via Pub/Sub push subscription.
 */
webhookRoute.post("/webhook/gcp-audit", async (c) => {
  const config = getConfig();
  const body = await c.req.json<GcpAuditLogEvent>();

  // Ignore events during active Pulumi deployments
  if (config.DEPLOYMENT_LOCK_URL) {
    const deploying = await isDeploymentActive(config.DEPLOYMENT_LOCK_URL);
    if (deploying) {
      return c.json({ skipped: true, reason: "deployment in progress" }, 200);
    }
  }

  const event = parseGcpAuditLogEvent(body);
  if (!event) {
    return c.json({ skipped: true, reason: "non-create event" }, 200);
  }

  const stateResult = await checkPulumiState(config.PULUMI_STATE_URL, event.resourceId);
  const payload = stateResult.exists
    ? toDriftIncident(event)
    : toRogueIncident(event);

  const incidentType = stateResult.exists ? "drift" : "rogue_resource";

  const client = createIncidentClient(config.INCIDENT_LEDGER_URL);
  const openIncidents = await client.listOpenByType(incidentType);
  const newPayloads = dedup([payload], openIncidents);

  let created = 0;
  for (const p of newPayloads) {
    await client.createIncident(p);
    created++;
  }

  return c.json({
    cloud: "gcp",
    eventName: event.eventName,
    resourceId: event.resourceId,
    classification: stateResult.exists ? "drift" : "rogue",
    incidentsCreated: created,
  });
});

export { webhookRoute };
