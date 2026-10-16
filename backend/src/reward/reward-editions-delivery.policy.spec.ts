import type { EditionsChainSnapshot } from "../database/schema";
import {
  canUploadEditionsEvidence,
  currentEditionsFeedbackTargets,
  deriveEditionsEntitlementAccess,
  currentEditionsReviewTargets,
} from "./reward-editions-delivery.policy";

const zeroHash = `0x${"0".repeat(64)}`;
const releaseEvidenceHash = `0x${"1".repeat(64)}`;

const chainSnapshot = (state: number, overrides: Partial<EditionsChainSnapshot> = {}) => ({
  state,
  releaseEvidenceHash,
  ...overrides,
}) as EditionsChainSnapshot;

describe("Editions delivery policies", () => {
  it("targets only the current frozen commitment and submitted samples", () => {
    const targets = currentEditionsReviewTargets({
      commitmentHash: "0xcommitment",
      frozenSnapshot: { samples: [{ sha256: "0xsample-1" }, { sha256: "0xsample-2" }] },
    });

    expect([...targets]).toEqual(["0xcommitment", "0xsample-1", "0xsample-2"]);
    expect(currentEditionsReviewTargets({ commitmentHash: null, frozenSnapshot: null })).toEqual(new Set());
  });

  it("adds only current canonical evidence and challenge hashes after approval", () => {
    const productionHash = `0x${"2".repeat(64)}`;
    const challengeHash = `0x${"3".repeat(64)}`;
    const targets = currentEditionsFeedbackTargets({
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
    expect(currentEditionsFeedbackTargets({
      commitmentHash: "0xcommitment",
      frozenSnapshot: { samples: [] },
      chain: { snapshot: chainSnapshot(1, { productionHash: zeroHash, releaseEvidenceHash: zeroHash }), challenges: [] },
      zeroHash,
    })).toEqual(new Set(["0xcommitment"]));
  });

  it("allows production evidence only while production is pending", () => {
    expect(canUploadEditionsEvidence(chainSnapshot(1, { productionHash: zeroHash, productionApproved: false }), "PRODUCTION_EVIDENCE", zeroHash)).toBe(true);
    expect(canUploadEditionsEvidence(chainSnapshot(1, { productionHash: releaseEvidenceHash, productionApproved: false }), "PRODUCTION_EVIDENCE", zeroHash)).toBe(false);
    expect(canUploadEditionsEvidence(chainSnapshot(1, { productionHash: zeroHash, productionApproved: true }), "PRODUCTION_EVIDENCE", zeroHash)).toBe(false);
  });

  it("allows a final PDF only after production approval", () => {
    expect(canUploadEditionsEvidence(chainSnapshot(1, { productionApproved: false }), "FINAL_PDF", zeroHash)).toBe(false);
    expect(canUploadEditionsEvidence(chainSnapshot(1, { productionApproved: true }), "FINAL_PDF", zeroHash)).toBe(true);
    expect(canUploadEditionsEvidence(chainSnapshot(0, { productionApproved: true }), "FINAL_PDF", zeroHash)).toBe(false);
  });

  it("derives access from canonical entitlement and chain state", () => {
    const confirmedAt = new Date("2026-10-15T00:00:00.000Z");
    const base = {
      canonical: true,
      refunded: false,
      streamId: "editions:current",
      currentStreamId: "editions:current",
      confirmedEvidenceHash: releaseEvidenceHash,
      confirmedAt,
      releaseAvailable: true,
    };

    expect(deriveEditionsEntitlementAccess({ ...base, refunded: true, binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "REFUNDED", confirmedAt: null });
    expect(deriveEditionsEntitlementAccess({ ...base, streamId: "editions:old", binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "ORPHANED", confirmedAt: null });
    expect(deriveEditionsEntitlementAccess({ ...base, binding: { snapshot: chainSnapshot(4) } })).toMatchObject({ access: "REFUND_ELIGIBLE", confirmedAt: null });
    expect(deriveEditionsEntitlementAccess({ ...base, binding: { snapshot: chainSnapshot(1) } })).toMatchObject({ access: "PENDING_RELEASE", confirmedAt: null });
    expect(deriveEditionsEntitlementAccess({ ...base, binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "DOWNLOAD_ELIGIBLE", confirmedAt });
    expect(deriveEditionsEntitlementAccess({ ...base, releaseAvailable: false, binding: { snapshot: chainSnapshot(3) } })).toMatchObject({ access: "DELIVERY_UNAVAILABLE", confirmedAt: null });
  });
});
