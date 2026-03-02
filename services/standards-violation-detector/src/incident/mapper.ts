import type { CheckResult } from "../standards/types";
import type { IncidentPayload } from "./client";

export interface ViolationContext {
  repository: string;
  branch: string;
  commitSha: string;
  pusherName: string;
  pusherEmail: string;
}

/**
 * Map standards check violations to an incident payload.
 */
export function mapToIncident(
  result: CheckResult,
  context: ViolationContext,
): IncidentPayload {
  const fingerprint = `${context.repository}:${context.commitSha}:standards_violation`;

  return {
    domain: "standards",
    type: "standards_violation",
    severity: "medium",
    fingerprint,
    observed: {
      repo: context.repository,
      branch: context.branch,
      files: result.violations.map((v) => v.file),
      violations: result.violations.map((v) => ({
        file: v.file,
        line: v.line,
        rule: v.rule,
        message: v.message,
        severity: v.severity,
      })),
    },
    expected: {
      standards: result.standardsConfig,
    },
    resource: {
      repository: context.repository,
      commitSha: context.commitSha,
    },
    actor: {
      github_user: context.pusherName,
      email: context.pusherEmail,
    },
    permitted_actions: ["create_fix_pr", "notify_author"],
  };
}
