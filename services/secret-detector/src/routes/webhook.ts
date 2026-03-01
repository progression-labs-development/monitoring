import { Hono } from "hono";
import { getConfig } from "../config";
import { verifySignature } from "../github/verify";
import { createGitHubAuth } from "../github/auth";
import { createDiffClient } from "../github/diff";
import { scanDiff } from "../detection/scanner";
import { mapToIncident, type SecretContext } from "../incident/mapper";
import { dedup } from "../incident/dedup";
import {
  createIncidentClient,
  type IncidentClient,
} from "../incident/client";
import type { PushWebhookPayload } from "../github/types";

const webhookRoute = new Hono();

webhookRoute.post("/webhook", async (c) => {
  const config = getConfig();
  const rawBody = await c.req.text();

  const signature = c.req.header("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = c.req.header("x-github-event");
  if (event !== "push") {
    return c.json({ skipped: true, reason: `event type: ${event}` }, 200);
  }

  const payload: PushWebhookPayload = JSON.parse(rawBody);

  // Skip tag pushes
  if (!payload.ref.startsWith("refs/heads/")) {
    return c.json({ skipped: true, reason: "not a branch push" }, 200);
  }

  if (!payload.installation) {
    return c.json({ error: "No installation context" }, 400);
  }

  const auth = createGitHubAuth(
    config.GITHUB_APP_ID,
    config.GITHUB_APP_PRIVATE_KEY,
  );
  const token = await auth.getInstallationToken(payload.installation.id);
  const diffClient = createDiffClient(token);
  const incidentClient = createIncidentClient(config.INCIDENT_LEDGER_URL);

  const [owner, repo] = payload.repository.full_name.split("/");
  const allFindings = [];

  for (const commit of payload.commits) {
    const rawDiff = await diffClient.fetchCommitDiff(owner, repo, commit.id);
    const findings = scanDiff(rawDiff);

    const context: SecretContext = {
      repository: payload.repository.full_name,
      branch: payload.ref,
      commitSha: commit.id,
      pusherName: payload.pusher.name,
      pusherEmail: payload.pusher.email,
    };

    const payloads = findings.map((f) => mapToIncident(f, context));
    allFindings.push(...payloads);
  }

  const openIncidents = await incidentClient.listOpenByType("secret_committed");
  const newPayloads = dedup(allFindings, openIncidents);

  const created = await createIncidents(incidentClient, newPayloads);

  return c.json({
    processed: payload.commits.length,
    findings: allFindings.length,
    incidents_created: created,
  });
});

async function createIncidents(
  client: IncidentClient,
  payloads: ReturnType<typeof mapToIncident>[],
): Promise<number> {
  let created = 0;
  for (const payload of payloads) {
    await client.createIncident(payload);
    created++;
  }
  return created;
}

export { webhookRoute };
