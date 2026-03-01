import { createAppAuth } from "@octokit/auth-app";

export interface GitHubAuth {
  getInstallationToken(installationId: number): Promise<string>;
}

export function createGitHubAuth(
  appId: number,
  privateKeyBase64: string,
): GitHubAuth {
  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");

  return {
    async getInstallationToken(installationId: number): Promise<string> {
      const auth = createAppAuth({ appId, privateKey });
      const { token } = await auth({
        type: "installation",
        installationId,
      });
      return token;
    },
  };
}
