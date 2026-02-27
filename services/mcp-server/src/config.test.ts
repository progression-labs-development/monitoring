import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("loads config with all env vars set", () => {
    const config = loadConfig({
      CLICKHOUSE_URL: "http://clickhouse:8123",
      MCP_API_KEY: "test-key",
      PORT: "4000",
    });

    expect(config.CLICKHOUSE_URL).toBe("http://clickhouse:8123");
    expect(config.MCP_API_KEY).toBe("test-key");
    expect(config.PORT).toBe(4000);
  });

  it("uses default CLICKHOUSE_URL and PORT", () => {
    const config = loadConfig({
      MCP_API_KEY: "test-key",
    });

    expect(config.CLICKHOUSE_URL).toBe("http://localhost:8123");
    expect(config.PORT).toBe(3000);
  });

  it("throws when MCP_API_KEY is missing", () => {
    expect(() => loadConfig({})).toThrow();
  });

  it("throws when MCP_API_KEY is empty", () => {
    expect(() => loadConfig({ MCP_API_KEY: "" })).toThrow();
  });

  it("throws when CLICKHOUSE_URL is not a valid URL", () => {
    expect(() =>
      loadConfig({ MCP_API_KEY: "test-key", CLICKHOUSE_URL: "not-a-url" }),
    ).toThrow();
  });
});
