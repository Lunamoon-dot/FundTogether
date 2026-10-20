import { VNextIndexerService } from "../vnext-indexer.service";
import {
  indexerStreams,
  vnextBackerProjections,
  vnextCampaignProjections,
  vnextChainEvents,
  vnextChallengeProjections,
  vnextJudgeAssignments,
  vnextJudgeLedgerProjections,
  vnextMilestoneProjections,
  vnextReviewProjections,
} from "../../database/schema";

const hash = (letter: string) => `0x${letter.repeat(64)}`;

const log = (index: number, blockNumber = 12n) => ({
  transactionHash: hash(String.fromCharCode(97 + index)),
  logIndex: index,
  blockHash: hash("b"),
  blockNumber,
});

const campaignCreated = (campaignId = 7n) => ({
  campaignId,
  creator: "0x0000000000000000000000000000000000000001",
  payoutWallet: "0x0000000000000000000000000000000000000002",
  commitmentHash: hash("c"),
  goal: 100000000n,
  fundingDeadline: 1000n,
  publicationEvidenceHash: hash("d"),
  publicationReviewCaseId: hash("e"),
  policyVersion: 2n,
});

const reviewCreated = (reviewCaseId = hash("e")) => ({
  reviewCaseId,
  campaignId: 7n,
  milestoneId: 0n,
  evidenceRevision: 1n,
  creator: "0x0000000000000000000000000000000000000001",
});

function createFakeDb() {
  const state: any = {
    streams: [],
    events: [],
    campaigns: [],
    backers: [],
    challenges: [],
    judgeLedger: [],
    milestones: [],
    reviews: [],
    assignments: [],
    failCampaignUpdate: false,
  };

  const clone = () => structuredClone({
    streams: state.streams,
    events: state.events,
    campaigns: state.campaigns,
    backers: state.backers,
    challenges: state.challenges,
    judgeLedger: state.judgeLedger,
    milestones: state.milestones,
    reviews: state.reviews,
    assignments: state.assignments,
  });

  const restore = (snapshot: any) => {
    Object.assign(state, snapshot);
  };

  const tableRows = (table: unknown) => {
    if (table === indexerStreams) return state.streams;
    if (table === vnextChainEvents) return state.events;
    if (table === vnextCampaignProjections) return state.campaigns;
    if (table === vnextBackerProjections) return state.backers;
    if (table === vnextChallengeProjections) return state.challenges;
    if (table === vnextJudgeLedgerProjections) return state.judgeLedger;
    if (table === vnextMilestoneProjections) return state.milestones;
    if (table === vnextReviewProjections) return state.reviews;
    if (table === vnextJudgeAssignments) return state.assignments;
    throw new Error("unknown test table");
  };

  const key = (table: unknown, value: any) => {
    if (table === vnextChainEvents) return `${value.streamId}:${value.transactionHash}:${value.logIndex}`;
    if (table === vnextCampaignProjections) return `${value.streamId}:${value.onchainCampaignId}`;
    if (table === vnextBackerProjections) return `${value.streamId}:${value.onchainCampaignId}:${value.backerAddress}`;
    if (table === vnextChallengeProjections) return `${value.streamId}:${value.challengeCaseId}`;
    if (table === vnextJudgeLedgerProjections) return `${value.streamId}:${value.reviewCaseId}:${value.judgeAddress}`;
    if (table === vnextMilestoneProjections) return `${value.streamId}:${value.onchainCampaignId}:${value.milestoneId}`;
    if (table === vnextReviewProjections) return `${value.streamId}:${value.reviewCaseId}`;
    if (table === vnextJudgeAssignments) return `${value.streamId}:${value.reviewCaseId}:${value.courtId}:${value.slot}`;
    return value.streamId;
  };

  const insert = (table: unknown) => ({
    values: (value: any) => {
      const rows = tableRows(table);
      const add = () => {
        const existing = rows.find((row: any) => key(table, row) === key(table, value));
        if (existing) return [];
        rows.push({ ...value });
        return [value];
      };
      const update = () => {
        const existing = rows.find((row: any) => key(table, row) === key(table, value));
        if (existing) Object.assign(existing, value);
        else rows.push({ ...value });
        return [value];
      };
      return {
        onConflictDoNothing: () => {
          const result = add();
          return {
            returning: async () => result,
            then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
          };
        },
        onConflictDoUpdate: () => update(),
        returning: async () => add(),
      };
    },
  });

  const update = (table: unknown) => ({
    set: (value: any) => ({
      where: async () => {
        if (table === vnextCampaignProjections && state.failCampaignUpdate) {
          throw new Error("simulated projection crash");
        }
        const plainValues = Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || typeof item !== "object"));
        for (const row of tableRows(table)) Object.assign(row, plainValues);
        return [value];
      },
    }),
  });

  const select = () => ({
    from: (table: unknown) => ({
      where: async () => tableRows(table),
    }),
  });

  const tx = { insert, update, select };
  const db = {
    ...tx,
    transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const snapshot = clone();
      try {
        return await callback(tx);
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    },
  };

  return { db, state };
}

function serviceWith(fakeDb: ReturnType<typeof createFakeDb>, connection: any = null) {
  return new VNextIndexerService(fakeDb.db as any, connection);
}

async function persist(service: VNextIndexerService, streamId: string, item: ReturnType<typeof log>, eventName: string, args: Record<string, unknown>) {
  return (service as any).persistEvent(streamId, item, { eventName, args });
}

describe("VNextIndexerService", () => {
  it("test_CampaignCreatedMaterializesPendingMilestoneReadModels", async () => {
    const fake = createFakeDb();
    const milestoneBudget = 100000000n;
    const acceptanceCriteriaHash = hash("f");
    const service = serviceWith(fake, {
      manifest: { campaignEscrow: hash("a") },
      client: {
        readContract: async ({ functionName, args }: any) => {
          if (functionName === "milestoneBudget" && args[1] === 0n) return milestoneBudget;
          if (functionName === "milestoneAcceptanceCriteria" && args[1] === 0n) return acceptanceCriteriaHash;
          throw new Error("unknown milestone");
        },
      },
    });

    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());

    expect(fake.state.milestones).toMatchObject([{
      onchainCampaignId: "7",
      milestoneId: 0,
      budget: milestoneBudget.toString(),
      acceptanceCriteriaHash,
      evidenceRevision: "0",
      state: 0,
      paid: false,
    }]);
  });

  it("test_IndexedPayoutReplayIsIdempotent", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());
    const payout = { campaignId: 7n, milestoneId: 0n, creator: campaignCreated().creator, amount: 25000000n };

    expect(await persist(service, "stream-1", log(1), "MilestonePaid", payout)).toBe(true);
    expect(await persist(service, "stream-1", log(1), "MilestonePaid", payout)).toBe(false);
    expect(fake.state.events).toHaveLength(2);
    expect(fake.state.campaigns).toHaveLength(1);
  });

  it("test_IndexedEnrollmentReplayIsIdempotent", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    const caseId = hash("e");
    await persist(service, "stream-1", log(0), "ReviewCaseCreated", reviewCreated(caseId));

    const enrollment = { reviewCaseId: caseId, judge: "0x0000000000000000000000000000000000000003", poolId: hash("f"), caseStake: 10000000n };
    expect(await persist(service, "stream-1", log(1), "JudgeEnrolled", enrollment)).toBe(true);
    expect(await persist(service, "stream-1", log(1), "JudgeEnrolled", enrollment)).toBe(false);
    expect(fake.state.events).toHaveLength(2);
  });

  it("test_CrashBeforeCommitReplaysExactlyOnce", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());
    fake.state.failCampaignUpdate = true;

    await expect(persist(service, "stream-1", log(1), "MilestonePaid", {
      campaignId: 7n, milestoneId: 0n, creator: campaignCreated().creator, amount: 25000000n,
    })).rejects.toThrow("simulated projection crash");
    expect(fake.state.events).toHaveLength(1);
    fake.state.failCampaignUpdate = false;
    expect(await persist(service, "stream-1", log(1), "MilestonePaid", {
      campaignId: 7n, milestoneId: 0n, creator: campaignCreated().creator, amount: 25000000n,
    })).toBe(true);
    expect(fake.state.events).toHaveLength(2);
  });

  it("test_PersistentRefundEventsUpdateCampaignProjection", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());

    await persist(service, "stream-1", log(1), "CampaignRefundsOpened", { campaignId: 7n, refundPool: 100n, contributionSnapshot: 100n });
    await persist(service, "stream-1", log(2), "RefundAllocationsFrozen", { campaignId: 7n, contributorCount: 1n, refundSnapshot: 100n });
    expect(await persist(service, "stream-1", log(2), "RefundAllocationsFrozen", { campaignId: 7n, contributorCount: 1n, refundSnapshot: 100n })).toBe(false);
    await persist(service, "stream-1", log(3), "BackerRefundClaimed", { campaignId: 7n, backer: campaignCreated().creator, amount: 100n });
    const updates = fake.state.campaigns;
    expect(updates).toHaveLength(1);
    expect(fake.state.events).toHaveLength(4);
  });

  it("test_PersistentCompletionEventUpdatesCampaignProjection", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());
    await persist(service, "stream-1", log(1), "CampaignCompleted", { campaignId: 7n });
    expect(fake.state.events).toHaveLength(2);
    expect(fake.state.campaigns).toHaveLength(1);
  });

  it("test_PersistentBackerChallengeAndJudgeLedgerEventsCreateReadModels", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    const caseId = hash("e");
    const judge = "0x0000000000000000000000000000000000000003";
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());
    await persist(service, "stream-1", log(1), "ContributionReceived", {
      campaignId: 7n,
      backer: judge,
      amount: 50n,
      cumulativeRaised: 50n,
    });
    await persist(service, "stream-1", log(2), "ChallengeOpened", {
      campaignId: 7n,
      milestoneId: 0n,
      challengeCaseId: hash("g"),
      challenger: judge,
      evidenceHash: hash("h"),
    });
    await persist(service, "stream-1", log(3), "CaseStakeReserved", {
      reviewCaseId: caseId,
      judge,
      amount: 10n,
    });
    await persist(service, "stream-1", log(4), "CaseStakeSettled", {
      reviewCaseId: caseId,
      judge,
      unlockedAmount: 9n,
      slashedAmount: 1n,
    });
    await persist(service, "stream-1", log(5), "JudgeRewardAccrued", {
      reviewCaseId: caseId,
      judge,
      amount: 1n,
    });

    expect(fake.state.backers).toHaveLength(1);
    expect(fake.state.backers[0].backerAddress).toBe(judge);
    expect(fake.state.challenges).toHaveLength(1);
    expect(fake.state.challenges[0].challengeCaseId).toBe(hash("g"));
    expect(fake.state.judgeLedger).toHaveLength(1);
    expect(fake.state.judgeLedger[0].reviewCaseId).toBe(caseId);
  });

  it("test_PersistentReviewRoundEventsPopulateCourtSummary", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    const caseId = hash("e");
    await persist(service, "stream-1", log(0), "ReviewCaseCreated", reviewCreated(caseId));
    await persist(service, "stream-1", log(1), "JurySnapshotFinalized", {
      reviewCaseId: caseId,
      snapshotBlock: 12n,
      eligibleCount: 9n,
      randomnessRequestId: hash("f"),
    });
    await persist(service, "stream-1", log(2), "ReviewRoundFinalized", {
      reviewCaseId: caseId,
      roundId: 0n,
      outcome: 1,
      passCourts: 2n,
      failCourts: 1n,
    });
    expect(fake.state.reviews[0].courtCount).toBe("3");
    expect(fake.state.reviews[0].finalizedCourtCount).toBe("3");
    expect(fake.state.reviews[0].passCourts).toBe("2");
    expect(fake.state.reviews[0].failCourts).toBe("1");
    expect(fake.state.events).toHaveLength(3);
  });

  it("test_MissingOrMalformedEventDoesNotAdvanceCheckpoint", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    (service as any).verifyDeployment = async () => undefined;
    (service as any).decode = () => null;
    (service as any).connection = {
      manifest: { chainId: 31339, campaignEscrow: hash("a"), juryReview: hash("b"), genesisHash: hash("c"), deploymentBlockNumber: "1" },
      client: {
        getBlock: async () => ({ number: 12n, hash: hash("d") }),
        getLogs: async () => [log(0)],
      },
    };

    await expect((service as any).sync()).rejects.toThrow("unknown VNext event");
    expect(fake.state.streams).toHaveLength(0);
  });
});
