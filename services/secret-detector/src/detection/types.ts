export interface DetectedSecret {
  filePath: string;
  lineNumber: number;
  patternName: string;
  detectionMethod: "pattern" | "entropy" | "forbidden_file";
  matchedContent?: string;
}
