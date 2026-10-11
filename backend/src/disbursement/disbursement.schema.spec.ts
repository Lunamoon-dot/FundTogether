import { disbursementCampaignProjection, disbursementCampaigns, disbursementRequests, disbursementReviewRecords, hedCampaignDrafts } from "../database/schema/disbursement.schema";

describe("HED disbursement schema", () => {
  it("keys campaign, request and immutable criterion reviews by HED deployment identities", () => {
    expect(disbursementCampaigns.chainId.name).toBe("chain_id");
    expect(disbursementCampaigns.deploymentId.name).toBe("deployment_id");
    expect(disbursementRequests.onchainRequestId.name).toBe("onchain_request_id");
    expect(disbursementReviewRecords.criterionId.name).toBe("criterion_id");
    expect(disbursementReviewRecords.evidenceVersion.name).toBe("evidence_version");
    expect(disbursementCampaignProjection.snapshot.name).toBe("snapshot");
    expect(hedCampaignDrafts.commitmentHash.name).toBe("commitment_hash");
  });
});
