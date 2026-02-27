import { describe, it, expect } from "vitest";
import { classifyResources } from "./classifier";
import type { LiveResource } from "../enumeration/types";
import type { ExpectedState } from "../expected-state/types";

const state: ExpectedState = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00Z",
  stacks: [
    {
      name: "dev",
      cloud: "aws",
      account: "123456789",
      region: "eu-west-2",
      resources: [
        { type: "s3-bucket", id: "managed-bucket", name: "managed-bucket", urn: "urn:pulumi:dev::test::aws:s3:Bucket::managed-bucket", pulumiType: "aws:s3/bucketV2:BucketV2" },
        { type: "ec2-instance", id: "i-managed", name: "my-instance", urn: "urn:pulumi:dev::test::aws:ec2:Instance::my-instance", pulumiType: "aws:ec2/instance:Instance" },
      ],
    },
    {
      name: "dev",
      cloud: "gcp",
      account: "my-project",
      region: "us-central1",
      resources: [
        { type: "storage-bucket", id: "gcp-bucket", name: "gcp-bucket", urn: "urn:pulumi:dev::test::gcp:storage:Bucket::gcp-bucket", pulumiType: "gcp:storage/bucket:Bucket" },
      ],
    },
  ],
  exclusions: {
    aws: [
      { type: "vpc", description: "Default VPC", match: "details-contains", value: "isDefault=true" },
      { type: "security-group", description: "Default SG", match: "name-exact", value: "default" },
    ],
    gcp: [
      { type: "firewall", description: "Default firewall", match: "name-prefix", value: "default-" },
    ],
    azure: [],
  },
};

describe("classifyResources", () => {
  it("classifies managed resources correctly", () => {
    const live: LiveResource[] = [
      { cloud: "aws", type: "s3-bucket", id: "managed-bucket", name: "managed-bucket" },
    ];
    const result = classifyResources(live, state);
    expect(result[0].classification).toBe("MANAGED");
  });

  it("classifies rogue resources correctly", () => {
    const live: LiveResource[] = [
      { cloud: "aws", type: "s3-bucket", id: "unknown-bucket", name: "unknown-bucket" },
    ];
    const result = classifyResources(live, state);
    expect(result[0].classification).toBe("ROGUE");
  });

  it("classifies provider-managed resources correctly", () => {
    const live: LiveResource[] = [
      { cloud: "aws", type: "vpc", id: "vpc-default", name: "", details: "isDefault=true, cidr=10.0.0.0/16" },
    ];
    const result = classifyResources(live, state);
    expect(result[0].classification).toBe("PROVIDER-MANAGED");
  });

  it("matches managed by name when id differs", () => {
    const live: LiveResource[] = [
      { cloud: "aws", type: "ec2-instance", id: "different-id", name: "my-instance" },
    ];
    const result = classifyResources(live, state);
    expect(result[0].classification).toBe("MANAGED");
  });

  it("classifies GCP resources against correct cloud", () => {
    const live: LiveResource[] = [
      { cloud: "gcp", type: "storage-bucket", id: "gcp-bucket", name: "gcp-bucket" },
      { cloud: "gcp", type: "storage-bucket", id: "rogue-gcp", name: "rogue-gcp" },
    ];
    const result = classifyResources(live, state);
    expect(result[0].classification).toBe("MANAGED");
    expect(result[1].classification).toBe("ROGUE");
  });

  it("provider-managed takes precedence over managed", () => {
    const live: LiveResource[] = [
      { cloud: "aws", type: "security-group", id: "sg-managed", name: "default" },
    ];
    const result = classifyResources(live, state);
    expect(result[0].classification).toBe("PROVIDER-MANAGED");
  });
});
