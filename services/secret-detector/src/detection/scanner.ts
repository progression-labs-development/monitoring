import type { DetectedSecret } from "./types";
import { scanPatterns } from "./patterns";
import { scanEntropy } from "./entropy";
import { scanForbiddenFiles } from "./files";

interface DiffFile {
  path: string;
  addedLines: { lineNumber: number; content: string }[];
}

export function parseDiff(rawDiff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileSections = rawDiff.split(/^diff --git /m).slice(1);

  for (const section of fileSections) {
    const pathMatch = section.match(/^a\/\S+ b\/(\S+)/);
    if (!pathMatch) continue;

    const filePath = pathMatch[1];
    const addedLines: { lineNumber: number; content: string }[] = [];

    const hunks = section.split(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/m);

    for (let i = 1; i < hunks.length; i += 2) {
      const startLine = parseInt(hunks[i], 10);
      const hunkBody = hunks[i + 1];
      if (!hunkBody) continue;

      let currentLine = startLine;
      const lines = hunkBody.split("\n");
      for (const line of lines) {
        if (line === "") continue;
        if (line.startsWith("+")) {
          addedLines.push({
            lineNumber: currentLine,
            content: line.slice(1),
          });
          currentLine++;
        } else if (line.startsWith("-")) {
          // removed line — don't increment
        } else if (line.startsWith("\\")) {
          // "\ No newline at end of file" — skip
        } else {
          // context line
          currentLine++;
        }
      }
    }

    files.push({ path: filePath, addedLines });
  }

  return files;
}

export function scanDiff(rawDiff: string): DetectedSecret[] {
  const files = parseDiff(rawDiff);
  const allFindings: DetectedSecret[] = [];

  // Forbidden file detection
  const filePaths = files.map((f) => f.path);
  allFindings.push(...scanForbiddenFiles(filePaths));

  // Pattern + entropy detection on added lines
  for (const file of files) {
    if (file.addedLines.length === 0) continue;

    const lines = file.addedLines.map((l) => l.content);
    const firstLineNumber = file.addedLines[0].lineNumber;

    const patternFindings = scanPatterns(lines, file.path, firstLineNumber);
    allFindings.push(...patternFindings);

    const entropyFindings = scanEntropy(lines, file.path, firstLineNumber);
    allFindings.push(...entropyFindings);
  }

  return allFindings;
}

export type { DiffFile };
