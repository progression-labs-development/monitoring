import { getConfig } from "./config";
import { enumerateAws, validateAwsCredentials } from "./enumeration/aws";
import { enumerateGcp } from "./enumeration/gcp";
import type { LiveResource, ClassifiedResource } from "./enumeration/types";
import { loadExpectedState } from "./expected-state/loader";
import { classifyResources } from "./classification/classifier";
import { createIncidentClient } from "./incident/client";
import { dedup } from "./incident/dedup";
import { toIncidentPayload } from "./incident/mapper";

export interface SweepResult {
  liveCount: number;
  managed: number;
  rogue: number;
  providerManaged: number;
  incidentsCreated: number;
  incidentsSkipped: number;
  errors: string[];
}

export async function runSweep(): Promise<SweepResult> {
  const config = getConfig();
  const errors: string[] = [];

  // 1. Load expected state from GCS
  const state = await loadExpectedState(
    config.EXPECTED_STATE_BUCKET,
    config.EXPECTED_STATE_PATH,
  );

  // 2. Enumerate live resources
  const liveResources: LiveResource[] = [];

  const awsCreds = await validateAwsCredentials(config.AWS_REGION);
  if (awsCreds) {
    try {
      const awsResources = await enumerateAws({ region: config.AWS_REGION });
      liveResources.push(...awsResources);
    } catch (err) {
      errors.push(`AWS enumeration failed: ${(err as Error).message}`);
    }
  } else {
    errors.push("AWS credentials not available, skipping AWS enumeration");
  }

  try {
    const gcpResources = await enumerateGcp({
      project: config.GCP_PROJECT,
      region: config.GCP_REGION,
    });
    liveResources.push(...gcpResources);
  } catch (err) {
    errors.push(`GCP enumeration failed: ${(err as Error).message}`);
  }

  // 3. Classify
  const classified = classifyResources(liveResources, state);
  const rogueResources = classified.filter(
    (r): r is ClassifiedResource & { classification: "ROGUE" } =>
      r.classification === "ROGUE",
  );

  // 4. Dedup against open incidents
  const client = createIncidentClient(config.INCIDENT_LEDGER_URL);
  const openIncidents = await client.listOpenByType("rogue_resource");
  const newRogue = dedup(rogueResources, openIncidents);

  // 5. Create incidents for new rogue resources
  let incidentsCreated = 0;
  for (const resource of newRogue) {
    try {
      await client.createIncident(toIncidentPayload(resource));
      incidentsCreated++;
    } catch (err) {
      errors.push(
        `Failed to create incident for ${resource.cloud}:${resource.type}:${resource.id}: ${(err as Error).message}`,
      );
    }
  }

  return {
    liveCount: liveResources.length,
    managed: classified.filter((r) => r.classification === "MANAGED").length,
    rogue: rogueResources.length,
    providerManaged: classified.filter((r) => r.classification === "PROVIDER-MANAGED").length,
    incidentsCreated,
    incidentsSkipped: rogueResources.length - newRogue.length,
    errors,
  };
}
