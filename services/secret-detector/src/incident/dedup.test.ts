import { describe, it, expect } from "vitest";
import { dedup } from "./dedup";
import type { IncidentPayload, IncidentResponse } from "./client";

function makePayload(fingerprint: string): IncidentPayload {
  return {
    domain: "security",
    type: "secret_committed",
    severity: "critical",
    fingerprint,
    observed: {},
    resource: {},
  };
}

function makeIncident(fingerprint: string): IncidentResponse {
  return {
    id: "inc-1",
    fingerprint,
    status: "open",
  };
}

describe("dedup", () => {
  it("filters out payloads with matching open incidents", () => {
    const payloads = [makePayload("fp-1"), makePayload("fp-2")];
    const open = [makeIncident("fp-1")];
    const result = dedup(payloads, open);
    expect(result).toHaveLength(1);
    expect(result[0].fingerprint).toBe("fp-2");
  });

  it("returns all payloads when no open incidents", () => {
    const payloads = [makePayload("fp-1"), makePayload("fp-2")];
    const result = dedup(payloads, []);
    expect(result).toHaveLength(2);
  });

  it("returns empty when all are duplicates", () => {
    const payloads = [makePayload("fp-1")];
    const open = [makeIncident("fp-1")];
    const result = dedup(payloads, open);
    expect(result).toHaveLength(0);
  });

  it("handles null fingerprints in open incidents", () => {
    const payloads = [makePayload("fp-1")];
    const open: IncidentResponse[] = [
      { id: "inc-1", fingerprint: null, status: "open" },
    ];
    const result = dedup(payloads, open);
    expect(result).toHaveLength(1);
  });
});
