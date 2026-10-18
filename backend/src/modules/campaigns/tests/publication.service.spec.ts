import { derivePublication, isResolverWallet } from "../services/publication.service";
import { PublicationService } from "../services/publication.service";
import { campaignCommitment } from "../policies/commitment";
import { campaignDraft } from "./fixtures/draft.fixture";

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
    const { campaign, review } = fixture();
    const { service: publication } = service([[campaign], [], [review], [{ status: "VERIFIED" }], [{ address: creatorWallet, chainId: "31339" }]]);

    await expect(publication.terms("campaign", "creator")).resolves.toMatchObject({
      commitmentHash: campaign.commitmentHash,
      creatorWallet,
      onchainApproved: false,
    });
  });

  it("does not rebind a published record when the current stream already has a binding", async () => {
    const { campaign } = fixture();
    const { service: publication } = service([[campaign], [{ canonical: true }]]);

    await expect(publication.terms("campaign", "creator")).rejects.toThrow("An approved, intact Campaign commitment is required");
  });
});
