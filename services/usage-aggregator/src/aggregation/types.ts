/**
 * Usage frequency classification for endpoints and CLI tools.
 */
export type UsageClassification = "commonly_used" | "rarely_used" | "never_used";

/**
 * Usage record for an API endpoint.
 */
export interface EndpointUsage {
  service: string;
  method: string;
  path: string;
  hitCount: number;
  lastSeen: string | null;
  classification: UsageClassification;
}

/**
 * Usage record for a CLI tool/command.
 */
export interface CliToolUsage {
  tool: string;
  command: string;
  hitCount: number;
  lastSeen: string | null;
  classification: UsageClassification;
}

/**
 * Aggregated usage report.
 */
export interface UsageReport {
  timeWindowDays: number;
  generatedAt: string;
  endpoints: EndpointUsage[];
  cliTools: CliToolUsage[];
  summary: {
    totalEndpoints: number;
    commonlyUsed: number;
    rarelyUsed: number;
    neverUsed: number;
    totalCliTools: number;
    cliCommonlyUsed: number;
    cliRarelyUsed: number;
    cliNeverUsed: number;
  };
}

/**
 * Thresholds for usage classification.
 */
export interface ClassificationThresholds {
  commonlyUsedMin: number;
  rarelyUsedMin: number;
}
