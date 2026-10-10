import { z } from "zod";
import { organizationVerificationSchema } from "./advance-review.schema";

export const ORGANIZATION_VERIFICATION_POLICY = "organization-local-pilot-v1";
export const organizationRequestStatusSchema = z.enum(["DRAFT", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "CANCELLED"]);
export const organizationProfileSchema = z.object({
  kind: z.enum(["REGISTERED_ORGANIZATION", "VOLUNTEER_GROUP"]),
  legalName: z.string().trim().max(200), registrationNumber: z.string().trim().max(200),
  address: z.string().trim().max(2000), activityScope: z.string().trim().max(4000),
  representativeName: z.string().trim().max(200), representativeRole: z.string().trim().max(500),
  authorityBasis: z.string().trim().max(4000), identitySource: z.string().trim().max(2000),
  activityEvidence: z.string().trim().max(4000), contact: z.string().trim().max(1000),
}).strict();
export const organizationRequestContentSchema = z.object({
  profile: organizationProfileSchema,
  documentIds: z.array(z.uuid()).max(20).refine(ids => new Set(ids).size === ids.length, "Duplicate document references"),
  responseToReview: z.string().trim().max(10000),
}).strict();
export type OrganizationRequestContent = z.infer<typeof organizationRequestContentSchema>;
export const organizationRequestRevisionSchema = z.object({ expectedRevision: z.number().int().positive().max(2147483646) }).strict();
export const organizationRequestSaveSchema = organizationRequestRevisionSchema.extend({ content: organizationRequestContentSchema });
export const organizationRequestSubmitSchema = organizationRequestRevisionSchema.extend({ declaration: z.literal(true) });
export const organizationDocumentKindSchema = z.enum(["IDENTITY", "REPRESENTATION", "ACTIVITY", "OTHER"]);
export const organizationDecisionSchema = z.discriminatedUnion("decision", [
  organizationRequestRevisionSchema.extend({ decision: z.literal("APPROVE"), reviewNote: z.string().trim().min(1).max(10000),
    verification: organizationVerificationSchema.extend({ status: z.literal("VERIFIED") }),
    checks: z.object({ identity: z.literal(true), representation: z.literal(true), activity: z.literal(true), contact: z.literal(true) }).strict(),
  }),
  organizationRequestRevisionSchema.extend({ decision: z.literal("REQUEST_CHANGES"), reviewNote: z.string().trim().min(1).max(10000),
    missingItems: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
  }),
  organizationRequestRevisionSchema.extend({ decision: z.literal("REJECT"), reviewNote: z.string().trim().min(1).max(10000) }),
]);

export function emptyOrganizationRequest(name: string): OrganizationRequestContent {
  return { profile: { kind: "VOLUNTEER_GROUP", legalName: name, registrationNumber: "", address: "", activityScope: "",
    representativeName: "", representativeRole: "", authorityBasis: "", identitySource: "", activityEvidence: "", contact: "" },
  documentIds: [], responseToReview: "" };
}

export function submissionIssues(content: OrganizationRequestContent): string[] {
  const required = ["legalName", "address", "activityScope", "representativeName", "representativeRole", "authorityBasis", "identitySource", "activityEvidence", "contact"] as const;
  const missing: string[] = required.filter(key => !content.profile[key]);
  if (content.profile.kind === "REGISTERED_ORGANIZATION" && !content.profile.registrationNumber) missing.push("registrationNumber");
  if (!content.documentIds.length) missing.push("documents");
  return missing;
}

export function changedOrganizationFields(before: OrganizationRequestContent, after: OrganizationRequestContent): string[] {
  const fields = (Object.keys(before.profile) as (keyof OrganizationRequestContent["profile"])[])
    .filter(key => before.profile[key] !== after.profile[key]).map(key => `profile.${key}`);
  if (JSON.stringify([...before.documentIds].sort()) !== JSON.stringify([...after.documentIds].sort())) fields.push("documents");
  if (before.responseToReview !== after.responseToReview) fields.push("responseToReview");
  return fields;
}
