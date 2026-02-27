export const MAX_RESULTS = 100;
export const DEFAULT_LIMIT = 20;

export function toNanoTimestamp(isoString: string): string {
  const ms = new Date(isoString).getTime();
  return String(BigInt(ms) * 1_000_000n);
}

export function formatToolResult(data: unknown): { type: "text"; text: string } {
  return { type: "text" as const, text: JSON.stringify(data, null, 2) };
}

export function clampLimit(limit: number | undefined): number {
  const n = limit ?? DEFAULT_LIMIT;
  return Math.max(1, Math.min(n, MAX_RESULTS));
}
