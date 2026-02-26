import type { Incident } from "../types";

export type EventType =
  | "incident.created"
  | "incident.claimed"
  | "incident.resolved";

/**
 * Emit an incident event. Stub for phase 2 — will wire to webhook
 * delivery when agent-workflows is ready.
 */
export function emitEvent(_eventType: EventType, _incident: Incident): void {
  // Phase 2: dispatch to webhook subscribers
}
