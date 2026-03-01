import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDiffClient } from "./diff";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("createDiffClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a commit diff", async () => {
    const diffText = "diff --git a/file.ts b/file.ts\n+secret=abc";
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(diffText),
    });

    const client = createDiffClient("test-token");
    const result = await client.fetchCommitDiff("owner", "repo", "abc123");

    expect(result).toBe(diffText);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/commits/abc123",
      {
        headers: {
          Authorization: "Bearer test-token",
          Accept: "application/vnd.github.diff",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const client = createDiffClient("test-token");
    await expect(
      client.fetchCommitDiff("owner", "repo", "abc123"),
    ).rejects.toThrow("Failed to fetch diff");
  });
});
