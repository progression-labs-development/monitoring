import type { AuditEvent } from "../events/types";
import type { IncidentPayload } from "./client";

/**
 * Map a rogue resource audit event to an incident payload.
 */
export function toRogueIncident(event: AuditEvent): IncidentPayload {
  const fingerprint = `${event.cloud}:${event.resourceType}:${event.resourceId}`;

  return {
    domain: "infrastructure",
    type: "rogue_resource",
    severity: "high",
    fingerprint,
    observed: {
      cloud: event.cloud,
      eventName: event.eventName,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      timestamp: event.timestamp,
    },
    resource: {
      cloud: event.cloud,
      type: event.resourceType,
      id: event.resourceId,
    },
    actor: {
      identity: event.actor.identity,
      type: event.actor.type,
      awsArn: event.actor.awsArn,
      gcpServiceAccount: event.actor.gcpServiceAccount,
    },
    permitted_actions: ["import_to_pulumi", "delete_resource", "notify_owner"],
  };
}

/**
 * Map a drift audit event to an incident payload.
 */
export function toDriftIncident(event: AuditEvent): IncidentPayload {
  const fingerprint = `drift:${event.cloud}:${event.resourceType}:${event.resourceId}`;

  return {
    domain: "infrastructure",
    type: "drift",
    severity: "medium",
    fingerprint,
    observed: {
      cloud: event.cloud,
      eventName: event.eventName,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      timestamp: event.timestamp,
    },
    resource: {
      cloud: event.cloud,
      type: event.resourceType,
      id: event.resourceId,
    },
    actor: {
      identity: event.actor.identity,
      type: event.actor.type,
      awsArn: event.actor.awsArn,
      gcpServiceAccount: event.actor.gcpServiceAccount,
    },
    permitted_actions: ["pulumi_refresh", "revert_change", "notify_owner"],
  };
}
