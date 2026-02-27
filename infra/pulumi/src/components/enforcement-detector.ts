import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { createContainer, createSecret, createStorage } from "@progression-labs-development/infra";
import type { ContainerOutputs, StorageOutputs } from "@progression-labs-development/infra";

export interface EnforcementDetectorOptions {
  /** Container image for the enforcement-detector service */
  image: string;
  /** Internal URL of the incident ledger API */
  incidentLedgerUrl: pulumi.Input<string>;
  /** AWS access key ID (stored in Secret Manager) */
  awsAccessKeyId?: pulumi.Input<string>;
  /** AWS secret access key (stored in Secret Manager) */
  awsSecretAccessKey?: pulumi.Input<string>;
  /** AWS region to scan */
  awsRegion?: string;
  /** GCP project to scan */
  gcpProject?: string;
  /** GCP region to scan */
  gcpRegion?: string;
  /** Cloud Scheduler cron expression (default: every 10 minutes) */
  schedule?: string;
}

export interface EnforcementDetectorOutputs {
  bucket: StorageOutputs;
  registry: gcp.artifactregistry.Repository;
  container: ContainerOutputs;
  scheduler: gcp.cloudscheduler.Job;
}

export function createEnforcementDetector(
  name: string,
  options: EnforcementDetectorOptions,
): EnforcementDetectorOutputs {
  const config = new pulumi.Config("gcp");
  const gcpProject = options.gcpProject ?? config.require("project");
  const gcpRegion = options.gcpRegion ?? config.require("region");

  // 1. GCS bucket for expected-state.json (using infra's createStorage)
  const bucket = createStorage(`${name}-state`);

  // 2. Artifact Registry
  const registry = new gcp.artifactregistry.Repository(`${name}-registry`, {
    repositoryId: name,
    location: gcpRegion,
    format: "DOCKER",
    description: "Enforcement detector container images",
  });

  // 3. AWS credentials secrets (if provided)
  const environment: Record<string, pulumi.Input<string>> = {
    EXPECTED_STATE_BUCKET: bucket.bucketName,
    EXPECTED_STATE_PATH: "expected-state.json",
    INCIDENT_LEDGER_URL: options.incidentLedgerUrl,
    GCP_PROJECT: gcpProject,
    GCP_REGION: gcpRegion,
    AWS_REGION: options.awsRegion ?? "eu-west-2",
  };

  if (options.awsAccessKeyId) {
    const awsKeySecret = createSecret(`${name}-aws-access-key`, {
      value: options.awsAccessKeyId as unknown as string,
    });
    environment.AWS_ACCESS_KEY_ID = awsKeySecret.secretName;
  }

  if (options.awsSecretAccessKey) {
    const awsSecretSecret = createSecret(`${name}-aws-secret-key`, {
      value: options.awsSecretAccessKey as unknown as string,
    });
    environment.AWS_SECRET_ACCESS_KEY = awsSecretSecret.secretName;
  }

  // 4. Cloud Run service (scale-to-zero between sweeps)
  //    link: [bucket] auto-grants GCS read/write + injects bucket env vars
  const container = createContainer(name, {
    image: options.image,
    port: 3000,
    public: false,
    minInstances: 0,
    healthCheckPath: "/health",
    link: [bucket],
    environment: environment as Record<string, string>,
  });

  // 5. Scheduler service account with Cloud Run invoker permissions
  const schedulerSa = new gcp.serviceaccount.Account(`${name}-scheduler-sa`, {
    accountId: `${name}-scheduler`.substring(0, 28),
    displayName: `Scheduler SA for ${name}`,
  });

  new gcp.cloudrunv2.ServiceIamMember(`${name}-scheduler-invoker`, {
    name: container.serviceArn,
    location: gcpRegion,
    role: "roles/run.invoker",
    member: pulumi.interpolate`serviceAccount:${schedulerSa.email}`,
  });

  // 6. Cloud Scheduler job to trigger sweeps
  const scheduler = new gcp.cloudscheduler.Job(`${name}-scheduler`, {
    name: `${name}-sweep`,
    region: gcpRegion,
    schedule: options.schedule ?? "*/10 * * * *",
    timeZone: "UTC",
    httpTarget: {
      uri: pulumi.interpolate`${container.url}/sweep`,
      httpMethod: "POST",
      headers: { "Content-Type": "application/json" },
      oidcToken: {
        serviceAccountEmail: schedulerSa.email,
      },
    },
  });

  return { bucket, registry, container, scheduler };
}
