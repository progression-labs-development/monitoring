import { Hono } from "hono";
import { getConfig } from "../config";
import { verifySignature } from "../github/verify";
import { createGitHubAuth } from "../github/auth";
import { createGitHubClient } from "../github/client";
import { checkStandards } from "../standards/checker";
import { mapToIncident, type ViolationContext } from "../incident/mapper";
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

  // Only process pushes to the default branch
  const defaultBranch = payload.repository.default_branch;
  if (payload.ref !== `refs/heads/${defaultBranch}`) {
    return c.json({ skipped: true, reason: "not default branch" }, 200);
  }

  if (!payload.installation) {
    return c.json({ error: "No installation context" }, 400);
  }

  const auth = createGitHubAuth(
    config.GITHUB_APP_ID,
    config.GITHUB_APP_PRIVATE_KEY,
  );
  const token = await auth.getInstallationToken(payload.installation.id);
  const githubClient = createGitHubClient(token);
  const incidentClient = createIncidentClient(config.INCIDENT_LEDGER_URL);

  const [owner, repo] = payload.repository.full_name.split("/");

  // Check if repo has standards.toml
  const standardsToml = await githubClient.getFileContent(
    owner,
    repo,
    "standards.toml",
    payload.after,
  );

  if (!standardsToml) {
    return c.json({ skipped: true, reason: "no standards.toml" }, 200);
  }

  // Collect all changed files across commits
  const changedFiles = new Set<string>();
  for (const commit of payload.commits) {
    for (const file of [...commit.added, ...commit.modified]) {
      changedFiles.add(file);
    }
  }

  if (changedFiles.size === 0) {
    return c.json({ skipped: true, reason: "no changed files" }, 200);
  }

  // Run standards check against changed files only
  const result = checkStandards(Array.from(changedFiles), standardsToml);

  if (result.violations.length === 0) {
    return c.json({
      processed: payload.commits.length,
      filesChecked: result.filesChecked,
      violations: 0,
      incidentsCreated: 0,
    });
  }

  const context: ViolationContext = {
    repository: payload.repository.full_name,
    branch: payload.ref,
    commitSha: payload.after,
    pusherName: payload.pusher.name,
    pusherEmail: payload.pusher.email,
  };

  const incidentPayload = mapToIncident(result, context);

  const openIncidents = await incidentClient.listOpenByType("standards_violation");
  const newPayloads = dedup([incidentPayload], openIncidents);

  const created = await createIncidents(incidentClient, newPayloads);

  return c.json({
    processed: payload.commits.length,
    filesChecked: result.filesChecked,
    violations: result.violations.length,
    incidentsCreated: created,
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
