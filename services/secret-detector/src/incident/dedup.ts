import type { IncidentPayload, IncidentResponse } from "./client";

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
