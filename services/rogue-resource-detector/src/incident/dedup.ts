import type { IncidentPayload, IncidentResponse } from "./client";

/**
 * Filter out incidents that already have open entries with the same fingerprint.
 */
export function dedup(
  payloads: IncidentPayload[],
  openIncidents: IncidentResponse[],
): IncidentPayload[] {
  const openFingerprints = new Set(
    openIncidents
      .map((i) => i.fingerprint)
      .filter((f): f is string => f !== null),
  );

  return payloads.filter((p) => !openFingerprints.has(p.fingerprint));
}
