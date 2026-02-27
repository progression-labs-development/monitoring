import { describe, it, expect } from "vitest";
import { matchesExclusion } from "./exclusions";
import type { ExclusionPattern } from "../expected-state/types";

const patterns: ExclusionPattern[] = [
  { type: "vpc", description: "Default VPC", match: "details-contains", value: "isDefault=true" },
  { type: "security-group", description: "Default SG", match: "name-exact", value: "default" },
  { type: "iam-role", description: "Service-linked roles", match: "name-prefix", value: "AWSServiceRole" },
  { type: "iam-role", description: "Service-linked roles (path)", match: "id-contains", value: "/aws-service-role/" },
  { type: "firewall", description: "Default firewall", match: "name-prefix", value: "default-" },
];

describe("matchesExclusion", () => {
  it("matches details-contains pattern", () => {
    const result = matchesExclusion(
      { type: "vpc", name: "", id: "vpc-123", details: "isDefault=true, cidr=10.0.0.0/16" },
      patterns,
    );
    expect(result).toBeDefined();
    expect(result!.description).toBe("Default VPC");
  });

  it("matches name-exact pattern", () => {
    const result = matchesExclusion(
      { type: "security-group", name: "default", id: "sg-123" },
      patterns,
    );
    expect(result).toBeDefined();
    expect(result!.description).toBe("Default SG");
  });

  it("matches name-prefix pattern", () => {
    const result = matchesExclusion(
      { type: "iam-role", name: "AWSServiceRoleForECS", id: "arn:aws:iam::role/AWSServiceRoleForECS" },
      patterns,
    );
    expect(result).toBeDefined();
    expect(result!.description).toBe("Service-linked roles");
  });

  it("matches id-contains pattern", () => {
    const result = matchesExclusion(
      { type: "iam-role", name: "some-role", id: "arn:aws:iam::role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS" },
      patterns,
    );
    expect(result).toBeDefined();
    expect(result!.description).toBe("Service-linked roles (path)");
  });

  it("returns undefined for non-matching resource", () => {
    const result = matchesExclusion(
      { type: "s3-bucket", name: "my-bucket", id: "my-bucket" },
      patterns,
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when type matches but value does not", () => {
    const result = matchesExclusion(
      { type: "security-group", name: "my-sg", id: "sg-456" },
      patterns,
    );
    expect(result).toBeUndefined();
  });
});
