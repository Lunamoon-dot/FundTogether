import { VNextIndexerService } from "../vnext-indexer.service";
import {
  indexerStreams,
  vnextCampaignProjections,
  vnextChainEvents,
  vnextJudgeAssignments,
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
    milestones: [],
    reviews: [],
    assignments: [],
    failCampaignUpdate: false,
  };

  const clone = () => structuredClone({
    streams: state.streams,
    events: state.events,
    campaigns: state.campaigns,
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
    if (table === vnextMilestoneProjections) return state.milestones;
    if (table === vnextReviewProjections) return state.reviews;
    if (table === vnextJudgeAssignments) return state.assignments;
    throw new Error("unknown test table");
  };

  const key = (table: unknown, value: any) => {
    if (table === vnextChainEvents) return `${value.streamId}:${value.transactionHash}:${value.logIndex}`;
    if (table === vnextCampaignProjections) return `${value.streamId}:${value.onchainCampaignId}`;
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

function serviceWith(fakeDb: ReturnType<typeof createFakeDb>) {
  return new VNextIndexerService(fakeDb.db as any, null);
}

async function persist(service: VNextIndexerService, streamId: string, item: ReturnType<typeof log>, eventName: string, args: Record<string, unknown>) {
  return (service as any).persistEvent(streamId, item, { eventName, args });
}

describe("VNextIndexerService", () => {
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

  it("test_PersistentMilestoneStateReplayProjectsCanonicalFields", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());

    await persist(service, "stream-1", log(1), "MilestoneConfigured", {
      campaignId: 7n,
      milestoneId: 0n,
      budget: 100000000n,
      acceptanceCriteriaHash: hash("f"),
    });
    expect(await persist(service, "stream-1", log(2), "MilestoneStateChanged", {
      campaignId: 7n,
      milestoneId: 0n,
      evidenceRevision: 1n,
      evidenceHash: hash("d"),
      reviewCaseId: hash("e"),
      finalOutcome: 1,
      state: 9,
      submissionDeadline: 0n,
      correctionDeadline: 0n,
      challengeDeadline: 99n,
      paid: false,
    })).toBe(true);

    await persist(service, "stream-1", log(3), "MilestoneStateChanged", {
      campaignId: 7n,
      milestoneId: 1n,
      evidenceRevision: 0n,
      evidenceHash: `0x${"0".repeat(64)}`,
      reviewCaseId: `0x${"0".repeat(64)}`,
      finalOutcome: 0,
      state: 0,
      submissionDeadline: 0n,
      correctionDeadline: 0n,
      challengeDeadline: 0n,
      paid: false,
    });

    expect(fake.state.milestones).toHaveLength(2);
    expect(fake.state.milestones[0]).toMatchObject({
      budget: "100000000",
      acceptanceCriteriaHash: hash("f"),
      evidenceRevision: "1",
      evidenceHash: hash("d"),
      reviewCaseId: hash("e"),
      finalOutcome: 1,
      state: 9,
      submissionDeadline: "0",
      correctionDeadline: "0",
      challengeDeadline: "99",
      paid: false,
    });
    expect(fake.state.milestones[1].reviewCaseId).toBeNull();
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
    await persist(service, "stream-1", log(2), "BackerRefundClaimed", { campaignId: 7n, backer: campaignCreated().creator, amount: 100n });
    const updates = fake.state.campaigns;
    expect(updates).toHaveLength(1);
    expect(fake.state.events).toHaveLength(3);
  });

  it("test_PersistentCompletionEventUpdatesCampaignProjection", async () => {
    const fake = createFakeDb();
    const service = serviceWith(fake);
    await persist(service, "stream-1", log(0), "CampaignCreated", campaignCreated());
    await persist(service, "stream-1", log(1), "CampaignCompleted", { campaignId: 7n });
    expect(fake.state.events).toHaveLength(2);
    expect(fake.state.campaigns).toHaveLength(1);
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
