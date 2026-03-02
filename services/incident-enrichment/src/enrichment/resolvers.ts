import type { ResolvedPerson } from "./types";

export interface ResolverDeps {
  githubToken: string;
  slackToken?: string;
  ssoMappingUrl?: string;
}

/**
 * Resolve an AWS SSO assumed-role ARN to a person.
 * ARN format: arn:aws:sts::ACCOUNT:assumed-role/AWSReservedSSO_ROLE/username
 */
export async function resolveAwsArn(
  arn: string,
  deps: ResolverDeps,
): Promise<ResolvedPerson | null> {
  // Extract SSO username from assumed-role ARN
  const ssoMatch = arn.match(
    /arn:aws:sts::\d+:assumed-role\/AWSReservedSSO_[^/]+\/(.+)$/,
  );
  if (!ssoMatch) {
    return null;
  }

  const ssoUsername = ssoMatch[1];

  if (deps.ssoMappingUrl) {
    try {
      const res = await fetch(
        `${deps.ssoMappingUrl}/users/${encodeURIComponent(ssoUsername)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          name?: string;
          email?: string;
          slackHandle?: string;
        };
        return {
          name: data.name ?? ssoUsername,
          email: data.email ?? null,
          slackHandle: data.slackHandle ?? null,
          source: "aws-sso",
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  return {
    name: ssoUsername,
    email: null,
    slackHandle: null,
    source: "aws-sso-fallback",
  };
}

/**
 * Resolve a GitHub username to a person with email and Slack handle.
 */
export async function resolveGitHubUser(
  username: string,
  deps: ResolverDeps,
): Promise<ResolvedPerson | null> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: {
        Authorization: `Bearer ${deps.githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      name?: string | null;
      email?: string | null;
      login: string;
    };

    const person: ResolvedPerson = {
      name: data.name ?? data.login,
      email: data.email ?? null,
      slackHandle: null,
      source: "github",
    };

    // Attempt Slack lookup if we have an email and Slack token
    if (person.email && deps.slackToken) {
      const slackHandle = await lookupSlackByEmail(person.email, deps.slackToken);
      if (slackHandle) {
        person.slackHandle = slackHandle;
      }
    }

    return person;
  } catch {
    return null;
  }
}

/**
 * Resolve a git commit author (Name <email>) to a person.
 */
export async function resolveGitAuthor(
  author: string,
  deps: ResolverDeps,
): Promise<ResolvedPerson | null> {
  const emailMatch = author.match(/<([^>]+)>/);
  const nameMatch = author.match(/^([^<]+)/);

  const email = emailMatch?.[1]?.trim() ?? null;
  const name = nameMatch?.[1]?.trim() ?? null;

  if (!email) {
    return name ? { name, email: null, slackHandle: null, source: "git-author" } : null;
  }

  const person: ResolvedPerson = {
    name,
    email,
    slackHandle: null,
    source: "git-author",
  };

  if (deps.slackToken) {
    const slackHandle = await lookupSlackByEmail(email, deps.slackToken);
    if (slackHandle) {
      person.slackHandle = slackHandle;
    }
  }

  return person;
}

/**
 * Resolve a GCP service account to its owner.
 */
export async function resolveGcpServiceAccount(
  serviceAccount: string,
  deps: ResolverDeps,
): Promise<ResolvedPerson | null> {
  // Service account format: name@project.iam.gserviceaccount.com
  const nameMatch = serviceAccount.match(/^([^@]+)@/);
  if (!nameMatch) {
    return null;
  }

  if (deps.ssoMappingUrl) {
    try {
      const res = await fetch(
        `${deps.ssoMappingUrl}/service-accounts/${encodeURIComponent(serviceAccount)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          owner?: string;
          email?: string;
          slackHandle?: string;
        };
        return {
          name: data.owner ?? nameMatch[1],
          email: data.email ?? null,
          slackHandle: data.slackHandle ?? null,
          source: "gcp-service-account",
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  return {
    name: nameMatch[1],
    email: null,
    slackHandle: null,
    source: "gcp-service-account-fallback",
  };
}

/**
 * Look up a Slack user handle by email using the Slack API.
 */
async function lookupSlackByEmail(
  email: string,
  slackToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      {
        headers: { Authorization: `Bearer ${slackToken}` },
      },
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      ok: boolean;
      user?: { name?: string };
    };

    return data.ok && data.user?.name ? `@${data.user.name}` : null;
  } catch {
    return null;
  }
}
