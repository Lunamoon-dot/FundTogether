import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const unsignedInteger = z.string().regex(/^(0|[1-9]\d*)$/);
const positiveInteger = z.string().regex(/^[1-9]\d*$/);
const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const digest = z.string().regex(/^0x[\da-fA-F]{64}$/);
const idList = z.array(nonEmpty);

const documentSchema = z.object({
  documentId: nonEmpty,
  kind: z.enum([
    "REPORT",
    "INVOICE",
    "RECEIPT",
    "PAYMENT_PROOF",
    "DELIVERY_RECORD",
    "PHOTO",
    "OTHER",
  ]),
  originalName: nonEmpty,
  mediaType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  byteSize: z.number().int().positive(),
  sha256: digest,
  storageObjectId: nonEmpty,
  visibility: z.enum(["PUBLIC_REDACTED", "RESTRICTED_ORIGINAL"]),
  relatesToExpenseIds: idList,
  relatesToCriterionIds: idList,
});

const outcomeSchema = z.object({
  criterionId: nonEmpty,
  description: nonEmpty,
  documentIds: idList,
});

const expenseSchema = z.object({
  expenseId: nonEmpty,
  description: nonEmpty,
  amountMinor: unsignedInteger,
  currency: nonEmpty,
  minorUnit: z.number().int().nonnegative(),
  incurredAt: z.iso.date(),
  vendorName: nonEmpty.optional(),
  documentIds: idList,
  fundingSource: z.enum(["CAMPAIGN", "ORGANIZER", "OTHER"]),
});

const contentShape = {
  report: z
    .object({
      summary: nonEmpty,
      performedFrom: z.iso.date(),
      performedTo: z.iso.date(),
      outcomes: z.array(outcomeSchema),
    })
    .refine((report) => report.performedFrom <= report.performedTo, {
      message: "performedFrom must not be after performedTo",
      path: ["performedTo"],
    }),
  expenses: z.array(expenseSchema),
  documents: z.array(documentSchema),
};

type EvidenceContent = z.infer<z.ZodObject<typeof contentShape>>;

function validateReferences(value: EvidenceContent, ctx: z.RefinementCtx) {
  const uniqueBy = <T>(items: T[], key: (item: T) => string) =>
    new Set(items.map(key)).size === items.length;

  if (!uniqueBy(value.documents, (item) => item.documentId)) {
    ctx.addIssue({
      code: "custom",
      path: ["documents"],
      message: "documentId values must be unique",
    });
  }
  if (!uniqueBy(value.expenses, (item) => item.expenseId)) {
    ctx.addIssue({
      code: "custom",
      path: ["expenses"],
      message: "expenseId values must be unique",
    });
  }

  const documentIds = new Set(
    value.documents.map((document) => document.documentId),
  );
  const expenseIds = new Set(
    value.expenses.map((expense) => expense.expenseId),
  );
  value.report.outcomes.forEach((outcome, index) => {
    outcome.documentIds.forEach((id) => {
      if (!documentIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["report", "outcomes", index, "documentIds"],
          message: `Unknown documentId: ${id}`,
        });
      }
    });
  });
  value.expenses.forEach((expense, index) => {
    expense.documentIds.forEach((id) => {
      if (!documentIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["expenses", index, "documentIds"],
          message: `Unknown documentId: ${id}`,
        });
      }
    });
  });
  value.documents.forEach((document, index) => {
    document.relatesToExpenseIds.forEach((id) => {
      if (!expenseIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["documents", index, "relatesToExpenseIds"],
          message: `Unknown expenseId: ${id}`,
        });
      }
    });
  });
}

const evidenceContentSchema = z.object(contentShape).strict();

export const evidenceDraftContentSchema =
  evidenceContentSchema.superRefine(validateReferences);

export const evidencePackageSchema = z
  .object({
    schemaVersion: z.literal("0.1"),
    packageId: nonEmpty,
    chainId: positiveInteger,
    contractAddress: address,
    campaignId: unsignedInteger,
    milestoneIndex: unsignedInteger,
    submissionVersion: positiveInteger,
    organizerAddress: address,
    criteriaHash: digest,
    checklistVersion: nonEmpty,
    parentPackageId: nonEmpty.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    ...contentShape,
  })
  .strict()
  .superRefine(validateReferences);

export type EvidenceDraftContent = z.infer<typeof evidenceDraftContentSchema>;
export type EvidencePackage = z.infer<typeof evidencePackageSchema>;
