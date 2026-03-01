import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { webhookRoute } from "./webhook";

vi.mock("../config", () => ({
  getConfig: () => ({
    PORT: 3000,
    INCIDENT_LEDGER_URL: "http://localhost:3000",
    GITHUB_APP_ID: 123456,
    GITHUB_APP_PRIVATE_KEY: Buffer.from("fake-key").toString("base64"),
    GITHUB_WEBHOOK_SECRET: "test-secret",
  }),
}));

vi.mock("../github/auth", () => ({
  createGitHubAuth: () => ({
    getInstallationToken: vi.fn().mockResolvedValue("ghs_mock_token"),
  }),
}));

vi.mock("../github/diff", () => ({
  createDiffClient: () => ({
    fetchCommitDiff: vi.fn().mockResolvedValue(
      `diff --git a/config.ts b/config.ts
index 1234567..abcdef0 100644
--- a/config.ts
+++ b/config.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const key = "AKIAIOSFODNN7EXAMPLE";
`,
    ),
  }),
}));

vi.mock("../incident/client", () => ({
  createIncidentClient: () => ({
    createIncident: vi.fn().mockResolvedValue({
      id: "inc-1",
      fingerprint: "fp-1",
      status: "open",
    }),
    listOpenByType: vi.fn().mockResolvedValue([]),
  }),
}));

function sign(body: string, secret: string): string {
  return (
    "sha256=" +
    createHmac("sha256", secret).update(body, "utf8").digest("hex")
  );
}

function makePushPayload() {
  return {
    ref: "refs/heads/main",
    before: "0000000",
    after: "abc123",
    repository: {
      full_name: "org/repo",
      name: "repo",
      owner: { login: "org" },
    },
    pusher: { name: "testuser", email: "test@example.com" },
    sender: { login: "testuser" },
    commits: [
      {
        id: "abc123",
        message: "add config",
        timestamp: "2024-01-01T00:00:00Z",
        author: { name: "testuser", email: "test@example.com" },
        added: ["config.ts"],
        removed: [],
        modified: [],
      },
    ],
    installation: { id: 789 },
  };
}

describe("POST /webhook", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route("/", webhookRoute);
  });

  it("rejects requests with invalid signature", async () => {
    const body = JSON.stringify(makePushPayload());
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=invalid",
        "x-github-event": "push",
      },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("skips non-push events", async () => {
    const body = JSON.stringify({ action: "opened" });
    const sig = sign(body, "test-secret");
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
        "x-github-event": "pull_request",
      },
      body,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
  });

  it("skips tag pushes", async () => {
    const payload = { ...makePushPayload(), ref: "refs/tags/v1.0.0" };
    const body = JSON.stringify(payload);
    const sig = sign(body, "test-secret");
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
        "x-github-event": "push",
      },
      body,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
  });

  it("processes push events and returns findings", async () => {
    const body = JSON.stringify(makePushPayload());
    const sig = sign(body, "test-secret");
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
        "x-github-event": "push",
      },
      body,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(1);
    expect(json.findings).toBeGreaterThan(0);
    expect(typeof json.incidents_created).toBe("number");
  });

  it("returns 400 when no installation context", async () => {
    const payload = makePushPayload();
    delete (payload as Record<string, unknown>).installation;
    const body = JSON.stringify(payload);
    const sig = sign(body, "test-secret");
    const res = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
        "x-github-event": "push",
      },
      body,
    });
    expect(res.status).toBe(400);
  });
});
