import { describe, it, expect } from "vitest";
import {
  toNanoTimestamp,
  formatToolResult,
  clampLimit,
  DEFAULT_LIMIT,
  MAX_RESULTS,
} from "./shared";

describe("toNanoTimestamp", () => {
  it("converts ISO string to nanosecond timestamp", () => {
    const result = toNanoTimestamp("2024-01-01T00:00:00.000Z");
    expect(result).toBe("1704067200000000000");
  });

  it("preserves millisecond precision", () => {
    const result = toNanoTimestamp("2024-01-01T00:00:00.123Z");
    expect(result).toBe("1704067200123000000");
  });
});

describe("formatToolResult", () => {
  it("formats object as pretty JSON text content", () => {
    const result = formatToolResult({ status: "ok" });
    expect(result.type).toBe("text");
    expect(JSON.parse(result.text)).toEqual({ status: "ok" });
  });

  it("formats arrays", () => {
    const result = formatToolResult([1, 2, 3]);
    expect(JSON.parse(result.text)).toEqual([1, 2, 3]);
  });
});

describe("clampLimit", () => {
  it("uses DEFAULT_LIMIT when undefined", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
  });

  it("clamps to MAX_RESULTS", () => {
    expect(clampLimit(500)).toBe(MAX_RESULTS);
  });

  it("clamps to minimum of 1", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it("passes through valid values", () => {
    expect(clampLimit(50)).toBe(50);
  });
});
