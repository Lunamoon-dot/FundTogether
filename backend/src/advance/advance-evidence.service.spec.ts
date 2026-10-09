import { BadRequestException } from "@nestjs/common";
jest.mock("@nestjs/config", () => ({ ConfigService: class {} }));
jest.mock("file-type", () => ({ fileTypeFromBuffer: jest.fn() }));
const { fileTypeFromBuffer } = require("file-type") as { fileTypeFromBuffer: jest.Mock };
import { validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import { validateEvidenceUpdate } from "./advance-evidence.service";
import { advanceEvidenceContentSchema, advanceEvidencePackageSchema, advancePublicManifestSchema } from "./advance-evidence.schema";
import type { AdvanceEvidenceContent } from "./advance-evidence.schema";
const id = "00000000-0000-4000-8000-000000000001", hash = `0x${"1".repeat(64)}`;
const content: AdvanceEvidenceContent = { report: { summary: "Synthetic report", performedFrom: "2026-10-01", performedTo: "2026-10-02",
  outcomes: [{ criterionId: "C1", description: "Reported", documentIds: [id] }] }, expenses: [],
  documents: [{ documentId: id, storageObjectId: id, originalName: "private.pdf", mediaType: "application/pdf",
    kind: "REPORT", byteSize: 100, sha256: hash, visibility: "RESTRICTED_ORIGINAL", relatesToExpenseIds: [], relatesToCriterionIds: ["C1"] }],
  giftReport: { deliveredPackages: 100, recipientScope: "Synthetic cohort", distributionFrom: "2026-10-01", distributionTo: "2026-10-02",
    handoverSummary: "Controlled handover", limitations: "Synthetic records only" } };

describe("B original/public evidence boundary", () => {
  it("allows criterion references but rejects client changes to uploaded hash, object or MIME", () => {
    expect(validateEvidenceUpdate(content, content, [{ criterionId: "C1" }])).toEqual(content);
    for (const delta of [{ sha256: `0x${"2".repeat(64)}` }, { storageObjectId: "another-object" },
      { mediaType: "image/png" }, { byteSize: 101 }, { originalName: "forged.pdf" }, { kind: "INVOICE" }]) {
      expect(() => validateEvidenceUpdate(content, { ...content, documents: [{ ...content.documents[0], ...delta }] }, [{ criterionId: "C1" }])).toThrow(BadRequestException);
    }
  });
  it("rejects duplicate, unknown or forged evidence/criterion references", () => {
    for (const delta of [{ documents: [content.documents[0], content.documents[0]] }, { documents: [] },
      { report: { ...content.report, outcomes: [{ criterionId: "OTHER", description: "Wrong", documentIds: [id] }] } },
      { documents: [{ ...content.documents[0], relatesToCriterionIds: ["OTHER"] }] },
      { report: { ...content.report, outcomes: [{ criterionId: "C1", description: "Wrong", documentIds: ["unknown"] }] } }])
      expect(() => validateEvidenceUpdate(content, { ...content, ...delta }, [{ criterionId: "C1" }])).toThrow();
  });
  it("limits original files and requires a separate B schema/context", () => {
    expect(advanceEvidenceContentSchema.safeParse(content).success).toBe(true);
    for (const delta of [{ documents: [{ ...content.documents[0], byteSize: 10485761 }] },
      { documents: [{ ...content.documents[0], visibility: "PUBLIC_REDACTED" }] },
      { documents: Array.from({ length: 21 }, (_, i) => ({ ...content.documents[0], documentId: `doc${i}`, storageObjectId: `doc${i}` })) }])
      expect(advanceEvidenceContentSchema.safeParse({ ...content, ...delta }).success).toBe(false);
    expect(advanceEvidencePackageSchema.safeParse({ schemaVersion: "0.1", ...content }).success).toBe(false);
    expect(advancePublicManifestSchema.safeParse({ ...content, originalName: "private.pdf" }).success).toBe(false);
  });
  it("rejects MIME spoof, empty/oversized files and malformed signatures", async () => {
    const detect = jest.mocked(fileTypeFromBuffer);
    detect.mockResolvedValue({ mime: "application/pdf", ext: "pdf" });
    const file = { buffer: Buffer.from("%PDF-1.7\nfixture"), originalname: "document.pdf", mimetype: "application/pdf" };
    await expect(validateEvidenceFile(file)).resolves.toBe("application/pdf");
    for (const change of [{ mimetype: "image/png" }, { buffer: Buffer.alloc(0) }, { buffer: Buffer.alloc(10485761) }])
      await expect(validateEvidenceFile({ ...file, ...change })).rejects.toBeInstanceOf(BadRequestException);
    detect.mockRejectedValue(new Error("Invalid header"));
    await expect(validateEvidenceFile(file)).rejects.toBeInstanceOf(BadRequestException);
  });
});
