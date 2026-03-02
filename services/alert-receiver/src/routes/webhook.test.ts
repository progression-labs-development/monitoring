import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { webhookRoute } from "./webhook";
import { resetConfig } from "../config";

// Mock the incident client module
vi.mock("../incident/client", () => ({
  createIncidentClient: () => ({
    createIncident: vi.fn().mockResolvedValue({ id: "inc-1", fingerprint: "signoz:abc123", status: "open" }),
    listOpenByType: vi.fn().mockResolvedValue([]),
    resolveIncident: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeApp() {
  const app = new Hono();
  app.route("/", webhookRoute);
  return app;
}

function makeSignozPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: "firing",
    alerts: [
      {
        status: "firing",
        labels: { alertname: "cost_session_threshold", severity: "warning" },
        annotations: { description: "Session cost exceeded $5" },
        startsAt: "2026-03-01T00:00:00Z",
        fingerprint: "abc123",
      },
    ],
    groupLabels: {},
    commonLabels: {},
    commonAnnotations: {},
    ...overrides,
  };
}

describe("POST /webhook", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetConfig();
    process.env.INCIDENT_LEDGER_URL = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("processes a valid firing alert", async () => {
    const app = makeApp();
    const res = await app.request("/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeSignozPayload()),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firing).toBe(1);
    expect(body.incidents_created).toBe(1);
  });

  it("rejects invalid payload", async () => {
    const app = makeApp();
    const res = await app.request("/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid payload");
  });

  it("rejects unauthorized requests when WEBHOOK_SECRET is set", async () => {
    process.env.WEBHOOK_SECRET = "my-secret";
    resetConfig();

    const app = makeApp();
    const res = await app.request("/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeSignozPayload()),
    });

    expect(res.status).toBe(401);
  });

  it("accepts requests with correct bearer token", async () => {
    process.env.WEBHOOK_SECRET = "my-secret";
    resetConfig();

    const app = makeApp();
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer my-secret",
      },
      body: JSON.stringify(makeSignozPayload()),
    });

    expect(res.status).toBe(200);
  });

  it("handles resolved alerts", async () => {
    const app = makeApp();
    const payload = makeSignozPayload({
      status: "resolved",
      alerts: [
        {
          status: "resolved",
          labels: { alertname: "cost_session_threshold", severity: "warning" },
          annotations: {},
          fingerprint: "abc123",
        },
      ],
    });

    const res = await app.request("/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolved_alerts).toBe(1);
    expect(body.incidents_created).toBe(0);
  });

  it("handles mixed firing and resolved alerts", async () => {
    const app = makeApp();
    const payload = makeSignozPayload({
      alerts: [
        {
          status: "firing",
          labels: { alertname: "cost_session_threshold", severity: "warning" },
          annotations: {},
          startsAt: "2026-03-01T00:00:00Z",
          fingerprint: "abc123",
        },
        {
          status: "resolved",
          labels: { alertname: "reliability_missing_data", severity: "info" },
          annotations: {},
          fingerprint: "def456",
        },
      ],
    });

    const res = await app.request("/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.firing).toBe(1);
    expect(body.resolved_alerts).toBe(1);
  });
});
