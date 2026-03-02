import type {
  AuditEvent,
  CloudTrailEvent,
  GcpAuditLogEvent,
  GcpAuditLogPayload,
} from "./types";

/**
 * Resource-creating CloudTrail event names to watch for.
 */
const AWS_CREATE_EVENTS = new Set([
  "CreateBucket",
  "RunInstances",
  "CreateFunction20150331",
  "CreateDBInstance",
  "CreateCluster",
  "CreateSecret",
  "CreateRole",
  "CreateService",
  "CreateStack",
  "CreateTable",
]);

/**
 * GCP method patterns that indicate resource creation or modification.
 */
const GCP_CREATE_PATTERNS = [
  /\.create$/i,
  /\.insert$/i,
  /\.patch$/i,
  /\.update$/i,
];

/**
 * Parse an AWS CloudTrail event into a normalized AuditEvent.
 */
export function parseCloudTrailEvent(event: CloudTrailEvent): AuditEvent | null {
  const detail = event.detail;

  if (!AWS_CREATE_EVENTS.has(detail.eventName)) {
    return null;
  }

  const userIdentity = detail.userIdentity;
  const arn = userIdentity.arn ?? userIdentity.sessionContext?.sessionIssuer?.arn;

  const resourceArn = detail.resources?.[0]?.ARN;
  const resourceType = detail.resources?.[0]?.type ?? detail.eventSource.replace(".amazonaws.com", "");
  const resourceId = resourceArn ?? extractAwsResourceId(detail);

  return {
    cloud: "aws",
    eventName: detail.eventName,
    resourceType,
    resourceId,
    actor: {
      identity: arn ?? userIdentity.userName ?? "unknown",
      type: userIdentity.type === "AssumedRole" ? "iam-role" : "iam-user",
      awsArn: arn,
    },
    timestamp: detail.eventTime,
    raw: detail as unknown as Record<string, unknown>,
  };
}

/**
 * Parse a GCP Audit Log event (from Pub/Sub) into a normalized AuditEvent.
 */
export function parseGcpAuditLogEvent(event: GcpAuditLogEvent): AuditEvent | null {
  const decoded = Buffer.from(event.message.data, "base64").toString("utf8");
  const payload: GcpAuditLogPayload = JSON.parse(decoded);

  const methodName = payload.protoPayload.methodName;
  const isCreateOrModify = GCP_CREATE_PATTERNS.some((p) => p.test(methodName));

  if (!isCreateOrModify) {
    return null;
  }

  return {
    cloud: "gcp",
    eventName: methodName,
    resourceType: payload.resource.type,
    resourceId: payload.protoPayload.resourceName,
    actor: {
      identity: payload.protoPayload.authenticationInfo.principalEmail,
      type: payload.protoPayload.authenticationInfo.principalEmail.includes("gserviceaccount.com")
        ? "service-account"
        : "iam-user",
      gcpServiceAccount: payload.protoPayload.authenticationInfo.principalEmail.includes("gserviceaccount.com")
        ? payload.protoPayload.authenticationInfo.principalEmail
        : undefined,
    },
    timestamp: payload.timestamp,
    raw: payload as unknown as Record<string, unknown>,
  };
}

function extractAwsResourceId(detail: CloudTrailEvent["detail"]): string {
  // Try common response element patterns for resource IDs
  const response = detail.responseElements;
  if (response) {
    for (const key of ["instanceId", "functionArn", "bucketName", "roleArn", "dBInstanceIdentifier"]) {
      if (typeof response[key] === "string") {
        return response[key] as string;
      }
    }
  }

  return `${detail.eventSource}/${detail.eventName}`;
}
