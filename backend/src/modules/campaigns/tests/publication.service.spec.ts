import { derivePublication, isResolverWallet } from "../services/publication.service";
import { PublicationService } from "../services/publication.service";
import { campaignCommitment } from "../policies/commitment";
import { campaignDraft } from "./fixtures/draft.fixture";
import { derivePublicationJudgeCase } from "../policies/publication-judge-case";

describe("derivePublication", () => {
  const event = (campaignId: string, canonical: boolean, transactionHash: string) => ({
    transactionHash,
    args: { campaignId },
    canonical,
  });
  const binding = (onchainCampaignId: string, canonical: boolean, state: number) => ({
    onchainCampaignId,
    canonical,
    snapshot: { state },
  });

  it("distinguishes missing, orphaned and canonical bindings without a historical campaign id", () => {
    expect(derivePublication([], [])).toEqual({
      binding: undefined,
      publicationStatus: "NOT_PUBLISHED",
      bindingTransactionHash: null,
    });

    const orphaned = derivePublication(
      [binding("7", false, 0)],
      [event("7", false, `0x${"1".repeat(64)}`)],
    );
    expect(orphaned).toMatchObject({
      binding: undefined,
      publicationStatus: "ORPHANED",
      bindingTransactionHash: `0x${"1".repeat(64)}`,
    });

    for (const state of [0, 1, 2, 3, 4, 5]) {
      const canonical = derivePublication(
        [binding("8", true, state)],
        [event("8", true, `0x${"2".repeat(64)}`)],
      );
      expect(canonical.publicationStatus).toBe("ON_CHAIN_CONFIRMED");
      expect(canonical.binding?.snapshot.state).toBe(state);
      expect(canonical.bindingTransactionHash).toBe(`0x${"2".repeat(64)}`);
    }
  });

  it("fails closed when more than one canonical binding exists", () => {
    const result = derivePublication(
      [binding("1", true, 0), binding("2", true, 0)],
      [event("1", true, `0x${"3".repeat(64)}`)],
    );
    expect(result.publicationStatus).toBe("ORPHANED");
    expect(result.binding).toBeUndefined();
  });
});

describe("isResolverWallet", () => {
  const deployment = { resolver: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", backupResolver: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" };

  it("rejects both resolver wallets regardless of address casing", () => {
    expect(isResolverWallet(deployment.resolver.toUpperCase(), deployment)).toBe(true);
    expect(isResolverWallet(deployment.backupResolver.toUpperCase(), deployment)).toBe(true);
  });

  it("allows the configured creator wallet", () => {
    expect(isResolverWallet("0x90f79bf6eb2c4f870365e785982e1f101e93b906", deployment)).toBe(false);
  });
});

describe("derivePublicationJudgeCase", () => {
  const creator = "0x0000000000000000000000000000000000000001";
  const commitment = `0x${"a".repeat(64)}`;
  const otherCommitment = `0x${"b".repeat(64)}`;
  const event = (eventName: string, args: Record<string, unknown>, transactionHash: string, canonical = true) => ({
    eventName, args, transactionHash, logIndex: 0, blockNumber: "1", blockHash: `0x${"1".repeat(64)}`, canonical,
  });

  const created = (value = commitment) => event("JudgeCaseCreated", {
    caseId: "7", creator, commitmentHash: value, termsHash: `0x${"c".repeat(64)}`, voteDeadline: "200", selectionSeed: `0x${"d".repeat(64)}`,
  }, `0x${"1".repeat(64)}`);

  it("reduces an open case and ignores a replayed non-canonical event", () => {
    const result = derivePublicationJudgeCase([
      created(),
      event("JudgeSelected", { caseId: "7", seat: 1, judge: "0x0000000000000000000000000000000000000011" }, `0x${"2".repeat(64)}`),
      event("JudgeSelected", { caseId: "7", seat: 0, judge: "0x0000000000000000000000000000000000000010" }, `0x${"3".repeat(64)}`),
      event("JudgeSelected", { caseId: "7", seat: 2, judge: "0x0000000000000000000000000000000000000012" }, `0x${"4".repeat(64)}`),
      event("JudgeVoted", { caseId: "7", judge: "0x0000000000000000000000000000000000000010", approved: true }, `0x${"5".repeat(64)}`),
      event("JudgeVoted", { caseId: "7", judge: "0x0000000000000000000000000000000000000010", approved: false }, `0x${"5".repeat(64)}`),
      event("JudgeVoted", { caseId: "7", judge: "0x0000000000000000000000000000000000000011", approved: false }, `0x${"6".repeat(64)}`, false),
    ], commitment);

    expect(result).toMatchObject({ caseId: "7", creator, commitmentHash: commitment, voteDeadline: "200", status: "OPEN", approveVotes: 1, rejectVotes: 0 });
    expect(result?.judges).toEqual([
      "0x0000000000000000000000000000000000000010",
      "0x0000000000000000000000000000000000000011",
      "0x0000000000000000000000000000000000000012",
    ]);
    expect(result?.votes).toEqual([{ judge: "0x0000000000000000000000000000000000000010", approved: true }]);
  });

  it.each([
    ["APPROVED", 1, { status: "APPROVED", decisionHash: `0x${"e".repeat(64)}`, approveVotes: 2, rejectVotes: 1 }],
    ["REJECTED", 2, { status: "REJECTED", decisionHash: `0x${"f".repeat(64)}`, approveVotes: 1, rejectVotes: 2 }],
    ["EXPIRED", 3, { status: "EXPIRED", decisionHash: `0x${"9".repeat(64)}`, approveVotes: 1, rejectVotes: 1 }],
  ])("derives a canonical %s resolution only from JudgeCaseResolved", (status, numericStatus, expected) => {
    const result = derivePublicationJudgeCase([
      created(),
      event("JudgeCaseResolved", { caseId: "7", status: numericStatus, decisionHash: expected.decisionHash, approveVotes: expected.approveVotes, rejectVotes: expected.rejectVotes }, `0x${"8".repeat(64)}`),
    ], commitment);
    expect(result).toMatchObject(expected);
  });

  it("returns null for a different commitment or without a matching creation event", () => {
    expect(derivePublicationJudgeCase([created(otherCommitment)], commitment)).toBeNull();
    expect(derivePublicationJudgeCase([event("JudgeSelected", { caseId: "7", seat: 0, judge: creator }, `0x${"2".repeat(64)}`)], commitment)).toBeNull();
  });
});

describe("PublicationService.terms", () => {
  const creatorWallet = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
  const deployment = {
    resolver: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    backupResolver: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  };

  function fixture() {
    const snapshot = {
      commitmentVersion: "campaigns-review-v1" as const,
      config: campaignDraft(),
      creator: { userId: "creator", profileId: "profile", displayName: "Creator", ipDeclaration: "I own this work" },
      payoutWallet: { linkId: "wallet", chainId: "31339", address: creatorWallet },
      preparation: { contentOutline: "A complete outline for the digital comic.", budgetPlan: "A complete budget plan for production.", evidencePlan: "A complete evidence plan for production." },
      samples: [{ id: "sample", sha256: `0x${"1".repeat(64)}`, mediaType: "image/png", sizeBytes: 1 }],
    };
    return {
      snapshot,
      campaign: { id: "campaign", creatorUserId: "creator", category: "COMICS_ARTBOOK", status: "PUBLISHED", frozenSnapshot: snapshot, commitmentHash: campaignCommitment(snapshot) },
      review: { frozenSnapshot: snapshot, resolverUserId: "resolver" },
    };
  }

  function service(rows: unknown[]) {
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({ where: jest.fn(async () => rows.shift()) })),
      })),
    };
    const indexer = {
      deployment: jest.fn(async () => deployment),
      chainTime: jest.fn(async () => 100n),
      isTermsApproved: jest.fn(async () => ({ approved: false })),
      streamId: jest.fn(() => "current-stream"),
    };
    return { service: new PublicationService(db as any, indexer as any), indexer };
  }

  it("allows a published record to prepare publication terms when the current stream has no canonical binding", async () => {
    const { campaign } = fixture();
    const { service: publication } = service([[campaign], [], [], [{ address: creatorWallet, chainId: "31339" }]]);

    await expect(publication.terms("campaign", "creator")).resolves.toMatchObject({
      commitmentHash: campaign.commitmentHash,
      creatorWallet,
      onchainApproved: false,
    });
  });

  it("does not rebind a published record when the current stream already has a binding", async () => {
    const { campaign } = fixture();
    const { service: publication } = service([[campaign], [], [{ canonical: true }]]);

    await expect(publication.terms("campaign", "creator")).rejects.toThrow("A current frozen Campaign commitment is required");
  });
});
