import type { ClassifiedResource } from "../enumeration/types";
import type { IncidentPayload } from "./client";
import { fingerprint } from "./dedup";

/**
 * Map a rogue classified resource to an incident payload.
 */
export function toIncidentPayload(resource: ClassifiedResource): IncidentPayload {
  return {
    domain: "infrastructure",
    type: "rogue_resource",
    severity: "high",
    fingerprint: fingerprint(resource),
    observed: {
      cloud: resource.cloud,
      resourceType: resource.type,
      resourceId: resource.id,
      resourceName: resource.name,
      details: resource.details ?? null,
    },
    resource: {
      cloud: resource.cloud,
      type: resource.type,
      id: resource.id,
      name: resource.name,
    },
  };
}
