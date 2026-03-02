import type {
  UsageClassification,
  ClassificationThresholds,
} from "./types";

/**
 * Default thresholds for classification.
 * commonly_used: >= 100 hits in the time window
 * rarely_used: >= 1 hit but < 100
 * never_used: 0 hits
 */
export const DEFAULT_THRESHOLDS: ClassificationThresholds = {
  commonlyUsedMin: 100,
  rarelyUsedMin: 1,
};

/**
 * Classify a resource by its hit count.
 */
export function classify(
  hitCount: number,
  thresholds: ClassificationThresholds = DEFAULT_THRESHOLDS,
): UsageClassification {
  if (hitCount >= thresholds.commonlyUsedMin) {
    return "commonly_used";
  }
  if (hitCount >= thresholds.rarelyUsedMin) {
    return "rarely_used";
  }
  return "never_used";
}
