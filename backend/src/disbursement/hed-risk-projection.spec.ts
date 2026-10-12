import { computeHedRiskProjection } from "./hed-blockchain.service";
import type { HedActivityView, HedCampaignView, HedRequestView } from "./hed.types";

describe("computeHedRiskProjection", () => {
  const baseCampaign: HedCampaignView = {
    organizer: "0x1111111111111111111111111111111111111111",
    commitmentHash: `0x${"1".repeat(64)}`,
    goal: "4000000000",
    fundingEnd: "1000",
    fullyFundedAt: "500",
    state: "ACTIVE",
    contributed: "4000000000",
    available: "4000000000",
    reserved: "0",
    grossPaid: "0",
    basePool: "0",
    supplementPool: "0",
    refunded: "0",
    refundSnapshotted: false,
  };

  it("calculates 25% maxRequestCap and 50% outcomeExposureLimit for zero exposure initial state", () => {
    const projection = computeHedRiskProjection(baseCampaign, [], []);
    expect(projection.maxRequestCap).toBe("1000000000"); // 4B / 4 = 1B
    expect(projection.financialExposureLimit).toBe("1000000000");
    expect(projection.financialExposure).toBe("0");
    expect(projection.financialExposureRatioBps).toBe(0);
    expect(projection.outcomeExposureLimit).toBe("2000000000"); // 4B / 2 = 2B
    expect(projection.outcomeExposure).toBe("0");
    expect(projection.outcomeExposureRatioBps).toBe(0);
    expect(projection.hasOpenRequest).toBe(false);
    expect(projection.hasOpenActivity).toBe(false);
    expect(projection.canCreateRequest).toBe(false); // No open activity yet
  });

  it("reflects active activity allowing requests and tracking outcome exposure", () => {
    const activity: HedActivityView = {
      commitmentHash: `0x${"2".repeat(64)}`,
      outcomeReportHash: `0x${"0".repeat(64)}`,
      ceiling: "1500000000",
      approved: "500000000",
      createdAt: "100",
      challengeEnd: "0",
      state: "OPEN",
    };
    const projection = computeHedRiskProjection(baseCampaign, [activity], []);
    expect(projection.hasOpenActivity).toBe(true);
    expect(projection.canCreateRequest).toBe(true);
    expect(projection.outcomeExposure).toBe("500000000");
    // 500M / 2000M = 25% = 2500 bps
    expect(projection.outcomeExposureRatioBps).toBe(2500);
  });

  it("tracks financial exposure for disbursed requests and drops to zero when settled", () => {
    const activity: HedActivityView = {
      commitmentHash: `0x${"2".repeat(64)}`,
      outcomeReportHash: `0x${"0".repeat(64)}`,
      ceiling: "1500000000",
      approved: "1000000000",
      createdAt: "100",
      challengeEnd: "0",
      state: "OPEN",
    };
    const request1: HedRequestView = {
      activityId: "0",
      requestHash: `0x${"3".repeat(64)}`,
      recipient: "0x1111111111111111111111111111111111111111",
      termsHash: `0x${"0".repeat(64)}`,
      approvedAmount: "1000000000",
      grossPaid: "1000000000",
      returned: "200000000",
      acceptedExpenditure: "800000000",
      expenditureReportHash: `0x${"4".repeat(64)}`,
      challengeEnd: "200",
      state: "EXPENDITURE_CANDIDATE",
    };

    const projection1 = computeHedRiskProjection(baseCampaign, [activity], [request1]);
    expect(projection1.hasOpenRequest).toBe(true);
    expect(projection1.canCreateRequest).toBe(false);
    // grossPaid 1000M - returned 200M = 800M
    expect(projection1.financialExposure).toBe("800000000");
    // 800M / 1000M = 80% = 8000 bps
    expect(projection1.financialExposureRatioBps).toBe(8000);

    // Now request settles
    const requestSettled: HedRequestView = {
      ...request1,
      state: "FINANCIALLY_SETTLED",
    };
    const projection2 = computeHedRiskProjection(baseCampaign, [activity], [requestSettled]);
    expect(projection2.hasOpenRequest).toBe(false);
    expect(projection2.canCreateRequest).toBe(true);
    expect(projection2.financialExposure).toBe("0");
    expect(projection2.financialExposureRatioBps).toBe(0);
  });

  it("drops outcome exposure to zero when activity is verified", () => {
    const verifiedActivity: HedActivityView = {
      commitmentHash: `0x${"2".repeat(64)}`,
      outcomeReportHash: `0x${"5".repeat(64)}`,
      ceiling: "1500000000",
      approved: "1500000000",
      createdAt: "100",
      challengeEnd: "300",
      state: "VERIFIED",
    };
    const projection = computeHedRiskProjection(baseCampaign, [verifiedActivity], []);
    expect(projection.hasOpenActivity).toBe(false);
    expect(projection.outcomeExposure).toBe("0");
    expect(projection.outcomeExposureRatioBps).toBe(0);
  });
});
