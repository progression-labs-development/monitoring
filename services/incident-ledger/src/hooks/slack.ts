import type { IncidentEvent } from "../types";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#e01e5a",
  high: "#f2952b",
};

export function formatSlackMessage(event: IncidentEvent): object {
  const { incident } = event;
  const color = SEVERITY_COLORS[incident.severity] ?? "#cccccc";
  const title = `[${incident.severity.toUpperCase()}] ${incident.domain}: ${incident.type}`;

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${title}*` },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Event:*\n${event.event}` },
              { type: "mrkdwn", text: `*Status:*\n${incident.status}` },
              { type: "mrkdwn", text: `*Domain:*\n${incident.domain}` },
              { type: "mrkdwn", text: `*Type:*\n${incident.type}` },
              { type: "mrkdwn", text: `*Resource:*\n${JSON.stringify(incident.resource)}` },
            ],
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: `Incident ${incident.id} | ${event.timestamp}` },
            ],
          },
        ],
      },
    ],
  };
}
