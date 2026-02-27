import type { ExclusionPattern } from "../expected-state/types";

/**
 * Check if a resource matches any exclusion pattern.
 *
 * Copied from @progression-labs-development/infra to avoid runtime dependency.
 * Exclusion patterns come from expected-state.json.
 */
export function matchesExclusion(
  resource: { type: string; name: string; id: string; details?: string },
  patterns: readonly ExclusionPattern[],
): ExclusionPattern | undefined {
  for (const pattern of patterns) {
    if (pattern.type !== resource.type) continue;

    switch (pattern.match) {
      case "name-prefix":
        if (resource.name.startsWith(pattern.value)) return pattern;
        break;
      case "name-exact":
        if (resource.name === pattern.value) return pattern;
        break;
      case "id-contains":
        if (resource.id.includes(pattern.value)) return pattern;
        break;
      case "details-contains":
        if (resource.details?.includes(pattern.value)) return pattern;
        break;
    }
  }
  return undefined;
}
