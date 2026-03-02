import type { Violation, CheckResult } from "./types";

/**
 * Run standards checks against the changed files.
 * Checks naming conventions based on the standards.toml config.
 */
export function checkStandards(
  changedFiles: string[],
  standardsToml: string,
): CheckResult {
  const violations: Violation[] = [];

  // Parse basic naming rules from standards.toml
  const namingRules = parseNamingRules(standardsToml);
  const rulesets = parseRulesets(standardsToml);

  for (const file of changedFiles) {
    // Check file naming conventions
    const namingViolations = checkNaming(file, namingRules);
    violations.push(...namingViolations);
  }

  return {
    violations,
    filesChecked: changedFiles.length,
    standardsConfig: rulesets.join(", ") || "unknown",
  };
}

interface NamingRule {
  extensions: string[];
  fileCase: string;
  folderCase: string;
  excludePatterns: string[];
}

function parseNamingRules(toml: string): NamingRule[] {
  const rules: NamingRule[] = [];

  // Simple TOML parsing for naming rules
  const extensionsMatch = toml.match(/extensions\s*=\s*\[([^\]]*)\]/);
  const fileCaseMatch = toml.match(/file_case\s*=\s*"([^"]+)"/);
  const folderCaseMatch = toml.match(/folder_case\s*=\s*"([^"]+)"/);
  const excludeMatch = toml.match(/exclude\s*=\s*\[([^\]]*)\]/);

  if (extensionsMatch && fileCaseMatch && folderCaseMatch) {
    const extensions = extensionsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean);

    const excludePatterns = excludeMatch
      ? excludeMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/"/g, ""))
          .filter(Boolean)
      : [];

    rules.push({
      extensions,
      fileCase: fileCaseMatch[1],
      folderCase: folderCaseMatch[1],
      excludePatterns,
    });
  }

  return rules;
}

function parseRulesets(toml: string): string[] {
  const match = toml.match(/rulesets\s*=\s*\[([^\]]*)\]/);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/"/g, ""))
    .filter(Boolean);
}

function checkNaming(file: string, rules: NamingRule[]): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
    // Check if file matches any exclude pattern
    if (rule.excludePatterns.some((pattern) => matchGlob(file, pattern))) {
      continue;
    }

    const ext = file.split(".").pop() ?? "";
    if (!rule.extensions.includes(ext)) {
      continue;
    }

    // Check file name case
    const fileName = file.split("/").pop()?.replace(`.${ext}`, "") ?? "";
    if (!matchesCase(fileName, rule.fileCase)) {
      violations.push({
        file,
        line: null,
        rule: "naming/file-case",
        message: `File name "${fileName}" should be ${rule.fileCase}`,
        severity: "error",
      });
    }

    // Check folder case
    const parts = file.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts[i];
      if (!matchesCase(folder, rule.folderCase)) {
        violations.push({
          file,
          line: null,
          rule: "naming/folder-case",
          message: `Folder name "${folder}" should be ${rule.folderCase}`,
          severity: "error",
        });
      }
    }
  }

  return violations;
}

function matchesCase(name: string, caseType: string): boolean {
  switch (caseType) {
    case "camelCase":
      return /^[a-z][a-zA-Z0-9]*$/.test(name);
    case "kebab-case":
      return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
    case "PascalCase":
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    case "snake_case":
      return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
    default:
      return true;
  }
}

function matchGlob(path: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(path);
}
