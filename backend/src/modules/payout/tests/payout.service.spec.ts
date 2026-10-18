import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { campaignPayoutRequests, campaigns, platformRoles } from "../../../database/schema";
import { validateEvidenceFile } from "../../evidence/evidence-file-validation";
import { PayoutService } from "../services/payout.service";

jest.mock("../../evidence/evidence-file-validation", () => ({
  MAX_EVIDENCE_FILES: 20,
  MAX_EVIDENCE_FILE_BYTES: 10 * 1024 * 1024,
  validateEvidenceFile: jest.fn(),
}));

const validateFile = validateEvidenceFile as jest.MockedFunction<typeof validateEvidenceFile>;
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function campaign() {
  return {
    id: id("1"), creatorUserId: id("2"), category: "COMICS_ARTBOOK", status: "PUBLISHED", commitmentHash: `0x${"a".repeat(64)}`,
    frozenSnapshot: { payoutWallet: { address: "0x90f79bf6eb2c4f870365e785982e1f101e93b906" } },
  } as any;
}

function chain(state = 3, escrowed = "100") {
  return {
    status: "ON_CHAIN_CONFIRMED",
    chainTimestamp: "1000",
    snapshot: {
      state, escrowed, challengeDeadline: "900", openDisputes: "0", payoutRequestHash: `0x${"0".repeat(64)}`,
      payoutAmount: "0", payoutRequestedAt: "0", payoutDecisionHash: `0x${"0".repeat(64)}`,
    },
  } as any;
}

function query<T>(value: T) {
  const builder: any = {
    from: jest.fn(() => builder),
    where: jest.fn(() => builder),
    orderBy: jest.fn(async () => value),
    for: jest.fn(async () => value),
    then: (resolve: (value: T) => unknown) => Promise.resolve(value).then(resolve),
  };
  return builder;
}

function selectByTable(values: Map<unknown, unknown>) {
  return { from: jest.fn((table: unknown) => query(values.get(table) ?? [])) };
}

describe("PayoutService dossier boundary", () => {
  beforeEach(() => validateFile.mockResolvedValue("application/pdf"));

  it("rejects a non-integer amount before touching private storage", async () => {
    const storage = { verifyPrivateBucket: jest.fn(), put: jest.fn(), remove: jest.fn() };
    const db = { select: jest.fn(() => query([campaign()])) };
    const service = new PayoutService(db as any, storage as any, { streamId: () => "stream", runOnce: jest.fn() } as any, { chainCampaign: jest.fn() } as any);

    await expect(service.create(campaign().id, campaign().creatorUserId, {
      amount: "10.5", title: "Payout", summary: "A valid enough payout summary.", reason: "A valid enough payout reason.", breakdown: "A valid breakdown.",
    }, { explanationFiles: [{ buffer: Buffer.from("file"), originalname: "explanation.pdf", mimetype: "application/pdf" }] } as any)).rejects.toBeInstanceOf(Error);
    expect(storage.verifyPrivateBucket).not.toHaveBeenCalled();
  });

  it("rejects an amount different from canonical escrow", async () => {
    const storage = { verifyPrivateBucket: jest.fn(), put: jest.fn(), remove: jest.fn() };
    const db = { select: jest.fn(() => query([campaign()])) };
    const indexer = { streamId: () => "stream", runOnce: jest.fn() };
    const publication = { chainCampaign: jest.fn(async () => chain(3, "100")) };
    const service = new PayoutService(db as any, storage as any, indexer as any, publication as any);

    await expect(service.create(campaign().id, campaign().creatorUserId, {
      amount: "99", title: "Payout", summary: "A valid enough payout summary.", reason: "A valid enough payout reason.", breakdown: "A valid breakdown.",
    }, { explanationFiles: [{ buffer: Buffer.from("file"), originalname: "explanation.pdf", mimetype: "application/pdf" }] } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(storage.verifyPrivateBucket).not.toHaveBeenCalled();
  });

  it("requires the detailed use explanation file on the first request", async () => {
    const storage = { verifyPrivateBucket: jest.fn(), put: jest.fn(), remove: jest.fn() };
    const db = { select: jest.fn(() => query([campaign()])) };
    const service = new PayoutService(db as any, storage as any, { streamId: () => "stream", runOnce: jest.fn() } as any, { chainCampaign: jest.fn() } as any);

    await expect(service.create(campaign().id, campaign().creatorUserId, {
      amount: "10", title: "Payout", summary: "A valid enough payout summary.", reason: "A valid enough payout reason.", breakdown: "A valid breakdown.",
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.verifyPrivateBucket).not.toHaveBeenCalled();
  });

  it("requires previous-use evidence on later requests", async () => {
    const storage = { verifyPrivateBucket: jest.fn(), put: jest.fn(), remove: jest.fn() };
    const db = {
      select: jest.fn(() => selectByTable(new Map<unknown, unknown>([
        [campaigns, [campaign()]],
        [campaignPayoutRequests, [{ revision: 1, status: "REJECTED" }]],
      ]))),
    };
    const service = new PayoutService(db as any, storage as any, { streamId: () => "stream", runOnce: jest.fn() } as any, { chainCampaign: jest.fn() } as any);

    await expect(service.create(campaign().id, campaign().creatorUserId, {
      amount: "10", title: "Payout", summary: "A valid enough payout summary.", reason: "A valid enough payout reason.", breakdown: "A valid breakdown.",
    }, { explanationFiles: [{ buffer: Buffer.from("file"), originalname: "explanation.pdf", mimetype: "application/pdf" }] } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.verifyPrivateBucket).not.toHaveBeenCalled();
  });

  it("denies a non-canonical backer before revealing payout requests", async () => {
    const db = {
      select: jest.fn(() => selectByTable(new Map<unknown, unknown>([[campaigns, [campaign()]]]))),
    };
    const service = new PayoutService(db as any, {} as any, { streamId: () => "stream" } as any, {} as any);

    await expect(service.list(campaign().id, id("999"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires a canonical payout request before preparing a Resolver decision", async () => {
    const request = {
      id: id("3"), campaignId: campaign().id, streamId: "stream", status: "DRAFT", requestHash: `0x${"b".repeat(64)}`, revision: 1,
    } as any;
    const db = {
      select: jest.fn(() => selectByTable(new Map<unknown, unknown>([[campaignPayoutRequests, [request]], [platformRoles, [{ roles: ["RESOLVER"] }]]]))),
    };
    const service = new PayoutService(db as any, {} as any, { streamId: () => "stream", runOnce: jest.fn() } as any,
      { chainCampaign: jest.fn(async () => chain(3)) } as any);

    await expect(service.prepareDecision(request.id, id("4"), { outcome: "APPROVE", reason: "A valid decision reason." })).rejects.toBeInstanceOf(ConflictException);
  });
});
