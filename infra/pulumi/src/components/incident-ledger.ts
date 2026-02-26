import * as gcp from "@pulumi/gcp";
import { createDatabase, createContainer } from "@chrismlittle123/infra";
import type { DatabaseOutputs, ContainerOutputs } from "@chrismlittle123/infra";

export interface IncidentLedgerOptions {
  /**
   * Container image for the incident-ledger service
   * @example "europe-west2-docker.pkg.dev/monitoring/incident-ledger/app:latest"
   */
  image: string;
  /** URL to POST all incident events (agent-workflows webhook) */
  webhookAgentUrl?: string;
  /** Slack incoming webhook URL (high/critical incidents only) */
  slackWebhookUrl?: string;
}

export interface IncidentLedgerOutputs {
  db: DatabaseOutputs;
  registry: gcp.artifactregistry.Repository;
  container: ContainerOutputs;
}

export function createIncidentLedger(
  name: string,
  options: IncidentLedgerOptions,
): IncidentLedgerOutputs {
  // 1. Cloud SQL (PostgreSQL 16)
  const db = createDatabase(`${name}-db`, {
    size: "small",
    version: "16",
  });

  // 2. Artifact Registry (Docker format) for container images
  const registry = new gcp.artifactregistry.Repository(`${name}-registry`, {
    repositoryId: `${name}`,
    location: "europe-west2",
    format: "DOCKER",
    description: "Incident ledger container images",
  });

  // 3. Cloud Run service — link: [db] auto-grants Secret Manager access
  //    and injects DB env vars (host, port, database, username, password_secret_name)
  const environment: Record<string, string> = {};
  if (options.webhookAgentUrl) {
    environment.WEBHOOK_AGENT_URL = options.webhookAgentUrl;
  }
  if (options.slackWebhookUrl) {
    environment.SLACK_WEBHOOK_URL = options.slackWebhookUrl;
  }

  const container = createContainer(name, {
    image: options.image,
    port: 3000,
    link: [db],
    public: false,
    minInstances: 1,
    healthCheckPath: "/health",
    ...(Object.keys(environment).length > 0 && { environment }),
  });

  return { db, registry, container };
}
