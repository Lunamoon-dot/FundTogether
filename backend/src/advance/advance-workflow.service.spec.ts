import { ConflictException, ForbiddenException } from "@nestjs/common";
import { actionTransaction } from "./advance-action-policy";
import { workflowFromSnapshot } from "./advance-workflow.service";
import type { AdvanceActionInput } from "./advance-workflow.schema";
import type { AdvanceCampaignSnapshot } from "./advance.types";
jest.mock("@nestjs/config", () => ({ ConfigService: class {} }));
const hash = `0x${"1".repeat(64)}` as const, zero = `0x${"0".repeat(64)}` as const;
const authority = { organizer: false, resolver: false, contribution: "1", base: "0", supplement: "0", baseConsumed: false };
const owner = { ...authority, organizer: true };
function snapshot(): AdvanceCampaignSnapshot {
  return { campaignId: "0", checkpoint: { blockNumber: "5", blockHash: hash, chainTimestamp: "100" },
    campaign: { state: "ADVANCE_AVAILABLE", currentStage: "0", planHash: hash, claimEnd: "101", custody: "100", goal: "100",
      contributed: "100", advanced: "0", returned: "0", refunded: "0", basePool: "0", supplementPool: "0", refundSnapshotted: false },
    stages: [{ state: "PENDING", budget: "100", advanced: "0", returned: "0", declaredUnused: "0", latestVersion: "1",
      submissionEnd: "101", reviewEnd: "101", challengeEnd: "100", finalizeEnd: "200", hardStop: "200", submissions: [{ version: "1", evidenceHash: hash,
        reviewed: true, outcome: "MET", challengeCase: { caseUsed: false, resolution: "PENDING", responseHash: zero, responseEnd: "101", resolutionEnd: "200" } }] }],
  } as unknown as AdvanceCampaignSnapshot;
}
const request = (s: AdvanceCampaignSnapshot, action: AdvanceActionInput["action"], extra = {}) => ({ action, expectedState: s.campaign.state,
  expectedCurrentStage: s.campaign.currentStage, expectedPlanHash: hash, stage: "0", ...extra } as AdvanceActionInput);
const ref = { campaignId: "0", stage: "0", version: "1", evidenceHash: hash };
describe("B action preparation state/financial policy", () => {
  it("requires the owner wallet, one advance, sufficient custody and an unexpired claim deadline", () => {
    const s = snapshot(), input = request(s, "CLAIM_ADVANCE");
    expect(actionTransaction(s, input, owner)).toEqual({ functionName: "claimAdvance", args: ["0", "0", hash] });
    expect(() => actionTransaction(s, input, authority)).toThrow(ForbiddenException);
    for (const change of [{ custody: "99" }, { claimEnd: "100" }])
      expect(() => actionTransaction({ ...s, campaign: { ...s.campaign, ...change } }, input, owner)).toThrow(ConflictException);
    s.stages[0].advanced = "100";
    expect(() => actionTransaction(s, input, owner)).toThrow(ConflictException);
  });
  it("donation caps use exact integers and closing time is exclusive", () => {
    const s = snapshot(); Object.assign(s.campaign, { state: "FUNDING", fundingEnd: "101", goal: "9007199254740993", contributed: "9007199254740991" });
    expect(actionTransaction(s, request(s, "DONATE", { amount: "2" }), authority).args).toEqual(["0", "2"]);
    expect(() => actionTransaction(s, request(s, "DONATE", { amount: "3" }), authority)).toThrow();
    expect(() => actionTransaction(s, request(s, "DONATE", { amount: "2" }), { ...authority, resolver: true })).toThrow(ForbiddenException);
    s.checkpoint.chainTimestamp = "101";
    expect(() => actionTransaction(s, request(s, "DONATE", { amount: "2" }), authority)).toThrow();
  });
  it("only the exact submitted MET version can finalize; unused funds and active cases block it", () => {
    const s = snapshot(); s.campaign.state = "CHALLENGE_WINDOW";
    const input = request(s, "FINALIZE_STAGE", { evidenceRef: ref });
    expect(actionTransaction(s, input, { ...authority, contribution: "0" }).functionName).toBe("finalizeStage");
    expect(() => actionTransaction(s, { ...input, evidenceRef: { ...ref, version: "2" } }, authority)).toThrow();
    s.stages[0].declaredUnused = "1";
    expect(() => actionTransaction(s, input, authority)).toThrow();
    s.stages[0].returned = "1"; s.stages[0].submissions[0].challengeCase.caseUsed = true;
    expect(() => actionTransaction(s, input, authority)).toThrow();
    s.stages[0].submissions[0].challengeCase.resolution = "CONTINUE";
    expect(actionTransaction(s, input, authority).functionName).toBe("finalizeStage");
  });
  it("permissionless timeout needs no contribution or resolver role but does require the deadline", () => {
    const s = snapshot(); s.campaign.state = "EVIDENCE_REVIEW";
    const input = request(s, "FINALIZE_TIMEOUT");
    expect(() => actionTransaction(s, input, { ...authority, contribution: "0" })).toThrow();
    s.checkpoint.chainTimestamp = "101";
    expect(actionTransaction(s, input, { ...authority, contribution: "0" })).toEqual({ functionName: "finalizeTimeout", args: ["0"] });
  });
  it("zero base entitlement can be consumed once and later supplement remains claimable", () => {
    const s = snapshot(); Object.assign(s.campaign, { state: "STOPPED", refundSnapshotted: true });
    const input = request(s, "CLAIM_REFUND");
    expect(actionTransaction(s, input, authority).functionName).toBe("claimRefund");
    expect(() => actionTransaction(s, input, { ...authority, baseConsumed: true })).toThrow();
    expect(actionTransaction(s, input, { ...authority, baseConsumed: true, supplement: "1" }).functionName).toBe("claimRefund");
    expect(() => actionTransaction(s, input, { ...authority, contribution: "0" })).toThrow();
  });
  it("late returns are stage-specific and never exceed the outstanding advance", () => {
    const s = snapshot(); Object.assign(s.campaign, { state: "STOPPED", refundSnapshotted: true });
    Object.assign(s.stages[0], { advanced: "100", returned: "40" });
    expect(actionTransaction(s, request(s, "RETURN_FUNDS", { amount: "60" }), owner).args).toEqual(["0", "0", "60"]);
    expect(() => actionTransaction(s, request(s, "RETURN_FUNDS", { amount: "61" }), owner)).toThrow();
    expect(() => actionTransaction(s, request(s, "RETURN_FUNDS", { amount: "1", stage: "1" }), owner)).toThrow();
  });
  it("case opening uses contributor rights and closes at the exact deadline", () => {
    const s = snapshot(); s.campaign.state = "CHALLENGE_WINDOW"; s.stages[0].challengeEnd = "101";
    const input = request(s, "OPEN_CASE", { evidenceRef: ref });
    expect(actionTransaction(s, input, authority, hash).functionName).toBe("openCase");
    expect(() => actionTransaction(s, input, { ...authority, contribution: "0" }, hash)).toThrow(ForbiddenException);
    s.checkpoint.chainTimestamp = "101";
    expect(() => actionTransaction(s, input, authority, hash)).toThrow();
  });
  it("workflow does not label advance as acceptance or turn an unresolved case into approval", () => {
    const s = snapshot(); s.campaign.state = "CASE_OPEN"; s.campaign.advanced = "100"; s.campaign.custody = "0";
    const workflow = workflowFromSnapshot(s);
    expect(workflow.state).toBe("CASE_OPEN"); expect(workflow.advanced).toBe("100"); expect(workflow.custody).toBe("0");
    expect(workflow.deadlines.responseEnd).toBe("101"); expect(workflow.deadlines.resolutionEnd).toBe("200");
  });
});
