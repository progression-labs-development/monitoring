import { describe, it, expect } from "vitest";
import { fingerprint, dedup } from "./dedup";
import type { ClassifiedResource } from "../enumeration/types";
import type { IncidentResponse } from "./client";

const rogueResource: ClassifiedResource = {
  cloud: "aws",
  type: "s3-bucket",
  id: "rogue-bucket",
  name: "rogue-bucket",
  classification: "ROGUE",
};

describe("fingerprint", () => {
  it("generates correct fingerprint format", () => {
    expect(fingerprint(rogueResource)).toBe("aws:s3-bucket:rogue-bucket");
  });

  it("includes GCP cloud prefix", () => {
    const gcpResource: ClassifiedResource = {
      cloud: "gcp",
      type: "storage-bucket",
      id: "gcp-rogue",
      name: "gcp-rogue",
      classification: "ROGUE",
    };
    expect(fingerprint(gcpResource)).toBe("gcp:storage-bucket:gcp-rogue");
  });
});

describe("dedup", () => {
  it("filters out resources with existing open incidents", () => {
    const openIncidents: IncidentResponse[] = [
      { id: "inc-1", fingerprint: "aws:s3-bucket:rogue-bucket", status: "open" },
    ];

    const result = dedup([rogueResource], openIncidents);
    expect(result).toHaveLength(0);
  });

  it("keeps resources without matching open incidents", () => {
    const openIncidents: IncidentResponse[] = [
      { id: "inc-1", fingerprint: "aws:s3-bucket:other-bucket", status: "open" },
    ];

    const result = dedup([rogueResource], openIncidents);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("rogue-bucket");
  });

  it("handles empty open incidents", () => {
    const result = dedup([rogueResource], []);
    expect(result).toHaveLength(1);
  });

  it("handles null fingerprints in open incidents", () => {
    const openIncidents: IncidentResponse[] = [
      { id: "inc-1", fingerprint: null, status: "open" },
    ];

    const result = dedup([rogueResource], openIncidents);
    expect(result).toHaveLength(1);
  });
});
