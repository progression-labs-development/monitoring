/**
 * Raw actor identifiers that can appear in incidents.
 */
export interface RawActor {
  awsArn?: string;
  awsRole?: string;
  gcpServiceAccount?: string;
  githubUser?: string;
  gitAuthor?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Enriched person information resolved from raw identifiers.
 */
export interface ResolvedPerson {
  name: string | null;
  email: string | null;
  slackHandle: string | null;
  source: string;
}

/**
 * Result of enrichment — original actor fields plus resolved person info.
 */
export interface EnrichedActor extends RawActor {
  resolved: ResolvedPerson | null;
}
