import { describe, it, expect } from "vitest";
import { isForbiddenFile, scanForbiddenFiles } from "./files";

describe("isForbiddenFile", () => {
  it("flags .env", () => {
    expect(isForbiddenFile(".env")).toBe(true);
  });

  it("flags .env.production", () => {
    expect(isForbiddenFile(".env.production")).toBe(true);
  });

  it("flags .env.local", () => {
    expect(isForbiddenFile("config/.env.local")).toBe(true);
  });

  it("flags credentials.json", () => {
    expect(isForbiddenFile("credentials.json")).toBe(true);
  });

  it("flags .pem files", () => {
    expect(isForbiddenFile("server.pem")).toBe(true);
  });

  it("flags .key files", () => {
    expect(isForbiddenFile("private.key")).toBe(true);
  });

  it("flags .p12 files", () => {
    expect(isForbiddenFile("cert.p12")).toBe(true);
  });

  it("flags .pfx files", () => {
    expect(isForbiddenFile("cert.pfx")).toBe(true);
  });

  it("flags id_rsa", () => {
    expect(isForbiddenFile("~/.ssh/id_rsa")).toBe(true);
  });

  it("flags id_ed25519", () => {
    expect(isForbiddenFile(".ssh/id_ed25519")).toBe(true);
  });

  it("allows normal files", () => {
    expect(isForbiddenFile("src/index.ts")).toBe(false);
  });

  it("allows package.json", () => {
    expect(isForbiddenFile("package.json")).toBe(false);
  });

  it("allows .env.example", () => {
    expect(isForbiddenFile(".env.example")).toBe(true);
  });
});

describe("scanForbiddenFiles", () => {
  it("returns findings for forbidden files", () => {
    const files = ["src/index.ts", ".env", "server.pem", "README.md"];
    const results = scanForbiddenFiles(files);
    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe(".env");
    expect(results[0].detectionMethod).toBe("forbidden_file");
    expect(results[1].filePath).toBe("server.pem");
  });

  it("returns empty for clean file list", () => {
    const files = ["src/index.ts", "package.json"];
    const results = scanForbiddenFiles(files);
    expect(results).toHaveLength(0);
  });
});
