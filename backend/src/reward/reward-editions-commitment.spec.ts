import { editionsDraft } from "./testing/editions-draft.fixture";
import { editionsCommitment } from "./reward-editions-commitment";

const snapshot = () => ({
  commitmentVersion: "editions-review-v1" as const,
  config: editionsDraft(),
  creator: { userId: "creator", profileId: "profile", displayName: "Artist", ipDeclaration: "I own all publication rights" },
  payoutWallet: { linkId: "link", chainId: "31339", address: `0x${"a".repeat(40)}` },
  preparation: { contentOutline: "A complete comic", budgetPlan: "Art and editing budget", evidencePlan: "Review page proofs", releaseWindow: { start: "2027-01-01T00:00:00.000Z", end: "2027-02-01T00:00:00.000Z" } },
  samples: [{ id: "sample", sha256: `0x${"1".repeat(64)}`, mediaType: "image/png", sizeBytes: 100 }],
});

describe("versioned Editions commitment", () => {
  it("is deterministic across JSON key order and DB serialization", () => {
    const value = snapshot();
    expect(editionsCommitment(value)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(editionsCommitment(value)).toBe(editionsCommitment(JSON.parse(JSON.stringify(value))));
    expect(editionsCommitment(value)).toBe(editionsCommitment(Object.fromEntries(Object.entries(value).reverse()) as typeof value));
  });

  it.each(["price", "pdf", "release", "evidence", "wallet", "creator", "policy"])("binds %s", field => {
    const before = snapshot();
    const after = snapshot();
    if (field === "price") after.config.tiers[0].price = "20000000";
    if (field === "pdf") after.config.tiers[0].rewardItems[0].description += " Extra pages.";
    if (field === "release") after.preparation.releaseWindow.end = "2027-03-01T00:00:00.000Z";
    if (field === "evidence") after.samples[0].sha256 = `0x${"2".repeat(64)}`;
    if (field === "wallet") after.payoutWallet.address = `0x${"b".repeat(40)}`;
    if (field === "creator") after.creator.ipDeclaration += " Coauthor permission.";
    if (field === "policy") (after.config as any).policyVersion = "different-policy";
    expect(editionsCommitment(after)).not.toBe(editionsCommitment(before));
  });
});
