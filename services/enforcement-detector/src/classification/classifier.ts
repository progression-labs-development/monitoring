import type { LiveResource, ClassifiedResource } from "../enumeration/types";
import type { ExclusionPattern, ExpectedState } from "../expected-state/types";
import { matchesExclusion } from "./exclusions";

/**
 * Build a set of known resource IDs from expected state.
 * Includes both the primary `id` and `name` fields from each expected resource.
 */
function buildManagedIdSet(state: ExpectedState, cloud: "aws" | "gcp"): Set<string> {
  const ids = new Set<string>();
  for (const stack of state.stacks) {
    if (stack.cloud !== cloud) continue;
    for (const r of stack.resources) {
      ids.add(r.id);
      if (r.name) ids.add(r.name);
    }
  }
  return ids;
}

/**
 * Classify live resources as MANAGED, ROGUE, or PROVIDER-MANAGED.
 */
export function classifyResources(
  liveResources: LiveResource[],
  state: ExpectedState,
): ClassifiedResource[] {
  const awsIds = buildManagedIdSet(state, "aws");
  const gcpIds = buildManagedIdSet(state, "gcp");

  return liveResources.map((r) => {
    const exclusions: readonly ExclusionPattern[] =
      r.cloud === "aws" ? state.exclusions.aws : state.exclusions.gcp;

    if (matchesExclusion(r, exclusions)) {
      return { ...r, classification: "PROVIDER-MANAGED" as const };
    }

    const managedIds = r.cloud === "aws" ? awsIds : gcpIds;
    if (managedIds.has(r.id) || managedIds.has(r.name)) {
      return { ...r, classification: "MANAGED" as const };
    }

    return { ...r, classification: "ROGUE" as const };
  });
}
