import { describe, it, expect } from "vitest";
import { mapToIncident } from "./mapper";
import type { DetectedSecret } from "../detection/types";
import type { SecretContext } from "./mapper";

describe("mapToIncident", () => {
  const secret: DetectedSecret = {
    filePath: "src/config.ts",
    lineNumber: 42,
    patternName: "aws_access_key",
    detectionMethod: "pattern",
  };

  const context: SecretContext = {
    repository: "org/repo",
    branch: "refs/heads/main",
    commitSha: "abc123def456",
    pusherName: "testuser",
    pusherEmail: "test@example.com",
  };

  it("maps to correct incident structure", () => {
    const payload = mapToIncident(secret, context);

    expect(payload.domain).toBe("security");
    expect(payload.type).toBe("secret_committed");
    expect(payload.severity).toBe("critical");
  });

  it("generates correct fingerprint", () => {
    const payload = mapToIncident(secret, context);
    expect(payload.fingerprint).toBe(
      "org/repo:src/config.ts:aws_access_key:abc123def456",
    );
  });

  it("includes observed details", () => {
    const payload = mapToIncident(secret, context);
    expect(payload.observed).toEqual({
      repository: "org/repo",
      branch: "refs/heads/main",
      commitSha: "abc123def456",
      filePath: "src/config.ts",
      lineNumber: 42,
      patternName: "aws_access_key",
      detectionMethod: "pattern",
    });
  });

  it("includes resource info", () => {
    const payload = mapToIncident(secret, context);
    expect(payload.resource).toEqual({
      repository: "org/repo",
      commitSha: "abc123def456",
    });
  });

  it("includes actor info", () => {
    const payload = mapToIncident(secret, context);
    expect(payload.actor).toEqual({
      githubUser: "testuser",
      email: "test@example.com",
    });
  });

  it("includes permitted actions", () => {
    const payload = mapToIncident(secret, context);
    expect(payload.permitted_actions).toEqual([
      "remove_from_code",
      "rotate_credential",
      "notify_author",
    ]);
  });
});
