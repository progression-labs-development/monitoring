import { z } from "zod";

export const signozAlertSchema = z.object({
  status: z.enum(["firing", "resolved", "inactive"]),
  alerts: z.array(
    z.object({
      status: z.enum(["firing", "resolved", "inactive"]),
      labels: z.record(z.string()).default({}),
      annotations: z.record(z.string()).default({}),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      generatorURL: z.string().optional(),
      fingerprint: z.string(),
    }),
  ),
  groupLabels: z.record(z.string()).default({}),
  commonLabels: z.record(z.string()).default({}),
  commonAnnotations: z.record(z.string()).default({}),
  externalURL: z.string().optional(),
  groupKey: z.string().optional(),
});

export type SignozWebhookPayload = z.infer<typeof signozAlertSchema>;
export type SignozAlert = SignozWebhookPayload["alerts"][number];
