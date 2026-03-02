import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichActor } from "./enricher";
import type { ResolverDeps } from "./resolvers";

const mockDeps: ResolverDeps = {
  githubToken: "test-token",
  slackToken: "test-slack-token",
  ssoMappingUrl: "https://sso.example.com",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("enrichActor", () => {
  it("resolves AWS SSO ARN to a person", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ name: "Jane Doe", email: "jane@example.com", slackHandle: "@jane" }),
        { status: 200 },
      ),
    );

    const result = await enrichActor(
      { awsArn: "arn:aws:sts::123456:assumed-role/AWSReservedSSO_Admin/jane.doe" },
      mockDeps,
    );

    expect(result.resolved).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      slackHandle: "@jane",
      source: "aws-sso",
    });
  });

  it("resolves GitHub username to a person", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ name: "John Smith", email: "john@example.com", login: "jsmith" }),
        { status: 200 },
      ),
    );

    const result = await enrichActor({ githubUser: "jsmith" }, mockDeps);

    expect(result.resolved).not.toBeNull();
    expect(result.resolved!.name).toBe("John Smith");
    expect(result.resolved!.email).toBe("john@example.com");
    expect(result.resolved!.source).toBe("github");
  });

  it("resolves git author to a person", async () => {
    const result = await enrichActor(
      { gitAuthor: "Alice <alice@example.com>" },
      { ...mockDeps, slackToken: undefined },
    );

    expect(result.resolved).toEqual({
      name: "Alice",
      email: "alice@example.com",
      slackHandle: null,
      source: "git-author",
    });
  });

  it("returns null resolved when no identifier matches", async () => {
    const result = await enrichActor({ someOther: "field" }, mockDeps);
    expect(result.resolved).toBeNull();
  });

  it("falls back gracefully when resolution fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const result = await enrichActor(
      { githubUser: "unknown-user" },
      mockDeps,
    );

    expect(result.resolved).toBeNull();
    expect(result.githubUser).toBe("unknown-user");
  });

  it("resolves GCP service account with fallback", async () => {
    const result = await enrichActor(
      { gcpServiceAccount: "my-service@my-project.iam.gserviceaccount.com" },
      { ...mockDeps, ssoMappingUrl: undefined },
    );

    expect(result.resolved).toEqual({
      name: "my-service",
      email: null,
      slackHandle: null,
      source: "gcp-service-account-fallback",
    });
  });
});
