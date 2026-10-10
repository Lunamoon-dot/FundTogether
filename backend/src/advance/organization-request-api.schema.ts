import { z } from "zod";
import { organizationRequestContentSchema, organizationRequestStatusSchema } from "./organization-request.schema";

const document = z.object({ id: z.uuid(), organizationId: z.uuid(), requestId: z.uuid(), uploadedBy: z.uuid(),
  kind: z.string(), originalName: z.string(), mediaType: z.string(), byteSize: z.number(), hash: z.string(), createdAt: z.string() });
export const organizationRequestSchema = z.object({
  id: z.uuid(), organizationId: z.uuid(), status: organizationRequestStatusSchema, revision: z.number(),
  content: organizationRequestContentSchema, policyId: z.string(), snapshotBytes: z.string().nullable(), snapshotHash: z.string().nullable(),
  submittedAt: z.string().nullable(), reviewedAt: z.string().nullable(), reviewedBy: z.uuid().nullable(), reviewNote: z.string().nullable(),
  missingItems: z.array(z.string()), verificationRecordId: z.uuid().nullable(), createdBy: z.uuid(), createdAt: z.string(), updatedAt: z.string(),
  documents: z.array(document),
});
export const organizationVerificationSummarySchema = z.object({ status: z.enum(["UNVERIFIED", "VERIFIED", "EXPIRED", "SUSPENDED"]).nullable(),
  verifiedAt: z.string().nullable(), verificationExpiresAt: z.string().nullable(), recordId: z.uuid().nullable(),
  requiresReverification: z.boolean(), checkedBlock: z.string().nullable(), chainTimestamp: z.string().nullable(), error: z.string().nullable() });
export const organizationRequestListSchema = z.object({ organization: z.object({ id: z.uuid(), name: z.string(), verificationStatus: z.string() }),
  requests: z.array(organizationRequestSchema), isOwner: z.boolean(), verification: organizationVerificationSummarySchema,
  audit: z.array(z.object({ id: z.uuid(), organizationId: z.uuid(), requestId: z.uuid(), actorId: z.uuid(), action: z.string(),
    changedFields: z.array(z.string()), happenedAt: z.string() })),
});
export const organizationRequestQueueSchema = z.object({ items: z.array(z.object({ id: z.uuid(), organizationId: z.uuid(), name: z.string(),
  status: organizationRequestStatusSchema, submittedAt: z.string().nullable(), reviewedAt: z.string().nullable() })), nextOffset: z.number().nullable() });
