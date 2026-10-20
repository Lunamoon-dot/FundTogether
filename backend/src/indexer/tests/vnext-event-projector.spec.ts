import { applyVNextEvent, createVNextProjectionState, type VNextEvent } from "../vnext-event-projector";

const event = (eventName: string, args: Record<string, unknown>, logIndex = 0): VNextEvent => ({
  eventName,
  transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  logIndex,
  blockNumber: 12n,
  args,
});

describe("VNext event projector", () => {
  it("projects canonical campaign and review lifecycle without trusting a database decision", () => {
    const state = createVNextProjectionState();
    const campaignId = 7n;
    const caseId = "0x1111111111111111111111111111111111111111111111111111111111111111";

    expect(applyVNextEvent(state, event("CampaignCreated", {
      campaignId,
      creator: "0x0000000000000000000000000000000000000001",
      payoutWallet: "0x0000000000000000000000000000000000000002",
      commitmentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      goal: 100000000n,
      fundingDeadline: 1000n,
      publicationEvidenceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      publicationReviewCaseId: caseId,
      policyVersion: 1n,
    }))).toBe(true);
    expect(applyVNextEvent(state, event("PublicationFinalized", {
      campaignId,
      successful: true,
      reviewCaseId: caseId,
    }, 1))).toBe(true);
    expect(applyVNextEvent(state, event("ContributionReceived", {
      campaignId,
      backer: "0x0000000000000000000000000000000000000003",
      amount: 100000000n,
      cumulativeRaised: 100000000n,
    }, 2))).toBe(true);
    expect(applyVNextEvent(state, event("ReviewCaseCreated", {
      reviewCaseId: caseId,
      campaignId,
      milestoneId: 0n,
      evidenceRevision: 1n,
      creator: "0x0000000000000000000000000000000000000001",
    }, 3))).toBe(true);

    const campaign = state.campaigns.get("7");
    expect(campaign?.state).toBe(1);
    expect(campaign?.raised).toBe("100000000");
    expect(state.reviews.get(caseId)?.campaignId).toBe("7");
  });

  it("projects milestone configuration and canonical state transitions", () => {
    const state = createVNextProjectionState();
    const campaignId = 7n;
    const evidenceHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const reviewCaseId = "0x1111111111111111111111111111111111111111111111111111111111111111";

    applyVNextEvent(state, event("CampaignCreated", {
      campaignId,
      creator: "0x0000000000000000000000000000000000000001",
      payoutWallet: "0x0000000000000000000000000000000000000002",
      commitmentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      goal: 100000000n,
      fundingDeadline: 1000n,
      publicationEvidenceHash: evidenceHash,
      publicationReviewCaseId: reviewCaseId,
      policyVersion: 1n,
    }));
    expect(applyVNextEvent(state, event("MilestoneConfigured", {
      campaignId,
      milestoneId: 0n,
      budget: 100000000n,
      acceptanceCriteriaHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    }, 1))).toBe(true);
    expect(applyVNextEvent(state, event("MilestoneStateChanged", {
      campaignId,
      milestoneId: 0n,
      evidenceRevision: 1n,
      evidenceHash,
      reviewCaseId,
      finalOutcome: 1,
      state: 9,
      submissionDeadline: 0n,
      correctionDeadline: 0n,
      challengeDeadline: 99n,
      paid: false,
    }, 2))).toBe(true);

    expect(state.milestones.get("7:0")).toMatchObject({
      campaignId: "7",
      milestoneId: "0",
      budget: "100000000",
      acceptanceCriteriaHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      evidenceRevision: "1",
      evidenceHash,
      reviewCaseId,
      finalOutcome: 1,
      state: 9,
      submissionDeadline: "0",
      correctionDeadline: "0",
      challengeDeadline: "99",
      paid: false,
    });

    applyVNextEvent(state, event("MilestoneStateChanged", {
      campaignId,
      milestoneId: 1n,
      evidenceRevision: 0n,
      evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      reviewCaseId: "0x0000000000000000000000000000000000000000000000000000000000000000",
      finalOutcome: 0,
      state: 0,
      submissionDeadline: 0n,
      correctionDeadline: 0n,
      challengeDeadline: 0n,
      paid: false,
    }, 3));
    expect(state.milestones.get("7:1")?.reviewCaseId).toBeUndefined();
  });

  it("is idempotent for the same transaction log identity", () => {
    const state = createVNextProjectionState();
    const input = event("CampaignCreated", {
      campaignId: 1n,
      creator: "0x0000000000000000000000000000000000000001",
      payoutWallet: "0x0000000000000000000000000000000000000002",
      commitmentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      goal: 1n,
      fundingDeadline: 2n,
      publicationEvidenceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      publicationReviewCaseId: "0x1111111111111111111111111111111111111111111111111111111111111111",
      policyVersion: 1n,
    });
    expect(applyVNextEvent(state, input)).toBe(true);
    expect(applyVNextEvent(state, input)).toBe(false);
    expect(state.campaigns.size).toBe(1);
    expect(state.seenEvents.size).toBe(1);
  });
});
