import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "./verify";

function sign(payload: string, secret: string): string {
  return (
    "sha256=" + createHmac("sha256", secret).update(payload, "utf8").digest("hex")
  );
}

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const payload = '{"action":"push"}';

  it("returns true for a valid signature", () => {
    const sig = sign(payload, secret);
    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(verifySignature(payload, "sha256=invalid", secret)).toBe(false);
  });

  it("returns false for undefined signature", () => {
    expect(verifySignature(payload, undefined, secret)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const sig = sign(payload, "wrong-secret");
    expect(verifySignature(payload, sig, secret)).toBe(false);
  });

  it("returns false for tampered payload", () => {
    const sig = sign(payload, secret);
    expect(verifySignature(payload + "x", sig, secret)).toBe(false);
  });

  it("returns false for mismatched length signature", () => {
    expect(verifySignature(payload, "sha256=short", secret)).toBe(false);
  });
});
