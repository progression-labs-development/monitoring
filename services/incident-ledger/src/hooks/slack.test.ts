import { describe, it, expect } from "vitest";
import { formatSlackMessage } from "./slack";
import type { IncidentEvent } from "../types";

function makeEvent(overrides: Partial<IncidentEvent["incident"]> = {}): IncidentEvent {
  return {
    event: "incident.created",
    timestamp: "2026-02-26T12:00:00.000Z",
    incident: {
      id: "inc_123",
      domain: "infrastructure",
      type: "rogue_resource",
      severity: "critical",
      fingerprint: null,
      observed: {},
      expected: {},
      delta: {},
      resource: { arn: "arn:aws:ec2:us-east-1:123:instance/i-abc" },
      actor: {},
      permitted_actions: [],
      constraints: {},
      status: "open",
      claimed_by: null,
      outcome: null,
      created_at: "2026-02-26T12:00:00.000Z",
      claimed_at: null,
      resolved_at: null,
      ...overrides,
    },
  };
}

describe("formatSlackMessage", () => {
  it("uses red color for critical severity", () => {
    const msg = formatSlackMessage(makeEvent({ severity: "critical" })) as {
      attachments: Array<{ color: string }>;
    };
    expect(msg.attachments[0].color).toBe("#e01e5a");
  });

  it("uses orange color for high severity", () => {
    const msg = formatSlackMessage(makeEvent({ severity: "high" })) as {
      attachments: Array<{ color: string }>;
    };
    expect(msg.attachments[0].color).toBe("#f2952b");
  });

  it("includes incident domain and type in title block", () => {
    const msg = formatSlackMessage(makeEvent()) as {
      attachments: Array<{ blocks: Array<{ type: string; text?: { text: string } }> }>;
    };
    const titleBlock = msg.attachments[0].blocks[0];
    expect(titleBlock.text!.text).toContain("CRITICAL");
    expect(titleBlock.text!.text).toContain("infrastructure");
    expect(titleBlock.text!.text).toContain("rogue_resource");
  });

  it("includes context block with incident id and timestamp", () => {
    const msg = formatSlackMessage(makeEvent()) as {
      attachments: Array<{
        blocks: Array<{ type: string; elements?: Array<{ text: string }> }>;
      }>;
    };
    const contextBlock = msg.attachments[0].blocks[2];
    expect(contextBlock.type).toBe("context");
    expect(contextBlock.elements![0].text).toContain("inc_123");
    expect(contextBlock.elements![0].text).toContain("2026-02-26T12:00:00.000Z");
  });
});
