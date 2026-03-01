export interface DiffClient {
  fetchCommitDiff(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<string>;
}

export function createDiffClient(token: string): DiffClient {
  return {
    async fetchCommitDiff(
      owner: string,
      repo: string,
      sha: string,
    ): Promise<string> {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.diff",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch diff for ${owner}/${repo}@${sha} (${res.status})`,
        );
      }

      return res.text();
    },
  };
}
