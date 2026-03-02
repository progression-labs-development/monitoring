import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { createContainer, createSecret } from "@progression-labs-development/infra";
import type { ContainerOutputs } from "@progression-labs-development/infra";

export interface AlertReceiverOptions {
  /** Container image for the alert-receiver service */
  image: string;
  /** Internal URL of the incident ledger API */
  incidentLedgerUrl: pulumi.Input<string>;
  /** Webhook secret for authenticating SigNoz requests */
  webhookSecret: pulumi.Input<string>;
  /** GCP region (defaults to pulumi config) */
  gcpRegion?: string;
}

export interface AlertReceiverOutputs {
  registry: gcp.artifactregistry.Repository;
  container: ContainerOutputs;
  webhookSecretResource: ReturnType<typeof createSecret>;
  webhookUrlSecret: ReturnType<typeof createSecret>;
}

export function createAlertReceiver(
  name: string,
  options: AlertReceiverOptions,
): AlertReceiverOutputs {
  const config = new pulumi.Config("gcp");
  const gcpRegion = options.gcpRegion ?? config.require("region");

  // 1. Artifact Registry
  const registry = new gcp.artifactregistry.Repository(`${name}-registry`, {
    repositoryId: name,
    location: gcpRegion,
    format: "DOCKER",
    description: "Alert receiver container images",
  });

  // 2. Store webhook secret in Secret Manager
  const webhookSecretResource = createSecret(`${name}-webhook-secret`, {
    value: options.webhookSecret as unknown as string,
  });

  // 3. Cloud Run service (scale-to-zero, public for SigNoz webhooks)
  const container = createContainer(name, {
    image: options.image,
    port: 3000,
    public: true,
    minInstances: 0,
    healthCheckPath: "/health",
    environment: {
      INCIDENT_LEDGER_URL: options.incidentLedgerUrl as unknown as string,
      WEBHOOK_SECRET: options.webhookSecret as unknown as string,
    },
  });

  // 4. Store the webhook URL in Secret Manager for SigNoz configuration
  const webhookUrlSecret = createSecret(`${name}-webhook-url`, {
    value: pulumi.interpolate`${container.url}/webhook` as unknown as string,
  });

  return { registry, container, webhookSecretResource, webhookUrlSecret };
}
