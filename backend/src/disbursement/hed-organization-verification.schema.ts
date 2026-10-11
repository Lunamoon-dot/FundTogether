import { z } from "zod";

export const hedOrganizationVerificationContentSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  registrationNumber: z.string().trim().min(2).max(100),
  contactName: z.string().trim().min(2).max(200),
  contactEmail: z.string().trim().email().max(200),
  address: z.string().trim().min(5).max(500),
  activitySummary: z.string().trim().min(20).max(2_000),
  declaration: z.literal(true),
}).strict();

export const hedOrganizationVerificationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REQUEST_CHANGES", "REJECT"]),
  note: z.string().trim().min(3).max(2_000),
  validUntil: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "APPROVE" && !value.validUntil)
    context.addIssue({ code: "custom", path: ["validUntil"], message: "Approval requires a verification expiry" });
  if (value.decision !== "APPROVE" && value.validUntil)
    context.addIssue({ code: "custom", path: ["validUntil"], message: "Only approval may set verification expiry" });
});

export type HedOrganizationVerificationContent = z.infer<typeof hedOrganizationVerificationContentSchema>;
