import type { DetectedSecret } from "../detection/types";
import type { IncidentPayload } from "./client";

export interface SecretContext {
  repository: string;
  branch: string;
  commitSha: string;
  pusherName: string;
  pusherEmail: string;
}

export function mapToIncident(
  secret: DetectedSecret,
  context: SecretContext,
): IncidentPayload {
  const fingerprint = `${context.repository}:${secret.filePath}:${secret.patternName}:${context.commitSha}`;

  return {
    domain: "security",
    type: "secret_committed",
    severity: "critical",
    fingerprint,
    observed: {
      repository: context.repository,
      branch: context.branch,
      commitSha: context.commitSha,
      filePath: secret.filePath,
      lineNumber: secret.lineNumber,
      patternName: secret.patternName,
      detectionMethod: secret.detectionMethod,
    },
    resource: {
      repository: context.repository,
      commitSha: context.commitSha,
    },
    actor: {
      githubUser: context.pusherName,
      email: context.pusherEmail,
    },
    permitted_actions: [
      "remove_from_code",
      "rotate_credential",
      "notify_author",
    ],
  };
}
