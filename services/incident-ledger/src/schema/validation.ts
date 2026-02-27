import { z } from "zod";

const domains = ["infrastructure", "security", "cost", "reliability", "standards"] as const;
const types = ["rogue_resource", "drift", "secret_committed", "standards_violation"] as const;
const severities = ["critical", "high", "medium", "low"] as const;

export const createIncidentSchema = z.object({
  domain: z.enum(domains),
  type: z.enum(types),
  severity: z.enum(severities),
  fingerprint: z.string().optional(),
  observed: z.record(z.unknown()).optional(),
  expected: z.record(z.unknown()).optional(),
  delta: z.record(z.unknown()).optional(),
  resource: z.record(z.unknown()).optional(),
  actor: z.record(z.unknown()).optional(),
  permitted_actions: z.array(z.string()).optional(),
  constraints: z.record(z.unknown()).optional(),
});

export const listIncidentsSchema = z.object({
  status: z.enum(["open", "claimed", "remediated", "escalated"]).optional(),
  domain: z.enum(domains).optional(),
  type: z.enum(types).optional(),
  severity: z.enum(severities).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const claimIncidentSchema = z.object({
  claimed_by: z.string().min(1),
});

export const resolveIncidentSchema = z.object({
  outcome: z.record(z.unknown()),
  status: z.enum(["remediated", "escalated"]).optional(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type ListIncidentsInput = z.infer<typeof listIncidentsSchema>;
export type ClaimIncidentInput = z.infer<typeof claimIncidentSchema>;
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;
