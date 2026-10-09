import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { AdvanceActionInput } from "./advance-workflow.schema";
import type { AdvanceCampaignSnapshot } from "./advance.types";

export function actionTransaction(s: AdvanceCampaignSnapshot, input: AdvanceActionInput, authority: {
  organizer: boolean; resolver: boolean; contribution: string; base: string; supplement: string; baseConsumed: boolean;
}, recordHash: string | null = null, packageHash: string | null = null) {
  const c = s.campaign, now = BigInt(s.checkpoint.chainTimestamp), current = s.stages[Number(c.currentStage)];
  const fail = (reason: string): never => { throw new ConflictException(reason); };
  const owner = () => { if (!authority.organizer) throw new ForbiddenException("Current OWNER and linked organizer wallet required"); };
  const stage = input.stage === undefined ? current : s.stages[Number(input.stage)];
  const amount = BigInt(input.amount ?? "0");
  const ref = input.evidenceRef;
  const submission = current.submissions.find(v => v.version === ref?.version);
  const exactRef = () => {
    if (!ref || ref.campaignId !== s.campaignId || ref.stage !== c.currentStage || ref.version !== current.latestVersion
      || submission?.evidenceHash !== ref.evidenceHash) fail("Evidence version changed; reload");
  };
  if (input.expectedState !== c.state || input.expectedCurrentStage !== c.currentStage || input.expectedPlanHash !== c.planHash)
    fail("Campaign state or plan changed; reload");
  switch (input.action) {
    case "PUBLISH_CAMPAIGN":
      owner(); if (c.state !== "APPROVED") fail("Campaign approval required");
      return { functionName: "publishCampaign", args: [s.campaignId, c.planHash] };
    case "CANCEL_CAMPAIGN":
      owner(); if (c.refundSnapshotted || c.advanced !== "0") fail("Cancellation is only available before the first advance");
      return { functionName: "cancelCampaign", args: [s.campaignId, c.planHash] };
    case "DONATE":
      if (authority.resolver) throw new ForbiddenException("Configured resolver cannot donate");
      if (c.state !== "FUNDING" || now >= BigInt(c.fundingEnd) || amount <= 0n || amount > BigInt(c.goal) - BigInt(c.contributed))
        fail("Donation exceeds the remaining goal or funding is closed");
      return { functionName: "donate", args: [s.campaignId, input.amount] };
    case "CLAIM_ADVANCE":
      owner(); if (c.state !== "ADVANCE_AVAILABLE" || now >= BigInt(c.claimEnd) || input.stage !== c.currentStage
        || current.state !== "PENDING" || current.advanced !== "0" || BigInt(c.custody) < BigInt(current.budget)) fail("Advance is not claimable");
      if (c.currentStage !== "0") {
        const previous = s.stages[Number(c.currentStage) - 1];
        if (previous.state !== "FINALIZED" || BigInt(previous.returned) < BigInt(previous.declaredUnused)) fail("Previous stage or unused return is incomplete");
      }
      return { functionName: "claimAdvance", args: [s.campaignId, c.currentStage, c.planHash] };
    case "SUBMIT_EVIDENCE":
      owner(); if (!["EXECUTING", "SUPPLEMENT_DUE"].includes(c.state) || input.stage !== c.currentStage || !packageHash
        || now >= BigInt(current.submissionEnd) || now >= BigInt(current.hardStop) || BigInt(current.latestVersion) >= 3n) fail("Evidence submission is unavailable");
      return { functionName: "submitEvidence", args: [s.campaignId, c.currentStage, (BigInt(current.latestVersion) + 1n).toString(), packageHash] };
    case "RETURN_FUNDS":
      owner(); if (!stage || input.stage === undefined || amount <= 0n || amount > BigInt(stage.advanced) - BigInt(stage.returned)) fail("Return exceeds outstanding stage advance");
      return { functionName: "returnFunds", args: [s.campaignId, input.stage, input.amount] };
    case "FINALIZE_STAGE": {
      exactRef(); const cs = submission!.challengeCase;
      if (c.state !== "CHALLENGE_WINDOW" || !submission!.reviewed || submission!.outcome !== "MET"
        || (cs.caseUsed && cs.resolution !== "CONTINUE") || now < BigInt(current.challengeEnd)
        || now >= BigInt(current.finalizeEnd) || now >= BigInt(current.hardStop) || BigInt(current.returned) < BigInt(current.declaredUnused))
        fail("Acceptance, challenge deadline or unused return is incomplete");
      return { functionName: "finalizeStage", args: [ref] };
    }
    case "OPEN_CASE":
      exactRef(); if (!authority.resolver && BigInt(authority.contribution) === 0n) throw new ForbiddenException("Contributor or resolver required to open case");
      if (c.state !== "CHALLENGE_WINDOW" || now >= BigInt(current.challengeEnd) || now >= BigInt(current.hardStop)
        || submission!.challengeCase.caseUsed || !recordHash) fail("Case is unavailable for this evidence version");
      return { functionName: "openCase", args: [ref, recordHash] };
    case "ADD_CASE_MATERIAL":
    case "SUBMIT_CASE_RESPONSE":
      exactRef(); if (input.action === "SUBMIT_CASE_RESPONSE") owner();
      else if (BigInt(authority.contribution) === 0n) throw new ForbiddenException("Contributor required to add material");
      if (c.state !== "CASE_OPEN" || submission!.challengeCase.resolution !== "PENDING"
        || now >= BigInt(submission!.challengeCase.responseEnd) || now >= BigInt(current.hardStop) || !recordHash
        || (input.action === "SUBMIT_CASE_RESPONSE" && !/^0x0+$/.test(submission!.challengeCase.responseHash))) fail("Case response/material window is closed");
      return { functionName: input.action === "ADD_CASE_MATERIAL" ? "addCaseMaterial" : "submitCaseResponse", args: [ref, recordHash] };
    case "FINALIZE_TIMEOUT": {
      const cs = current.submissions.find(v => v.version === current.latestVersion)?.challengeCase;
      const deadline = ({ FUNDING: c.fundingEnd, FIRST_REVIEW: c.firstReviewEnd, ADVANCE_AVAILABLE: c.claimEnd,
        EXECUTING: current.submissionEnd, SUPPLEMENT_DUE: current.submissionEnd, EVIDENCE_REVIEW: current.reviewEnd,
        CHALLENGE_WINDOW: current.finalizeEnd, CASE_OPEN: cs?.resolutionEnd } as Record<string, string | undefined>)[c.state];
      if (!deadline || deadline === "0" || now < BigInt(deadline)) fail("No expired waiting-state deadline");
      return { functionName: "finalizeTimeout", args: [s.campaignId] };
    }
    case "CLAIM_REFUND":
      if (!c.refundSnapshotted || BigInt(authority.contribution) === 0n
        || (authority.baseConsumed && BigInt(authority.base) + BigInt(authority.supplement) === 0n)) fail("No new refund entitlement for this wallet");
      return { functionName: "claimRefund", args: [s.campaignId] };
    default: return fail("Use the resolver review preparation for this action");
  }
}
