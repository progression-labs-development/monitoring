import { describe, it, expect } from "vitest";
import { shannonEntropy, scanEntropy } from "./entropy";

describe("shannonEntropy", () => {
  it("returns 0 for empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("returns 0 for single repeated character", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
  });

  it("returns 1 for two equally distributed characters", () => {
    expect(shannonEntropy("ab")).toBeCloseTo(1.0, 5);
  });

  it("returns high entropy for random-looking strings", () => {
    const entropy = shannonEntropy("aB3$xZ9!mK2@pL5#nQ8&");
    expect(entropy).toBeGreaterThan(4.0);
  });

  it("returns low entropy for repetitive strings", () => {
    const entropy = shannonEntropy("aaaaabbbbb");
    expect(entropy).toBeLessThan(2.0);
  });
});

describe("scanEntropy", () => {
  it("flags high-entropy tokens near context keywords", () => {
    const lines = ['api_key = "aB3xZ9mK2pL5nQ8wR7tY4uI6oP0sD1f"'];
    const results = scanEntropy(lines, "config.ts", 1);
    expect(results).toHaveLength(1);
    expect(results[0].patternName).toBe("high_entropy");
    expect(results[0].detectionMethod).toBe("entropy");
  });

  it("does not flag high-entropy without context keywords", () => {
    const lines = ['data = "aB3xZ9mK2pL5nQ8wR7tY4uI6oP0sD1f"'];
    const results = scanEntropy(lines, "config.ts", 1);
    expect(results).toHaveLength(0);
  });

  it("does not flag low-entropy tokens", () => {
    const lines = ['token = "aaaaaaaaaaaaaaaaaaaaaa"'];
    const results = scanEntropy(lines, "config.ts", 1);
    expect(results).toHaveLength(0);
  });

  it("does not flag short tokens", () => {
    const lines = ['secret = "aB3x"'];
    const results = scanEntropy(lines, "config.ts", 1);
    expect(results).toHaveLength(0);
  });

  it("tracks correct line numbers", () => {
    const lines = [
      "// comment",
      'secret = "aB3xZ9mK2pL5nQ8wR7tY4uI6oP0sD1f"',
    ];
    const results = scanEntropy(lines, "config.ts", 10);
    expect(results[0].lineNumber).toBe(11);
  });
});
