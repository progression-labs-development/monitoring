/**
 * Violation found by the standards checker.
 */
export interface Violation {
  file: string;
  line: number | null;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Standards configuration parsed from standards.toml.
 */
export interface StandardsConfig {
  metadata: {
    project: string;
    tier: string;
  };
  extends: {
    registry: string;
    rulesets: string[];
  };
  code?: {
    naming?: {
      rules?: Array<{
        extensions: string[];
        file_case: string;
        folder_case: string;
        exclude?: string[];
      }>;
    };
  };
}

/**
 * Result of running standards checks on a set of files.
 */
export interface CheckResult {
  violations: Violation[];
  filesChecked: number;
  standardsConfig: string;
}
