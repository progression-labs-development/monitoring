import type { Incident, EventType, IncidentEvent } from "../types";
import { formatSlackMessage } from "./slack";

export type { EventType };

function buildEvent(eventType: EventType, incident: Incident): IncidentEvent {
  return {
    event: eventType,
    timestamp: new Date().toISOString(),
    incident,
  };
}

async function postWebhook(url: string, body: object): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Webhook POST to ${url} failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Emit an incident event to configured webhook subscribers.
 * Fire-and-forget — errors are logged but never propagated.
 */
export function emitEvent(eventType: EventType, incident: Incident): void {
  const event = buildEvent(eventType, incident);

  const agentUrl = process.env.WEBHOOK_AGENT_URL;
  if (agentUrl) {
    postWebhook(agentUrl, event).catch((err) => {
      console.error("Agent webhook error:", err);
    });
  }

  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl && (incident.severity === "critical" || incident.severity === "high")) {
    postWebhook(slackUrl, formatSlackMessage(event)).catch((err) => {
      console.error("Slack webhook error:", err);
    });
  }
}
