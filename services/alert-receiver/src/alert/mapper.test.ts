import { describe, it, expect } from "vitest";
import { mapAlertToIncident, inferDomain, mapSeverity } from "./mapper";
import type { SignozAlert } from "./types";

function makeAlert(overrides: Partial<SignozAlert> = {}): SignozAlert {
  return {
    status: "firing",
    labels: { alertname: "test_alert", severity: "warning" },
    annotations: { description: "Test alert fired" },
    startsAt: "2026-03-01T00:00:00Z",
    fingerprint: "abc123",
    ...overrides,
  };
}

describe("inferDomain", () => {
  it("uses labels.domain when present", () => {
    const alert = makeAlert({ labels: { alertname: "test", domain: "security" } });
    expect(inferDomain(alert)).toBe("security");
  });

  it("infers cost domain from alertname prefix", () => {
    const alert = makeAlert({ labels: { alertname: "cost_session_threshold" } });
    expect(inferDomain(alert)).toBe("cost");
  });

  it("infers security domain from alertname prefix", () => {
    const alert = makeAlert({ labels: { alertname: "security_blocked_command" } });
    expect(inferDomain(alert)).toBe("security");
  });

  it("infers reliability domain from alertname prefix", () => {
    const alert = makeAlert({ labels: { alertname: "reliability_missing_telemetry" } });
    expect(inferDomain(alert)).toBe("reliability");
  });

  it("infers infrastructure domain from infra prefix", () => {
    const alert = makeAlert({ labels: { alertname: "infra_disk_full" } });
    expect(inferDomain(alert)).toBe("infrastructure");
  });

  it("defaults to reliability when no match", () => {
    const alert = makeAlert({ labels: { alertname: "unknown_alert" } });
    expect(inferDomain(alert)).toBe("reliability");
  });
});

describe("mapSeverity", () => {
  it("maps critical to critical", () => {
    expect(mapSeverity("critical")).toBe("critical");
  });

  it("maps warning to high", () => {
    expect(mapSeverity("warning")).toBe("high");
  });

  it("maps info to medium", () => {
    expect(mapSeverity("info")).toBe("medium");
  });

  it("defaults to medium for unknown", () => {
    expect(mapSeverity("unknown")).toBe("medium");
  });

  it("defaults to medium for undefined", () => {
    expect(mapSeverity(undefined)).toBe("medium");
  });

  it("is case-insensitive", () => {
    expect(mapSeverity("WARNING")).toBe("high");
    expect(mapSeverity("Critical")).toBe("critical");
  });
});

describe("mapAlertToIncident", () => {
  it("maps a firing alert to incident payload", () => {
    const alert = makeAlert();
    const payload = mapAlertToIncident(alert);

    expect(payload.domain).toBe("reliability");
    expect(payload.type).toBe("alert_triggered");
    expect(payload.severity).toBe("high");
    expect(payload.fingerprint).toBe("signoz:abc123");
  });

  it("includes observed data", () => {
    const alert = makeAlert();
    const payload = mapAlertToIncident(alert);

    expect(payload.observed).toEqual({
      alertname: "test_alert",
      status: "firing",
      labels: alert.labels,
      annotations: alert.annotations,
      startsAt: "2026-03-01T00:00:00Z",
      generatorURL: undefined,
    });
  });

  it("includes resource info", () => {
    const alert = makeAlert();
    const payload = mapAlertToIncident(alert);

    expect(payload.resource).toEqual({
      source: "signoz",
      alertname: "test_alert",
      fingerprint: "abc123",
    });
  });

  it("includes permitted actions", () => {
    const payload = mapAlertToIncident(makeAlert());
    expect(payload.permitted_actions).toEqual([
      "investigate",
      "acknowledge",
      "escalate",
    ]);
  });

  it("uses domain from labels when present", () => {
    const alert = makeAlert({
      labels: { alertname: "test", domain: "cost", severity: "critical" },
    });
    const payload = mapAlertToIncident(alert);
    expect(payload.domain).toBe("cost");
    expect(payload.severity).toBe("critical");
  });
});
