import type { RawActor, EnrichedActor } from "./types";
import {
  resolveAwsArn,
  resolveGitHubUser,
  resolveGitAuthor,
  resolveGcpServiceAccount,
  type ResolverDeps,
} from "./resolvers";

/**
 * Enrich a raw actor object by resolving identifiers to people.
 * Tries resolvers in priority order; first successful resolution wins.
 * Falls back to keeping the raw identifier if all resolvers fail.
 */
export async function enrichActor(
  actor: RawActor,
  deps: ResolverDeps,
): Promise<EnrichedActor> {
  // Try AWS SSO ARN
  if (actor.awsArn && typeof actor.awsArn === "string") {
    const resolved = await resolveAwsArn(actor.awsArn, deps);
    if (resolved) {
      return { ...actor, resolved };
    }
  }

  // Try GitHub username
  if (actor.githubUser && typeof actor.githubUser === "string") {
    const resolved = await resolveGitHubUser(actor.githubUser, deps);
    if (resolved) {
      return { ...actor, resolved };
    }
  }

  // Try Git author
  if (actor.gitAuthor && typeof actor.gitAuthor === "string") {
    const resolved = await resolveGitAuthor(actor.gitAuthor, deps);
    if (resolved) {
      return { ...actor, resolved };
    }
  }

  // Try GCP service account
  if (actor.gcpServiceAccount && typeof actor.gcpServiceAccount === "string") {
    const resolved = await resolveGcpServiceAccount(actor.gcpServiceAccount, deps);
    if (resolved) {
      return { ...actor, resolved };
    }
  }

  // Fallback: no resolution possible
  return { ...actor, resolved: null };
}
