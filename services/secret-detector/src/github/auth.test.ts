import { describe, it, expect, vi } from "vitest";
import { createGitHubAuth } from "./auth";

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: vi.fn(() => {
    return vi.fn().mockResolvedValue({ token: "ghs_mock_token_123" });
  }),
}));

describe("createGitHubAuth", () => {
  const appId = 123456;
  const privateKeyBase64 = Buffer.from("fake-private-key").toString("base64");

  it("returns an installation token", async () => {
    const auth = createGitHubAuth(appId, privateKeyBase64);
    const token = await auth.getInstallationToken(789);
    expect(token).toBe("ghs_mock_token_123");
  });
});
