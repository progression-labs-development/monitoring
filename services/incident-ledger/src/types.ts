export type IncidentDomain =
  | "infrastructure"
  | "security"
  | "cost"
  | "reliability"
  | "standards";

export type IncidentType =
  | "rogue_resource"
  | "drift"
  | "secret_committed"
  | "standards_violation";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export type IncidentStatus = "open" | "claimed" | "remediated" | "escalated";

export interface Incident {
  id: string;
  domain: IncidentDomain;
  type: IncidentType;
  severity: IncidentSeverity;
  observed: Record<string, unknown>;
  expected: Record<string, unknown>;
  delta: Record<string, unknown>;
  resource: Record<string, unknown>;
  actor: Record<string, unknown>;
  permitted_actions: string[];
  constraints: Record<string, unknown>;
  status: IncidentStatus;
  claimed_by: string | null;
  outcome: Record<string, unknown> | null;
  created_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
}
