import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AdvanceReviewService, reviewTransaction } from "./advance-review.service";
import type { AdvanceCampaignSnapshot } from "./advance.types";
import type { AdvanceReviewInput } from "./advance-review.schema";
jest.mock("@nestjs/config", () => ({ ConfigService: class {} }));

const hash = `0x${"1".repeat(64)}` as const;
const wallet = `0x${"2".repeat(40)}`;
const input = { kind: "FIRST_ELIGIBILITY", actorWallet: wallet, expectedPlanHash: hash, reason: "Checked",
  sources: [{ description: "Registry", reference: "synthetic" }], scope: "Authority", limits: "Synthetic", conflictOfInterest: false } as AdvanceReviewInput;
function snapshot(): AdvanceCampaignSnapshot {
  return { campaignId: "0", checkpoint: { blockNumber: "10", blockHash: hash, chainTimestamp: "100" },
    campaign: { state: "FIRST_REVIEW", planHash: hash, currentStage: "0", firstReviewEnd: "101", refundSnapshotted: false },
    stages: [{ latestVersion: "1", reviewEnd: "200", hardStop: "400000", publicHash: hash,
      submissions: [{ version: "1", evidenceHash: hash, reviewed: false,
        challengeCase: { caseUsed: true, resolution: "PENDING", responseEnd: "100", resolutionEnd: "200" } }] }],
  } as unknown as AdvanceCampaignSnapshot;
}

describe("resolver transaction preparation", () => {
  it("first eligibility requires exact plan/state and a live exclusive deadline", () => {
    const s = snapshot();
    expect(reviewTransaction(s, input, hash, hash)).toEqual({ functionName: "confirmFirstAdvance", args: ["0", hash, hash, hash] });
    for (const change of [{ state: "FUNDING" }, { firstReviewEnd: "100" }, { planHash: `0x${"3".repeat(64)}` }]) {
      expect(() => reviewTransaction({ ...s, campaign: { ...s.campaign, ...change } } as AdvanceCampaignSnapshot, input, hash, hash)).toThrow(ConflictException);
    }
    expect(() => reviewTransaction(s, input, hash, null)).toThrow(ConflictException);
  });
  it("does not turn unresolved review into MET and rejects stale tuple or expired review", () => {
    const s = snapshot(); s.campaign.state = "EVIDENCE_REVIEW";
    const ref = { campaignId: "0", stage: "0", version: "1", evidenceHash: hash };
    const review = { ...input, kind: "EVIDENCE", evidenceRef: ref,
      decision: { outcome: "INCONCLUSIVE", campaignSpent: "0" } } as AdvanceReviewInput;
    expect(reviewTransaction(s, review, hash, null)).toEqual({ functionName: "requestSupplement", args: [ref, 3, hash] });
    for (const evidenceRef of [{ ...ref, version: "2" }, { ...ref, stage: "1" }, { ...ref, campaignId: "1" }, { ...ref, evidenceHash: `0x${"3".repeat(64)}` }])
      expect(() => reviewTransaction(s, { ...review, evidenceRef }, hash, null)).toThrow(ConflictException);
    s.checkpoint.chainTimestamp = "200";
    expect(() => reviewTransaction(s, review, hash, null)).toThrow(ConflictException);
  });
  it("MET needs a public commitment and enough time for the full challenge window", () => {
    const s = snapshot(); s.campaign.state = "EVIDENCE_REVIEW";
    const ref = { campaignId: "0", stage: "0", version: "1", evidenceHash: hash };
    const review = { ...input, kind: "EVIDENCE", evidenceRef: ref, publicHash: hash,
      decision: { outcome: "MET", campaignSpent: "123" } } as AdvanceReviewInput;
    expect(reviewTransaction(s, review, hash, null)).toEqual({ functionName: "approveEvidence", args: [ref, hash, hash, "123"] });
    s.stages[0].hardStop = "259300"; // challengeEnd must be strictly before hardStop.
    expect(() => reviewTransaction(s, review, hash, null)).toThrow(ConflictException);
    s.stages[0].hardStop = "400000";
    expect(() => reviewTransaction(s, { ...review, publicHash: undefined }, hash, null)).toThrow(ConflictException);
  });
  it("case decisions wait for responseEnd and reject resolved or expired cases", () => {
    const s = snapshot(); s.campaign.state = "CASE_OPEN";
    const ref = { campaignId: "0", stage: "0", version: "1", evidenceHash: hash };
    const review = { ...input, kind: "CASE", evidenceRef: ref, resolution: "CONTINUE" } as AdvanceReviewInput;
    expect(reviewTransaction(s, review, hash, null)).toEqual({ functionName: "resolveCase", args: [ref, 1, hash] });
    for (const timestamp of ["99", "200"]) {
      s.checkpoint.chainTimestamp = timestamp;
      expect(() => reviewTransaction(s, review, hash, null)).toThrow(ConflictException);
    }
    s.checkpoint.chainTimestamp = "100"; s.stages[0].submissions[0].challengeCase.resolution = "CONTINUE";
    expect(() => reviewTransaction(s, review, hash, null)).toThrow(ConflictException);
  });
  it("STOP is explicit and never granted after a terminal snapshot", () => {
    const s = snapshot();
    expect(reviewTransaction(s, { ...input, kind: "STOP" }, hash, null).functionName).toBe("stopCampaign");
    s.campaign.refundSnapshotted = true;
    expect(() => reviewTransaction(s, { ...input, kind: "STOP" }, hash, null)).toThrow(ConflictException);
  });
});

describe("fresh reviewer account and wallet authority", () => {
  function service(rows: unknown[][], contribution = 0n) {
    const tx = { select: jest.fn(() => {
      const q: Record<string, unknown> = {};
      for (const method of ["from", "where", "for"]) q[method] = () => q;
      q.then = (resolve: (rows: unknown[]) => unknown) => resolve(rows.shift() ?? []);
      return q;
    }) };
    const chain = { context: { chainId: 31338, resolver: wallet }, read: jest.fn().mockResolvedValue(contribution) };
    const review = new AdvanceReviewService({} as never, chain as never, {} as never, {} as never);
    return { review, tx, chain };
  }
  it("rejects revoked role and wrong linked wallet before chain or intent access", async () => {
    for (const rows of [[[{ roles: [] }]], [[{ roles: ["RESOLVER"] }], []]]) {
      const { review, tx, chain } = service(rows);
      await expect(review.assertReviewer(tx as never, "org", "user", wallet, "0", 10n)).rejects.toBeInstanceOf(ForbiddenException);
      expect(chain.read).not.toHaveBeenCalled();
    }
  });
  it("rejects OWNER conflict and contributions held by any wallet of the account", async () => {
    const linked = [{ address: wallet, chainId: "31338" }, { address: `0x${"4".repeat(40)}`, chainId: "31338" }];
    const owner = service([[{ roles: ["RESOLVER"] }], linked, [{ role: "OWNER" }]]);
    await expect(owner.review.assertReviewer(owner.tx as never, "org", "user", wallet, "0", 10n)).rejects.toBeInstanceOf(ForbiddenException);
    const donor = service([[{ roles: ["RESOLVER"] }], linked, []], 1n);
    await expect(donor.review.assertReviewer(donor.tx as never, "org", "user", wallet, "0", 10n)).rejects.toBeInstanceOf(ForbiddenException);
    const valid = service([[{ roles: ["RESOLVER"] }], linked, []]);
    await expect(valid.review.assertReviewer(valid.tx as never, "org", "user", wallet, "0", 10n)).resolves.toBeUndefined();
  });
});
