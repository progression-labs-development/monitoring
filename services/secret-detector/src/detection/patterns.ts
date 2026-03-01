import type { DetectedSecret } from "./types";

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "aws_access_key", regex: /AKIA[0-9A-Z]{16}/ },
  {
    name: "aws_secret_key",
    regex: /aws_secret.*[=:]\s*['"]?([0-9a-zA-Z/+=]{40})/i,
  },
  { name: "github_pat", regex: /ghp_[A-Za-z0-9_]{36,}/ },
  { name: "github_fine_grained", regex: /github_pat_[A-Za-z0-9_]{22,}/ },
  { name: "github_oauth", regex: /gho_[A-Za-z0-9_]{36,}/ },
  { name: "openai_key", regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: "gcp_service_account", regex: /"type"\s*:\s*"service_account"/ },
  {
    name: "private_key_pem",
    regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/,
  },
  { name: "slack_token", regex: /xox[bpras]-[A-Za-z0-9-]{10,}/ },
  { name: "stripe_secret", regex: /sk_live_[A-Za-z0-9]{20,}/ },
  {
    name: "generic_secret",
    regex: /(secret|password|token|api_key)\s*[=:]\s*['"][^'"]{16,}['"]/i,
  },
];

export function scanPatterns(
  lines: string[],
  filePath: string,
  lineOffset: number,
): DetectedSecret[] {
  const findings: DetectedSecret[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          filePath,
          lineNumber: lineOffset + i,
          patternName: pattern.name,
          detectionMethod: "pattern",
        });
      }
    }
  }

  return findings;
}

export { SECRET_PATTERNS };
