import type { CampaignChainSnapshot } from "../../../database/schema";
import {
  canUploadEvidence,
  currentFeedbackTargets,
  deriveEntitlementAccess,
  currentReviewTargets,
} from "../policies/delivery.policy";

const zeroHash = `0x${"0".repeat(64)}`;
const releaseEvidenceHash = `0x${"1".repeat(64)}`;

const chainSnapshot = (state: number, overrides: Partial<CampaignChainSnapshot> = {}) => ({
  state,
  releaseEvidenceHash,
  ...overrides,
}) as CampaignChainSnapshot;

describe("Campaign delivery policies", () => {
  it("targets only the current frozen commitment and submitted samples", () => {
    const targets = currentReviewTargets({
      commitmentHash: "0xcommitment",
      frozenSnapshot: { samples: [{ sha256: "0xsample-1" }, { sha256: "0xsample-2" }] },
    });

    expect([...targets]).toEqual(["0xcommitment", "0xsample-1", "0xsample-2"]);
    expect(currentReviewTargets({ commitmentHash: null, frozenSnapshot: null })).toEqual(new Set());
  });

  it("adds only current canonical evidence and challenge hashes after approval", () => {
    const productionHash = `0x${"2".repeat(64)}`;
    const challengeHash = `0x${"3".repeat(64)}`;
    const targets = currentFeedbackTargets({
      commitmentHash: "0xcommitment",
      frozenSnapshot: { samples: [{ sha256: "0xsample" }] },
      chain: {
        snapshot: chainSnapshot(3, { productionHash, releaseEvidenceHash }),
        challenges: [{ evidenceHash: challengeHash }],
      },
      zeroHash,
    });

    expect([...targets]).toEqual([
      "0xcommitment",
      "0xsample",
      productionHash,
      releaseEvidenceHash,
      challengeHash,
    ]);
    expect(currentFeedbackTargets({
      commitmentHash: "0xcommitment",
      frozenSnapshot: { samples: [] },
      chain: { snapshot: chainSnapshot(1, { productionHash: zeroHash, releaseEvidenceHash: zeroHash }), challenges: [] },
      zeroHash,
    })).toEqual(new Set(["0xcommitment"]));
  });

  it("allows production evidence only while production is pending", () => {
    expect(canUploadEvidence(chainSnapshot(1, { productionHash: zeroHash, productionApproved: false }), "PRODUCTION_EVIDENCE", zeroHash)).toBe(true);
    expect(canUploadEvidence(chainSnapshot(1, { productionHash: releaseEvidenceHash, productionApproved: false }), "PRODUCTION_EVIDENCE", zeroHash)).toBe(false);
    expect(canUploadEvidence(chainSnapshot(1, { productionHash: zeroHash, productionApproved: true }), "PRODUCTION_EVIDENCE", zeroHash)).toBe(false);
  });

  it("allows a final PDF only after production approval", () => {
    expect(canUploadEvidence(chainSnapshot(1, { productionApproved: false }), "FINAL_PDF", zeroHash)).toBe(false);
    expect(canUploadEvidence(chainSnapshot(1, { productionApproved: true }), "FINAL_PDF", zeroHash)).toBe(true);
    expect(canUploadEvidence(chainSnapshot(0, { productionApproved: true }), "FINAL_PDF", zeroHash)).toBe(false);
  });

  it("derives access from canonical entitlement and chain state", () => {
    const confirmedAt = new Date("2026-10-15T00:00:00.000Z");
    const base = {
      canonical: true,
      refunded: false,
      streamId: "campaigns:current",
      currentStreamId: "campaigns:current",
      confirmedEvidenceHash: releaseEvidenceHash,
      confirmedAt,
      releaseAvailable: true,
    };

    expect(deriveEntitlementAccess({ ...base, refunded: true, binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "REFUNDED", confirmedAt: null });
    expect(deriveEntitlementAccess({ ...base, streamId: "campaigns:old", binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "ORPHANED", confirmedAt: null });
    expect(deriveEntitlementAccess({ ...base, binding: { snapshot: chainSnapshot(4) } })).toMatchObject({ access: "REFUND_ELIGIBLE", confirmedAt: null });
    expect(deriveEntitlementAccess({ ...base, binding: { snapshot: chainSnapshot(1) } })).toMatchObject({ access: "PENDING_RELEASE", confirmedAt: null });
    expect(deriveEntitlementAccess({ ...base, binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "DOWNLOAD_ELIGIBLE", confirmedAt });
    expect(deriveEntitlementAccess({ ...base, releaseAvailable: false, binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "DELIVERY_UNAVAILABLE", confirmedAt: null });
  });
});
