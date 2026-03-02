import { describe, it, expect } from "vitest";
import { parseCloudTrailEvent, parseGcpAuditLogEvent } from "./parser";
import type { CloudTrailEvent, GcpAuditLogEvent } from "./types";

describe("parseCloudTrailEvent", () => {
  it("parses a CreateBucket event", () => {
    const event: CloudTrailEvent = {
      source: "aws.s3",
      detail: {
        eventName: "CreateBucket",
        eventSource: "s3.amazonaws.com",
        userIdentity: {
          type: "AssumedRole",
          arn: "arn:aws:sts::123456:assumed-role/AWSReservedSSO_Admin/jane",
        },
        responseElements: { bucketName: "my-new-bucket" },
        resources: [{ type: "AWS::S3::Bucket", ARN: "arn:aws:s3:::my-new-bucket" }],
        eventTime: "2025-01-15T10:00:00Z",
      },
    };

    const result = parseCloudTrailEvent(event);
    expect(result).not.toBeNull();
    expect(result!.cloud).toBe("aws");
    expect(result!.eventName).toBe("CreateBucket");
    expect(result!.resourceId).toBe("arn:aws:s3:::my-new-bucket");
    expect(result!.actor.type).toBe("iam-role");
  });

  it("returns null for non-create events", () => {
    const event: CloudTrailEvent = {
      source: "aws.s3",
      detail: {
        eventName: "GetObject",
        eventSource: "s3.amazonaws.com",
        userIdentity: { type: "IAMUser", userName: "alice" },
        eventTime: "2025-01-15T10:00:00Z",
      },
    };

    expect(parseCloudTrailEvent(event)).toBeNull();
  });
});

describe("parseGcpAuditLogEvent", () => {
  it("parses a resource creation audit log", () => {
    const payload = {
      protoPayload: {
        methodName: "compute.instances.insert",
        resourceName: "projects/my-proj/zones/us-central1-a/instances/my-vm",
        authenticationInfo: { principalEmail: "dev@my-proj.iam.gserviceaccount.com" },
        serviceName: "compute.googleapis.com",
      },
      resource: { type: "gce_instance", labels: { project_id: "my-proj" } },
      timestamp: "2025-01-15T10:00:00Z",
    };

    const event: GcpAuditLogEvent = {
      message: { data: Buffer.from(JSON.stringify(payload)).toString("base64") },
    };

    const result = parseGcpAuditLogEvent(event);
    expect(result).not.toBeNull();
    expect(result!.cloud).toBe("gcp");
    expect(result!.eventName).toBe("compute.instances.insert");
    expect(result!.actor.type).toBe("service-account");
  });

  it("returns null for non-create GCP events", () => {
    const payload = {
      protoPayload: {
        methodName: "compute.instances.get",
        resourceName: "projects/my-proj/zones/us-central1-a/instances/my-vm",
        authenticationInfo: { principalEmail: "user@example.com" },
        serviceName: "compute.googleapis.com",
      },
      resource: { type: "gce_instance", labels: {} },
      timestamp: "2025-01-15T10:00:00Z",
    };

    const event: GcpAuditLogEvent = {
      message: { data: Buffer.from(JSON.stringify(payload)).toString("base64") },
    };

    expect(parseGcpAuditLogEvent(event)).toBeNull();
  });
});
