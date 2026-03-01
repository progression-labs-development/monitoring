import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, resetConfig } from "./config";

describe("config", () => {
  const validEnv = {
    PORT: "3000",
    INCIDENT_LEDGER_URL: "http://localhost:3000",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY: "dGVzdC1rZXk=",
    GITHUB_WEBHOOK_SECRET: "test-secret",
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("parses valid environment variables", () => {
    Object.assign(process.env, validEnv);
    const config = getConfig();
    expect(config.PORT).toBe(3000);
    expect(config.INCIDENT_LEDGER_URL).toBe("http://localhost:3000");
    expect(config.GITHUB_APP_ID).toBe(123456);
    expect(config.GITHUB_APP_PRIVATE_KEY).toBe("dGVzdC1rZXk=");
    expect(config.GITHUB_WEBHOOK_SECRET).toBe("test-secret");
  });

  it("defaults PORT to 3000", () => {
    const { PORT: _, ...envWithoutPort } = validEnv;
    Object.assign(process.env, envWithoutPort);
    delete process.env.PORT;
    const config = getConfig();
    expect(config.PORT).toBe(3000);
  });

  it("throws on missing required fields", () => {
    expect(() => getConfig()).toThrow();
  });

  it("throws on invalid INCIDENT_LEDGER_URL", () => {
    Object.assign(process.env, { ...validEnv, INCIDENT_LEDGER_URL: "not-a-url" });
    expect(() => getConfig()).toThrow();
  });

  it("caches config after first parse", () => {
    Object.assign(process.env, validEnv);
    const first = getConfig();
    const second = getConfig();
    expect(first).toBe(second);
  });
});
