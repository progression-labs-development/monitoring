import type { SignozAlert } from "./types";
import type { IncidentPayload } from "../incident/client";

const domainPrefixes: Record<string, string> = {
  cost: "cost",
  security: "security",
  reliability: "reliability",
  infra: "infrastructure",
  standards: "standards",
};

export function inferDomain(alert: SignozAlert): string {
  if (alert.labels.domain) {
    return alert.labels.domain;
  }

  const alertName = alert.labels.alertname ?? "";
  for (const [prefix, domain] of Object.entries(domainPrefixes)) {
    if (alertName.toLowerCase().startsWith(`${prefix}_`) || alertName.toLowerCase().startsWith(`${prefix}-`)) {
      return domain;
    }
  }

  return "reliability";
}

export function mapSeverity(severity: string | undefined): string {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "critical";
    case "warning":
      return "high";
    case "info":
      return "medium";
    default:
      return "medium";
  }
}

export function mapAlertToIncident(alert: SignozAlert): IncidentPayload {
  const domain = inferDomain(alert);
  const severity = mapSeverity(alert.labels.severity);
  const fingerprint = `signoz:${alert.fingerprint}`;

  return {
    domain,
    type: "alert_triggered",
    severity,
    fingerprint,
    observed: {
      alertname: alert.labels.alertname,
      status: alert.status,
      labels: alert.labels,
      annotations: alert.annotations,
      startsAt: alert.startsAt,
      generatorURL: alert.generatorURL,
    },
    resource: {
      source: "signoz",
      alertname: alert.labels.alertname,
      fingerprint: alert.fingerprint,
    },
    permitted_actions: [
      "investigate",
      "acknowledge",
      "escalate",
    ],
  };
}
