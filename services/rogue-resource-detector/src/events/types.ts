/**
 * Normalized audit event from either AWS CloudTrail or GCP Audit Log.
 */
export interface AuditEvent {
  cloud: "aws" | "gcp";
  eventName: string;
  resourceType: string;
  resourceId: string;
  actor: ActorInfo;
  timestamp: string;
  raw: Record<string, unknown>;
}

export interface ActorInfo {
  identity: string;
  type: "iam-user" | "iam-role" | "service-account" | "unknown";
  awsArn?: string;
  gcpServiceAccount?: string;
}

/**
 * AWS CloudTrail event delivered via EventBridge.
 */
export interface CloudTrailEvent {
  source: string;
  detail: {
    eventName: string;
    eventSource: string;
    userIdentity: {
      type: string;
      arn?: string;
      userName?: string;
      principalId?: string;
      sessionContext?: {
        sessionIssuer?: {
          arn?: string;
          userName?: string;
        };
      };
    };
    requestParameters?: Record<string, unknown>;
    responseElements?: Record<string, unknown>;
    resources?: Array<{
      type?: string;
      ARN?: string;
    }>;
    eventTime: string;
  };
}

/**
 * GCP Audit Log event delivered via Pub/Sub.
 */
export interface GcpAuditLogEvent {
  message: {
    data: string; // Base64-encoded JSON
  };
}

export interface GcpAuditLogPayload {
  protoPayload: {
    methodName: string;
    resourceName: string;
    authenticationInfo: {
      principalEmail: string;
    };
    serviceName: string;
  };
  resource: {
    type: string;
    labels: Record<string, string>;
  };
  timestamp: string;
}
