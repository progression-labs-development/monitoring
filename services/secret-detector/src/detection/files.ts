import type { DetectedSecret } from "./types";

const FORBIDDEN_EXACT = new Set([
  ".env",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
]);

const FORBIDDEN_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
]);

const FORBIDDEN_PREFIXES = [".env."];

function basename(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1];
}

function extname(filePath: string): string {
  const name = basename(filePath);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return name.slice(dotIndex);
}

export function isForbiddenFile(filePath: string): boolean {
  const name = basename(filePath);

  if (FORBIDDEN_EXACT.has(name)) return true;
  if (FORBIDDEN_EXTENSIONS.has(extname(filePath))) return true;
  if (FORBIDDEN_PREFIXES.some((p) => name.startsWith(p))) return true;

  return false;
}

export function scanForbiddenFiles(filePaths: string[]): DetectedSecret[] {
  return filePaths
    .filter(isForbiddenFile)
    .map((filePath) => ({
      filePath,
      lineNumber: 0,
      patternName: "forbidden_file",
      detectionMethod: "forbidden_file" as const,
    }));
}
