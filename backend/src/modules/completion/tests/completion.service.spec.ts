import { ConflictException, ForbiddenException } from "@nestjs/common";
import { campaignCompletionRequests, campaigns, platformRoles } from "../../../database/schema";
import { validateEvidenceFile } from "../../evidence/evidence-file-validation";
import { CompletionService } from "../services/completion.service";

jest.mock("../../evidence/evidence-file-validation", () => ({
  MAX_EVIDENCE_FILES: 20,
  MAX_EVIDENCE_FILE_BYTES: 10 * 1024 * 1024,
  validateEvidenceFile: jest.fn(),
}));

const validateFile = validateEvidenceFile as jest.MockedFunction<typeof validateEvidenceFile>;
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function campaign() {
  return {
    id: id("1"), creatorUserId: id("2"), category: "COMICS_ARTBOOK", status: "PUBLISHED",
    commitmentHash: `0x${"a".repeat(64)}`, frozenSnapshot: { payoutWallet: { address: "0x90f79bf6eb2c4f870365e785982e1f101e93b906" } },
  } as any;
}

function chain(state = 3) {
  return { status: "ON_CHAIN_CONFIRMED", chainTimestamp: "1000", snapshot: { state, challengeDeadline: "900", openDisputes: "0" } } as any;
}

function query<T>(value: T) {
  const builder: any = {
    from: jest.fn(() => builder), where: jest.fn(() => builder), orderBy: jest.fn(async () => value),
    for: jest.fn(async () => value), then: (resolve: (value: T) => unknown) => Promise.resolve(value).then(resolve),
  };
  return builder;
}

function selectByTable(values: Map<unknown, unknown>) {
  return { from: jest.fn((table: unknown) => query(values.get(table) ?? [])) };
}

describe("CompletionService dossier boundary", () => {
  beforeEach(() => validateFile.mockResolvedValue("application/pdf"));

  it("accepts an optional file and never accepts amount or destination", async () => {
    const storage = { verifyPrivateBucket: jest.fn(), put: jest.fn(), remove: jest.fn() };
    const db = { select: jest.fn(() => query([campaign()])) };
    const service = new CompletionService(db as any, storage as any, { streamId: () => "stream", runOnce: jest.fn() } as any, { chainCampaign: jest.fn(async () => chain()) } as any);
    await expect(service.create(campaign().id, campaign().creatorUserId, {
      title: "Completion dossier", summary: "A complete production summary for review.", reason: "The finished campaign is ready for settlement review.", amount: "999", destination: "admin",
    }, [])).rejects.toThrow();
    expect(storage.verifyPrivateBucket).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical backer before revealing completion requests", async () => {
    const db = { select: jest.fn(() => selectByTable(new Map<unknown, unknown>([[campaigns, [campaign()]]])) ) };
    const service = new CompletionService(db as any, {} as any, { streamId: () => "stream" } as any, {} as any);
    await expect(service.list(campaign().id, id("999"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires a canonical completion request before preparing a Resolver decision", async () => {
    const request = { id: id("3"), campaignId: campaign().id, streamId: "stream", status: "DRAFT", requestHash: `0x${"b".repeat(64)}`, revision: 1 } as any;
    const db = { select: jest.fn(() => selectByTable(new Map<unknown, unknown>([[campaignCompletionRequests, [request]], [platformRoles, [{ roles: ["RESOLVER"] }]]])) ) };
    const service = new CompletionService(db as any, {} as any, { streamId: () => "stream", runOnce: jest.fn() } as any,
      { chainCampaign: jest.fn(async () => chain(5)) } as any);
    await expect(service.prepareDecision(request.id, id("4"), { outcome: "APPROVE", reason: "A complete Resolver decision reason." })).rejects.toBeInstanceOf(ConflictException);
  });
});
