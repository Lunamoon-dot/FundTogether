import { z } from "zod";
import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
import * as api from "./advance-api.schema";
import { giftDraftSchema, giftUpdateSchema, submissionRevisionSchema } from "./advance-campaign.schema";
import { advanceActionSchema } from "./advance-workflow.schema";
import { advanceReviewSchema, organizationVerificationSchema } from "./advance-review.schema";
import { advanceEvidenceContentSchema } from "./advance-evidence.schema";
import * as organizationApi from "./organization-request-api.schema";
import { organizationDecisionSchema, organizationRequestRevisionSchema, organizationRequestSaveSchema, organizationRequestSubmitSchema } from "./organization-request.schema";

export function completeAdvanceOpenApi(document: OpenAPIObject): OpenAPIObject {
  const schemas: Record<string, z.ZodType> = { GiftDraft: giftDraftSchema, GiftUpdate: giftUpdateSchema,
    SubmissionRevision: submissionRevisionSchema, AdvanceActionInput: advanceActionSchema, AdvanceReviewInput: advanceReviewSchema,
    OrganizationVerificationInput: organizationVerificationSchema,
    OrganizationRequestSave: organizationRequestSaveSchema, OrganizationRequestSubmit: organizationRequestSubmitSchema,
    OrganizationRequestRevision: organizationRequestRevisionSchema, OrganizationDecision: organizationDecisionSchema,
    EvidenceSaveInput: z.object({ expectedRevision: z.number().int().min(0), content: advanceEvidenceContentSchema }),
    OriginalManifest: z.object({ manifestBytes: z.string(), evidenceHash: z.string() }),
    PublicManifest: z.object({ manifestBytes: z.string(), publicHash: z.string() }),
    PublicRecord: z.object({ recordHash: z.string(), recordBytes: z.string(), transactionHash: z.string(), blockHash: z.string() }),
    VerificationRecord: z.object({ id: z.uuid(), organizationId: z.uuid(), status: z.enum(["VERIFIED", "REVOKED"]), reportBytes: z.string(),
      hash: z.string(), checkedBy: z.uuid(), validUntil: z.string(), createdAt: z.string(), authority: z.literal("OFFCHAIN_VERIFICATION"), onchainAction: z.null() }),
  };
  for (const [key, value] of Object.entries({ ...api, ...organizationApi })) schemas[key[0].toUpperCase() + key.slice(1).replace(/Schema$/, "")] = value;
  schemas.VerificationHistory = z.array(schemas.VerificationRecord);
  schemas.VerificationQueue = z.array(z.object({ id: z.uuid(), name: z.string(), description: z.string(), verificationStatus: z.string() }));
  document.components ??= {};
  document.components.schemas ??= {};
  for (const [name, schema] of Object.entries(schemas)) {
    const json = z.toJSONSchema(schema, { target: "openapi-3.0", unrepresentable: "any", io: "input" });
    delete json.$schema;
    document.components.schemas[name] = json as SchemaObject;
  }
  document.components.securitySchemes = { workflowBSession: { type: "apiKey", in: "cookie", name: "ft_workflow_b_session" } };
  const route = (path: string, method: "get" | "post" | "patch", operationId: string, response: string, request?: string, nullable = false) => {
    const operation = document.paths[path]?.[method];
    if (!operation) throw new Error(`B OpenAPI controller route missing:${method}:${path}`);
    operation.operationId = operationId;
    operation.security = path.includes("/public/") ? [] : [{ workflowBSession: [] }];
    operation.responses = { [method === "post" ? "201" : "200"]: { description: "Success", content: { "application/json": {
      schema: nullable ? { allOf: [{ $ref: `#/components/schemas/${response}` }], nullable: true } : { $ref: `#/components/schemas/${response}` } } } },
      "400": { description: "Invalid input" }, "401": { description: "Account session required" }, "403": { description: "Account or wallet lacks authority" },
      "409": { description: "State/version/checkpoint changed; reload" }, "503": { description: "RPC, indexer or storage unavailable" } };
    if (request) operation.requestBody = { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${request}` } } } };
  };
  route("/v1/advance/organizations/{id}/campaigns", "post", "advanceCreateCampaign", "AdvanceDraft", "GiftDraft");
  route("/v1/advance/organizations/{id}/campaigns", "get", "advanceListDrafts", "AdvanceDraftList");
  route("/v1/advance/campaigns/{id}", "get", "advanceGetDraft", "AdvanceDraft");
  route("/v1/advance/campaigns/{id}", "patch", "advanceUpdateDraft", "AdvanceDraft", "GiftUpdate");
  route("/v1/advance/campaigns/{id}/submission", "post", "advanceFreezePlan", "AdvanceSubmissionPlan", "SubmissionRevision");
  route("/v1/advance/campaigns/{id}/submission", "get", "advanceGetSubmission", "AdvanceSubmissionPlan", undefined, true);
  route("/v1/advance/campaigns/{id}/workflow", "get", "advanceGetWorkflow", "AdvanceOwnerWorkflow");
  route("/v1/advance/campaigns/{id}/actions/prepare", "post", "advancePrepareAction", "AdvanceActionPreparation", "AdvanceActionInput");
  route("/v1/advance/public/campaigns", "get", "advanceListPublic", "AdvancePublicList");
  route("/v1/advance/public/campaigns/{id}", "get", "advanceGetPublic", "AdvancePublicDetail");
  route("/v1/advance/public/campaigns/{id}/events", "get", "advanceGetEvents", "AdvanceEvents");
  route("/v1/advance/public/records/{hash}", "get", "advanceGetPublicRecord", "PublicRecord");
  route("/v1/advance/refunds", "get", "advanceListRefunds", "AdvanceRefunds");
  route("/v1/advance/refunds/{id}", "get", "advanceGetRefunds", "AdvanceRefunds");
  route("/v1/advance/internal/reviews", "get", "advanceReviewQueue", "AdvanceReviewQueue");
  route("/v1/advance/internal/reviews/{id}/prepare", "post", "advancePrepareReview", "AdvanceActionPreparation", "AdvanceReviewInput");
  route("/v1/advance/internal/organizations/{id}/verifications", "post", "advanceVerifyOrganization", "VerificationRecord", "OrganizationVerificationInput");
  route("/v1/advance/internal/organizations", "get", "advanceVerificationQueue", "VerificationQueue");
  route("/v1/advance/internal/organizations/{id}/verifications", "get", "advanceVerificationHistory", "VerificationHistory");
  route("/v1/advance/organizations/{id}/verification-requests", "get", "advanceOrganizationRequests", "OrganizationRequestList");
  route("/v1/advance/organizations/{id}/verification-requests", "post", "advanceCreateOrganizationRequest", "OrganizationRequest");
  route("/v1/advance/verification-requests/{id}", "get", "advanceOrganizationRequest", "OrganizationRequest");
  route("/v1/advance/verification-requests/{id}", "patch", "advanceSaveOrganizationRequest", "OrganizationRequest", "OrganizationRequestSave");
  route("/v1/advance/verification-requests/{id}/submit", "post", "advanceSubmitOrganizationRequest", "OrganizationRequest", "OrganizationRequestSubmit");
  route("/v1/advance/verification-requests/{id}/cancel", "post", "advanceCancelOrganizationRequest", "OrganizationRequest", "OrganizationRequestRevision");
  route("/v1/advance/internal/verification-requests", "get", "advanceOrganizationRequestQueue", "OrganizationRequestQueue");
  route("/v1/advance/internal/verification-requests/{id}/decisions", "post", "advanceDecideOrganizationRequest", "OrganizationRequest", "OrganizationDecision");
  const organizationUpload = "/v1/advance/verification-requests/{id}/files";
  route(organizationUpload, "post", "advanceUploadOrganizationDocument", "OrganizationRequest");
  document.paths[organizationUpload].post!.requestBody = { required: true, content: { "multipart/form-data": { schema: {
    type: "object", required: ["file", "kind", "expectedRevision"], properties: { file: { type: "string", format: "binary" },
      kind: { type: "string", enum: ["IDENTITY", "REPRESENTATION", "ACTIVITY", "OTHER"] }, expectedRevision: { type: "integer", minimum: 1 } } } } } };
  const organizationDownload = document.paths["/v1/advance/verification-requests/{id}/files/{documentId}/download"].get!;
  organizationDownload.operationId = "advanceDownloadOrganizationDocument";
  organizationDownload.security = [{ workflowBSession: [] }];
  organizationDownload.responses = { "200": { description: "Private verified document", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } } };
  route("/v1/advance/campaigns/{id}/stages/{stage}/evidence", "get", "advanceGetEvidenceDraft", "AdvanceEvidenceDraft");
  route("/v1/advance/campaigns/{id}/stages/{stage}/evidence", "patch", "advanceSaveEvidenceDraft", "AdvanceEvidenceDraft", "EvidenceSaveInput");
  route("/v1/advance/campaigns/{id}/stages/{stage}/evidence/freeze", "post", "advanceFreezeEvidence", "AdvanceFrozenPackage", "SubmissionRevision");
  route("/v1/advance/evidence-packages/{packageId}/original", "get", "advanceGetOriginalManifest", "OriginalManifest");
  route("/v1/advance/evidence-packages/{packageId}/redacted", "get", "advanceGetPublication", "AdvancePublication");
  route("/v1/advance/public/evidence/{hash}", "get", "advanceGetPublicManifest", "PublicManifest");
  route("/health", "get", "advanceHealth", "AdvanceHealth");
  document.paths["/health"].get!.security = [];
  const uploadPath = "/v1/advance/campaigns/{id}/stages/{stage}/evidence/documents";
  route(uploadPath, "post", "advanceUploadOriginal", "AdvanceEvidenceDraft");
  document.paths[uploadPath].post!.requestBody = { required: true, content: { "multipart/form-data": { schema: {
    type: "object", required: ["file", "kind", "expectedRevision"], properties: { file: { type: "string", format: "binary" },
      kind: { type: "string", enum: ["REPORT", "INVOICE", "RECEIPT", "PAYMENT_PROOF", "DELIVERY_RECORD", "PHOTO", "OTHER"] },
      expectedRevision: { type: "integer", minimum: 1 } } } } } };
  const publicUpload = "/v1/advance/evidence-packages/{packageId}/redacted";
  route(publicUpload, "post", "advancePublishRedacted", "AdvancePublication");
  document.paths[publicUpload].post!.requestBody = { required: true, content: { "multipart/form-data": { schema: {
    type: "object", required: ["files", "summary", "redactionConfirmed", "originalDocumentIds"], properties: {
      files: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", format: "binary" } }, summary: { type: "string" },
      redactionConfirmed: { type: "string", enum: ["true"] }, originalDocumentIds: { type: "string", description: "JSON array of original document UUIDs in file order" } } } } } };
  for (const path of ["/v1/advance/evidence-packages/{packageId}/original/{documentId}", "/v1/advance/public/evidence/{hash}/{documentId}"]) {
    const operation = document.paths[path].get!;
    operation.operationId = path.includes("/public/") ? "advanceDownloadPublic" : "advanceDownloadOriginal";
    operation.security = path.includes("/public/") ? [] : [{ workflowBSession: [] }];
    operation.responses = { "200": { description: "Verified file bytes", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } } };
  }
  return document;
}
