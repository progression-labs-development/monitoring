import { describe, it, expect } from "vitest";
import { toIncidentPayload } from "./mapper";
import type { ClassifiedResource } from "../enumeration/types";

describe("toIncidentPayload", () => {
  it("maps rogue resource to incident payload", () => {
    const resource: ClassifiedResource = {
      cloud: "aws",
      type: "s3-bucket",
      id: "rogue-bucket",
      name: "rogue-bucket",
      classification: "ROGUE",
    };

    const payload = toIncidentPayload(resource);

    expect(payload.domain).toBe("infrastructure");
    expect(payload.type).toBe("rogue_resource");
    expect(payload.severity).toBe("high");
    expect(payload.fingerprint).toBe("aws:s3-bucket:rogue-bucket");
    expect(payload.observed).toEqual({
      cloud: "aws",
      resourceType: "s3-bucket",
      resourceId: "rogue-bucket",
      resourceName: "rogue-bucket",
      details: null,
    });
    expect(payload.resource).toEqual({
      cloud: "aws",
      type: "s3-bucket",
      id: "rogue-bucket",
      name: "rogue-bucket",
    });
  });

  it("includes details when present", () => {
    const resource: ClassifiedResource = {
      cloud: "gcp",
      type: "compute-instance",
      id: "123456",
      name: "rogue-vm",
      details: "zone=us-central1-a, status=RUNNING",
      classification: "ROGUE",
    };

    const payload = toIncidentPayload(resource);
    expect(payload.observed.details).toBe("zone=us-central1-a, status=RUNNING");
    expect(payload.fingerprint).toBe("gcp:compute-instance:123456");
  });
});
