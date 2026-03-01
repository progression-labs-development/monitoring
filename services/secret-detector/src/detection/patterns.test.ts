import { describe, it, expect } from "vitest";
import { scanPatterns } from "./patterns";

describe("scanPatterns", () => {
  it("detects AWS access keys", () => {
    const lines = ["AWS_KEY=AKIAIOSFODNN7EXAMPLE"];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results).toHaveLength(1);
    expect(results[0].patternName).toBe("aws_access_key");
  });

  it("detects AWS secret keys", () => {
    const lines = ['aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY0"'];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "aws_secret_key")).toBe(true);
  });

  it("detects GitHub PATs", () => {
    const lines = ["token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl"];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "github_pat")).toBe(true);
  });

  it("detects GitHub fine-grained tokens", () => {
    const lines = ["token=github_pat_11ABCDEFGHIJKLMNOPQRSTUVW"];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "github_fine_grained")).toBe(true);
  });

  it("detects OpenAI keys", () => {
    const lines = ["OPENAI_KEY=sk-abcdefghijklmnopqrstuvwxyz"];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "openai_key")).toBe(true);
  });

  it("detects GCP service account JSON", () => {
    const lines = ['  "type": "service_account"'];
    const results = scanPatterns(lines, "sa.json", 1);
    expect(results[0].patternName).toBe("gcp_service_account");
  });

  it("detects private key PEM headers", () => {
    const lines = ["-----BEGIN RSA PRIVATE KEY-----"];
    const results = scanPatterns(lines, "key.pem", 1);
    expect(results[0].patternName).toBe("private_key_pem");
  });

  it("detects Slack tokens", () => {
    const lines = ["SLACK_TOKEN=xoxb-1234567890-abcdefghij"];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "slack_token")).toBe(true);
  });

  it("detects Stripe secret keys", () => {
    // Construct dynamically to avoid GitHub push protection flagging test fixtures
    const prefix = ["sk", "live"].join("_") + "_";
    const lines = [`stripe_key=${prefix}FAKE0123456789abcdefghij`];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "stripe_secret")).toBe(true);
  });

  it("detects generic secrets", () => {
    const lines = ['secret = "abcdefghijklmnopqrstuvwxyz"'];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results.some((r) => r.patternName === "generic_secret")).toBe(true);
  });

  it("returns empty array for clean lines", () => {
    const lines = ["const x = 42;", "console.log('hello');"];
    const results = scanPatterns(lines, "app.ts", 1);
    expect(results).toHaveLength(0);
  });

  it("tracks correct line numbers with offset", () => {
    const lines = ["line1", "AKIAIOSFODNN7EXAMPLE"];
    const results = scanPatterns(lines, "config.ts", 10);
    expect(results[0].lineNumber).toBe(11);
  });

  it("sets detectionMethod to pattern", () => {
    const lines = ["ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl"];
    const results = scanPatterns(lines, "config.ts", 1);
    expect(results[0].detectionMethod).toBe("pattern");
  });
});
