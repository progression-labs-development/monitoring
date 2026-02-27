import type { ClassifiedResource } from "../enumeration/types";
import type { IncidentResponse } from "./client";

/**
 * Generate a stable fingerprint for a rogue resource.
 * Format: {cloud}:{type}:{id}
 */
export function fingerprint(resource: ClassifiedResource): string {
  return `${resource.cloud}:${resource.type}:${resource.id}`;
}

/**
 * Filter out resources that already have open incidents.
 */
export function dedup(
  rogueResources: ClassifiedResource[],
  openIncidents: IncidentResponse[],
): ClassifiedResource[] {
  const openFingerprints = new Set(
    openIncidents
      .map((i) => i.fingerprint)
      .filter((f): f is string => f !== null),
  );

  return rogueResources.filter((r) => !openFingerprints.has(fingerprint(r)));
}
