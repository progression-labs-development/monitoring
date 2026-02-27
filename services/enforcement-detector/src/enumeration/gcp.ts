import { InstancesClient as ComputeInstancesClient, FirewallsClient } from "@google-cloud/compute";
import { Storage as GCSStorage } from "@google-cloud/storage";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { v2 as functionsV2 } from "@google-cloud/functions";
import { ServicesClient as CloudRunServicesClient } from "@google-cloud/run";
import { CloudRedisClient } from "@google-cloud/redis";
import type { LiveResource } from "./types";

export interface GcpEnumerationOptions {
  project: string;
  region: string;
}

export async function enumerateGcp(options: GcpEnumerationOptions): Promise<LiveResource[]> {
  const resources: LiveResource[] = [];
  const { project, region } = options;

  const collectors: Array<() => Promise<void>> = [
    // Compute Instances
    async () => {
      const client = new ComputeInstancesClient();
      for await (const [, scopedList] of client.aggregatedListAsync({ project })) {
        for (const inst of scopedList.instances ?? []) {
          resources.push({
            cloud: "gcp",
            type: "compute-instance",
            id: String(inst.id ?? "unknown"),
            name: inst.name ?? "",
            details: `zone=${inst.zone?.split("/").pop()}, status=${inst.status}`,
          });
        }
      }
    },

    // Firewalls
    async () => {
      const client = new FirewallsClient();
      const [firewalls] = await client.list({ project });
      for (const fw of firewalls ?? []) {
        resources.push({
          cloud: "gcp",
          type: "firewall",
          id: String(fw.id ?? "unknown"),
          name: fw.name ?? "",
          details: `network=${fw.network?.split("/").pop()}, direction=${fw.direction}`,
        });
      }
    },

    // Storage Buckets
    async () => {
      const storage = new GCSStorage({ projectId: project });
      const [buckets] = await storage.getBuckets();
      for (const b of buckets) {
        resources.push({
          cloud: "gcp",
          type: "storage-bucket",
          id: b.name,
          name: b.name,
          details: `location=${b.metadata.location}`,
        });
      }
    },

    // Cloud SQL
    async () => {
      // Use gcloud CLI — the Node.js client requires different auth
      const { execSync } = await import("child_process");
      const raw = execSync(
        `gcloud sql instances list --project=${project} --format=json 2>/dev/null`,
        { encoding: "utf-8" },
      );
      const instances = JSON.parse(raw) as Array<{ name: string; state: string; databaseVersion: string }>;
      for (const inst of instances) {
        resources.push({
          cloud: "gcp",
          type: "cloud-sql",
          id: inst.name,
          name: inst.name,
          details: `state=${inst.state}, version=${inst.databaseVersion}`,
        });
      }
    },

    // Cloud Functions (v2)
    async () => {
      const client = new functionsV2.FunctionServiceClient();
      const [functions] = await client.listFunctions({
        parent: `projects/${project}/locations/${region}`,
      });
      for (const fn of functions ?? []) {
        const name = fn.name?.split("/").pop() ?? "";
        resources.push({
          cloud: "gcp",
          type: "cloud-function",
          id: fn.name ?? "unknown",
          name,
          details: `state=${fn.state}, runtime=${fn.buildConfig?.runtime}`,
        });
      }
    },

    // Cloud Run Services
    async () => {
      const client = new CloudRunServicesClient();
      const [services] = await client.listServices({
        parent: `projects/${project}/locations/${region}`,
      });
      for (const svc of services ?? []) {
        const name = svc.name?.split("/").pop() ?? "";
        resources.push({
          cloud: "gcp",
          type: "cloud-run",
          id: svc.name ?? "unknown",
          name,
          details: `uri=${svc.uri}`,
        });
      }
    },

    // Memorystore Redis
    async () => {
      const client = new CloudRedisClient();
      const [instances] = await client.listInstances({
        parent: `projects/${project}/locations/${region}`,
      });
      for (const inst of instances ?? []) {
        const name = inst.name?.split("/").pop() ?? "";
        resources.push({
          cloud: "gcp",
          type: "memorystore-redis",
          id: inst.name ?? "unknown",
          name,
          details: `state=${inst.state}, tier=${inst.tier}`,
        });
      }
    },

    // Secret Manager
    async () => {
      const client = new SecretManagerServiceClient();
      const [secrets] = await client.listSecrets({
        parent: `projects/${project}`,
      });
      for (const s of secrets ?? []) {
        const name = s.name?.split("/").pop() ?? "";
        resources.push({
          cloud: "gcp",
          type: "secret",
          id: s.name ?? "unknown",
          name,
        });
      }
    },
  ];

  const results = await Promise.allSettled(collectors.map((c) => c()));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("GCP enumeration error:", result.reason);
    }
  }

  return resources;
}
