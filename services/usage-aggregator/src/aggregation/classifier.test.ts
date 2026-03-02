import { describe, it, expect } from "vitest";
import { classify, DEFAULT_THRESHOLDS } from "./classifier";

describe("classify", () => {
  it("classifies high usage as commonly_used", () => {
    expect(classify(500)).toBe("commonly_used");
    expect(classify(100)).toBe("commonly_used");
  });

  it("classifies low usage as rarely_used", () => {
    expect(classify(50)).toBe("rarely_used");
    expect(classify(1)).toBe("rarely_used");
  });

  it("classifies zero usage as never_used", () => {
    expect(classify(0)).toBe("never_used");
  });

  it("respects custom thresholds", () => {
    const thresholds = { commonlyUsedMin: 10, rarelyUsedMin: 1 };
    expect(classify(10, thresholds)).toBe("commonly_used");
    expect(classify(5, thresholds)).toBe("rarely_used");
    expect(classify(0, thresholds)).toBe("never_used");
  });

  it("uses default thresholds", () => {
    expect(DEFAULT_THRESHOLDS.commonlyUsedMin).toBe(100);
    expect(DEFAULT_THRESHOLDS.rarelyUsedMin).toBe(1);
  });
});
