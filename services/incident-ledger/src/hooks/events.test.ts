import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Incident } from "../types";

const TEST_INCIDENT: Incident = {
  id: "inc_456",
  domain: "security",
  type: "secret_committed",
  severity: "critical",
  fingerprint: null,
  observed: {},
  expected: {},
  delta: {},
  resource: { repo: "my-repo" },
  actor: {},
  permitted_actions: ["revoke"],
  constraints: {},
  status: "open",
  claimed_by: null,
  outcome: null,
  created_at: "2026-02-26T12:00:00.000Z",
  claimed_at: null,
  resolved_at: null,
};

describe("emitEvent", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadAndEmit(severity?: Incident["severity"]) {
    const { emitEvent } = await import("./events");
    const incident = severity ? { ...TEST_INCIDENT, severity } : TEST_INCIDENT;
    emitEvent("incident.created", incident);
    // Allow microtasks (fire-and-forget promises) to settle
    await new Promise((r) => setTimeout(r, 10));
  }

  it("posts to agent webhook when WEBHOOK_AGENT_URL is set", async () => {
    vi.stubEnv("WEBHOOK_AGENT_URL", "https://agent.example.com/hook");
    await loadAndEmit();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://agent.example.com/hook",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.event).toBe("incident.created");
    expect(body.incident.id).toBe("inc_456");
    expect(body.timestamp).toBeDefined();
  });

  it("posts to Slack webhook for critical severity", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/test");
    await loadAndEmit("critical");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.attachments).toBeDefined();
  });

  it("posts to Slack webhook for high severity", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/test");
    await loadAndEmit("high");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does NOT post to Slack for medium severity", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/test");
    await loadAndEmit("medium");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT post to Slack for low severity", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/test");
    await loadAndEmit("low");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips webhooks when env vars are not set", async () => {
    await loadAndEmit();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to both webhooks when both are configured", async () => {
    vi.stubEnv("WEBHOOK_AGENT_URL", "https://agent.example.com/hook");
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/test");
    await loadAndEmit("critical");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("logs error but does not throw on fetch failure", async () => {
    vi.stubEnv("WEBHOOK_AGENT_URL", "https://agent.example.com/hook");
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await loadAndEmit();

    expect(consoleSpy).toHaveBeenCalledWith("Agent webhook error:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});
