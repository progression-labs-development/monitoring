import type { DetectedSecret } from "./types";

const ENTROPY_THRESHOLD = 4.5;
const MIN_TOKEN_LENGTH = 20;
const CONTEXT_KEYWORDS = [
  "key",
  "secret",
  "token",
  "password",
  "credential",
  "api",
];

export function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

function hasContextKeyword(line: string): boolean {
  const lower = line.toLowerCase();
  return CONTEXT_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractTokens(line: string): string[] {
  return line.split(/[\s=:'"`,;(){}\[\]]+/).filter(
    (t) => t.length >= MIN_TOKEN_LENGTH,
  );
}

export function scanEntropy(
  lines: string[],
  filePath: string,
  lineOffset: number,
): DetectedSecret[] {
  const findings: DetectedSecret[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!hasContextKeyword(line)) continue;

    const tokens = extractTokens(line);
    for (const token of tokens) {
      const entropy = shannonEntropy(token);
      if (entropy > ENTROPY_THRESHOLD) {
        findings.push({
          filePath,
          lineNumber: lineOffset + i,
          patternName: "high_entropy",
          detectionMethod: "entropy",
        });
        break;
      }
    }
  }

  return findings;
}
