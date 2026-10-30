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
    expect(applyVNextEvent(state, event("FundingFinalized", {
      campaignId,
      successful: true,
      raised: 100000000n,
    }, 4))).toBe(true);

    const campaign = state.campaigns.get("7");
    expect(campaign?.state).toBe(3);
    expect(campaign?.raised).toBe("100000000");
    expect(state.reviews.get(caseId)?.campaignId).toBe("7");
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

  it("projects milestone review case changes and canonical ruling state", () => {
    const state = createVNextProjectionState();
    const rootCaseId = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const retryCaseId = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const campaignId = 7n;

    applyVNextEvent(state, event("CampaignCreated", {
      campaignId,
      creator: "0x0000000000000000000000000000000000000001",
      payoutWallet: "0x0000000000000000000000000000000000000002",
      commitmentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      goal: 100n,
      fundingDeadline: 1000n,
      publicationEvidenceHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      publicationReviewCaseId: rootCaseId,
      policyVersion: 1n,
    }));
    applyVNextEvent(state, event("MilestoneEvidenceSubmitted", {
      campaignId,
      milestoneId: 0n,
      evidenceRevision: 1n,
      evidenceHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      reviewCaseId: rootCaseId,
    }, 1));
    applyVNextEvent(state, event("ReviewCaseCreated", {
      reviewCaseId: rootCaseId,
      campaignId,
      milestoneId: 0n,
      evidenceRevision: 1n,
      creator: "0x0000000000000000000000000000000000000001",
    }, 2));
    applyVNextEvent(state, event("ReviewRetryOpened", {
      rootCaseId,
      retryRoundId: 1n,
      reviewCaseId: retryCaseId,
    }, 3));
    applyVNextEvent(state, event("MilestoneReviewStateChanged", {
      campaignId,
      milestoneId: 0n,
      reviewCaseId: retryCaseId,
      state: 9n,
      outcome: 1n,
      challengeDeadline: 1234n,
      correctionDeadline: 0n,
    }, 4));

    expect(state.milestones.get("7:0")).toMatchObject({
      reviewCaseId: retryCaseId,
      state: 9,
      finalOutcome: 1,
      challengeDeadline: "1234",
    });
  });

  it("caps replayed snapshots at five courts and separates provisional from final outcomes", () => {
    const state = createVNextProjectionState();
    const caseId = "0x1111111111111111111111111111111111111111111111111111111111111111";
    applyVNextEvent(state, event("ReviewCaseCreated", {
      reviewCaseId: caseId,
      campaignId: 7n,
      milestoneId: 1n,
      evidenceRevision: 2n,
      creator: "0x0000000000000000000000000000000000000001",
    }));
    applyVNextEvent(state, event("JurySnapshotFinalized", {
      reviewCaseId: caseId,
      snapshotBlock: 12n,
      eligibleCount: 18n,
      randomnessRequestId: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    }, 1));
    applyVNextEvent(state, event("ReviewRoundFinalized", {
      reviewCaseId: caseId,
      roundId: 0n,
      outcome: 1,
      passCourts: 3n,
      failCourts: 2n,
    }, 2));

    expect(state.reviews.get(caseId)).toMatchObject({
      courtCount: "5",
      roundOutcome: 1,
    });
    expect(state.reviews.get(caseId)?.finalOutcome).toBeUndefined();

    applyVNextEvent(state, event("FinalRulingEstablished", {
      reviewCaseId: caseId,
      outcome: 1,
    }, 3));
    expect(state.reviews.get(caseId)).toMatchObject({ roundOutcome: 1, finalOutcome: 1 });
  });
});
