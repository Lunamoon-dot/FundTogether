export type VNextEvent = {
  eventName: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  args: Record<string, unknown>;
};

export type VNextCampaignProjection = {
  campaignId: string;
  creator: string;
  payoutWallet: string;
  termsHash: string;
  policyVersion: string;
  goal?: string;
  fundingDeadline?: string;
  publicationEvidenceHash?: string;
  publicationReviewCaseId?: string;
  publicationOutcome?: number;
  raised: string;
  paidOut: string;
  refunded: string;
  state: number;
  lastBlockNumber: string;
  lastEventName: string;
};

export type VNextMilestoneProjection = {
  campaignId: string;
  milestoneId: string;
  evidenceRevision: string;
  evidenceHash?: string;
  reviewCaseId?: string;
  finalOutcome?: number;
  challengeDeadline?: string;
  correctionDeadline?: string;
  state: number;
  paid: boolean;
  lastBlockNumber: string;
};

export type VNextReviewProjection = {
  reviewCaseId: string;
  rootCaseId: string;
  campaignId: string;
  milestoneId: string;
  evidenceRevision: string;
  roundId: string;
  creator: string;
  enrolledCount: string;
  outcome?: number;
  finalized: boolean;
  courtCount: string;
  finalizedCourtCount: string;
  passCourts: string;
  failCourts: string;
  lastBlockNumber: string;
};

export type VNextProjectionState = {
  campaigns: Map<string, VNextCampaignProjection>;
  milestones: Map<string, VNextMilestoneProjection>;
  reviews: Map<string, VNextReviewProjection>;
  assignments: Map<string, { reviewCaseId: string; roundId: string; courtId: string; slot: number; judgeAddress: string }>;
  seenEvents: Set<string>;
};

export function createVNextProjectionState(): VNextProjectionState {
  return {
    campaigns: new Map(),
    milestones: new Map(),
    reviews: new Map(),
    assignments: new Map(),
    seenEvents: new Set(),
  };
}

function value(args: Record<string, unknown>, key: string): unknown {
  return args[key];
}

function stringValue(args: Record<string, unknown>, key: string): string {
  const item = value(args, key);
  return typeof item === "bigint" ? item.toString() : String(item ?? "");
}

function numberValue(args: Record<string, unknown>, key: string): number {
  return Number(stringValue(args, key));
}

function lower(value: string) {
  return value.toLowerCase();
}

function touch(blockNumber: bigint) {
  return blockNumber.toString();
}

function milestoneForReview(state: VNextProjectionState, reviewCaseId: string) {
  for (const milestone of state.milestones.values()) {
    if (milestone.reviewCaseId?.toLowerCase() === reviewCaseId.toLowerCase()) return milestone;
    const review = milestone.reviewCaseId ? state.reviews.get(milestone.reviewCaseId.toLowerCase()) : undefined;
    if (review?.rootCaseId.toLowerCase() === reviewCaseId.toLowerCase()) return milestone;
  }
  return undefined;
}

export function eventIdentity(event: VNextEvent) {
  return `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

export function applyVNextEvent(state: VNextProjectionState, event: VNextEvent): boolean {
  const identity = eventIdentity(event);
  if (state.seenEvents.has(identity)) return false;
  state.seenEvents.add(identity);
  const args = event.args;
  const block = touch(event.blockNumber);

  if (event.eventName === "CampaignCreated") {
    const campaignId = stringValue(args, "campaignId");
    state.campaigns.set(campaignId, {
      campaignId,
      creator: lower(stringValue(args, "creator")),
      payoutWallet: lower(stringValue(args, "payoutWallet")),
      termsHash: lower(stringValue(args, "commitmentHash")),
      policyVersion: stringValue(args, "policyVersion"),
      goal: stringValue(args, "goal"),
      fundingDeadline: stringValue(args, "fundingDeadline"),
      publicationEvidenceHash: lower(stringValue(args, "publicationEvidenceHash")),
      publicationReviewCaseId: lower(stringValue(args, "publicationReviewCaseId")),
      raised: "0",
      paidOut: "0",
      refunded: "0",
      state: 0,
      lastBlockNumber: block,
      lastEventName: event.eventName,
    });
    return true;
  }

  const campaignId = stringValue(args, "campaignId");
  const campaign = state.campaigns.get(campaignId);
  if (event.eventName === "PublicationEvidenceSubmitted" && campaign) {
    campaign.publicationEvidenceHash = lower(stringValue(args, "evidenceHash"));
    campaign.publicationReviewCaseId = lower(stringValue(args, "reviewCaseId"));
  } else if (event.eventName === "PublicationReviewCaseChanged" && campaign) {
    campaign.publicationReviewCaseId = lower(stringValue(args, "reviewCaseId"));
  } else if (event.eventName === "PublicationFinalized" && campaign) {
    const successful = Boolean(value(args, "successful"));
    campaign.publicationOutcome = successful ? 1 : 3;
    campaign.state = successful ? 1 : 5;
  } else if (event.eventName === "ContributionReceived" && campaign) {
    campaign.raised = stringValue(args, "cumulativeRaised");
  } else if (event.eventName === "FundingFinalized" && campaign) {
    campaign.raised = stringValue(args, "raised");
    campaign.state = Boolean(value(args, "successful")) ? 3 : 5;
  } else if (event.eventName === "MilestoneEvidenceSubmitted") {
    const key = `${campaignId}:${stringValue(args, "milestoneId")}`;
    state.milestones.set(key, {
      campaignId,
      milestoneId: stringValue(args, "milestoneId"),
      evidenceRevision: stringValue(args, "evidenceRevision"),
      evidenceHash: lower(stringValue(args, "evidenceHash")),
      reviewCaseId: lower(stringValue(args, "reviewCaseId")),
      state: 2,
      paid: false,
      lastBlockNumber: block,
    });
  } else if (event.eventName === "MilestoneRevisionSubmitted") {
    const key = `${campaignId}:${stringValue(args, "milestoneId")}`;
    const milestone = state.milestones.get(key);
    if (milestone) {
      milestone.evidenceRevision = stringValue(args, "evidenceRevision");
      milestone.evidenceHash = lower(stringValue(args, "evidenceHash"));
      milestone.state = 2;
    }
  } else if (event.eventName === "MilestoneReviewStateChanged") {
    const key = `${campaignId}:${stringValue(args, "milestoneId")}`;
    const milestone = state.milestones.get(key);
    if (milestone) {
      milestone.reviewCaseId = lower(stringValue(args, "reviewCaseId"));
      milestone.state = numberValue(args, "state");
      const outcome = numberValue(args, "outcome");
      const challengeDeadline = stringValue(args, "challengeDeadline");
      const correctionDeadline = stringValue(args, "correctionDeadline");
      milestone.finalOutcome = outcome === 0 ? undefined : outcome;
      milestone.challengeDeadline = challengeDeadline === "0" ? undefined : challengeDeadline;
      milestone.correctionDeadline = correctionDeadline === "0" ? undefined : correctionDeadline;
      milestone.lastBlockNumber = block;
    }
  } else if (event.eventName === "MilestonePaid" && campaign) {
    const key = `${campaignId}:${stringValue(args, "milestoneId")}`;
    const milestone = state.milestones.get(key);
    if (milestone) {
      milestone.paid = true;
      milestone.state = 10;
    }
    campaign.paidOut = (BigInt(campaign.paidOut) + BigInt(stringValue(args, "amount"))).toString();
  } else if (event.eventName === "BackerRefundClaimed" && campaign) {
    campaign.refunded = (BigInt(campaign.refunded) + BigInt(stringValue(args, "amount"))).toString();
  } else if (event.eventName === "CampaignRefundsOpened" && campaign) {
    campaign.state = 5;
  } else if (event.eventName === "RefundAllocationsFrozen" && campaign) {
    // The canonical event records the completion of the entitlement snapshot;
    // the campaign state remains REFUNDING until every backer has claimed.
  } else if (event.eventName === "CampaignCompleted" && campaign) {
    campaign.state = 4;
  } else if (event.eventName === "ReviewCaseCreated") {
    const reviewCaseId = lower(stringValue(args, "reviewCaseId"));
    state.reviews.set(reviewCaseId, {
      reviewCaseId,
      rootCaseId: reviewCaseId,
      campaignId: stringValue(args, "campaignId"),
      milestoneId: stringValue(args, "milestoneId"),
      evidenceRevision: stringValue(args, "evidenceRevision"),
      roundId: "0",
      creator: lower(stringValue(args, "creator")),
      enrolledCount: "0",
      finalized: false,
      courtCount: "0",
      finalizedCourtCount: "0",
      passCourts: "0",
      failCourts: "0",
      lastBlockNumber: block,
    });
  } else if (event.eventName === "JudgeEnrolled") {
    const review = state.reviews.get(lower(stringValue(args, "reviewCaseId")));
    if (review) review.enrolledCount = (BigInt(review.enrolledCount) + 1n).toString();
  } else if (event.eventName === "JurySnapshotFinalized") {
    const review = state.reviews.get(lower(stringValue(args, "reviewCaseId")));
    if (review) review.courtCount = (BigInt(stringValue(args, "eligibleCount")) / 3n).toString();
  } else if (event.eventName === "CourtAssigned") {
    const reviewCaseId = lower(stringValue(args, "reviewCaseId"));
    const roundId = stringValue(args, "roundId");
    const courtId = stringValue(args, "courtId");
    for (const [slot, key] of ["judgeOne", "judgeTwo", "judgeThree"].entries()) {
      state.assignments.set(`${reviewCaseId}:${courtId}:${slot}`, {
        reviewCaseId,
        roundId,
        courtId,
        slot,
        judgeAddress: lower(stringValue(args, key)),
      });
    }
  } else if (event.eventName === "ReviewRoundFinalized") {
    const review = state.reviews.get(lower(stringValue(args, "reviewCaseId")));
    if (review) {
      review.outcome = numberValue(args, "outcome");
      review.finalized = true;
      review.finalizedCourtCount = review.courtCount;
      review.passCourts = stringValue(args, "passCourts");
      review.failCourts = stringValue(args, "failCourts");
    }
  } else if (event.eventName === "ReviewRetryOpened") {
    const reviewCaseId = lower(stringValue(args, "reviewCaseId"));
    const rootCaseId = lower(stringValue(args, "rootCaseId"));
    const previous = state.reviews.get(rootCaseId);
    if (previous) {
      state.reviews.set(reviewCaseId, {
        ...previous,
        reviewCaseId,
        rootCaseId,
        roundId: stringValue(args, "retryRoundId"),
        finalized: false,
        outcome: undefined,
        enrolledCount: "0",
        courtCount: "0",
        finalizedCourtCount: "0",
        passCourts: "0",
        failCourts: "0",
      });
    }
    const milestone = milestoneForReview(state, rootCaseId);
    if (milestone) {
      milestone.reviewCaseId = reviewCaseId;
      milestone.finalOutcome = undefined;
      milestone.challengeDeadline = undefined;
      milestone.correctionDeadline = undefined;
      milestone.state = 2;
      milestone.lastBlockNumber = block;
    }
  } else if (event.eventName === "FinalRulingEstablished") {
    const review = state.reviews.get(lower(stringValue(args, "reviewCaseId")));
    if (review) review.outcome = numberValue(args, "outcome");
  } else if (event.eventName === "AppealOpened") {
    const appealCaseId = lower(stringValue(args, "appealCaseId"));
    const rootCaseId = lower(stringValue(args, "reviewCaseId"));
    const previous = state.reviews.get(rootCaseId);
    if (previous) {
      state.reviews.set(appealCaseId, {
        ...previous,
        reviewCaseId: appealCaseId,
        rootCaseId,
        roundId: stringValue(args, "appealRoundId"),
        finalized: false,
        outcome: undefined,
        enrolledCount: "0",
        courtCount: "0",
        finalizedCourtCount: "0",
        passCourts: "0",
        failCourts: "0",
      });
    }
    const milestone = milestoneForReview(state, rootCaseId);
    if (milestone) {
      milestone.reviewCaseId = appealCaseId;
      milestone.finalOutcome = undefined;
      milestone.challengeDeadline = undefined;
      milestone.correctionDeadline = undefined;
      milestone.state = 6;
      milestone.lastBlockNumber = block;
    }
  }

  if (campaign) {
    campaign.lastBlockNumber = block;
    campaign.lastEventName = event.eventName;
  }
  return true;
}
