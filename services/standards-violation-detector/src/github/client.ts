/**
 * Client for fetching file content from GitHub repositories.
 */
export interface GitHubClient {
  getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null>;
  getChangedFileContents(
    owner: string,
    repo: string,
    files: string[],
    ref: string,
  ): Promise<Map<string, string>>;
}

export function createGitHubClient(token: string): GitHubClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  return {
    async getFileContent(
      owner: string,
      repo: string,
      path: string,
      ref: string,
    ): Promise<string | null> {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
      const res = await fetch(url, { headers });

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch ${path} from ${owner}/${repo} (${res.status})`);
      }

      return res.text();
    },

    async getChangedFileContents(
      owner: string,
      repo: string,
      files: string[],
      ref: string,
    ): Promise<Map<string, string>> {
      const contents = new Map<string, string>();

      for (const file of files) {
        const content = await this.getFileContent(owner, repo, file, ref);
        if (content !== null) {
          contents.set(file, content);
        }
      }

      return contents;
    },
  };
}
