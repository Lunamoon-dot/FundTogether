import type { EditionsChainSnapshot } from "../database/schema";

export type EditionsEvidencePurpose = "PRODUCTION_EVIDENCE" | "FINAL_PDF";
export type EditionsEntitlementAccess = "DOWNLOAD_ELIGIBLE" | "DELIVERY_UNAVAILABLE" | "PENDING_RELEASE" | "REFUND_ELIGIBLE" | "REFUNDED" | "ORPHANED";

type ReviewSnapshot = { samples: ReadonlyArray<{ sha256: string }> } | null;

export function currentEditionsReviewTargets(input: { commitmentHash: string | null; frozenSnapshot: ReviewSnapshot }): ReadonlySet<string> {
  if (!input.frozenSnapshot || !input.commitmentHash) return new Set<string>();
  return new Set([input.commitmentHash, ...input.frozenSnapshot.samples.map(sample => sample.sha256)]);
}

export function currentEditionsFeedbackTargets(input: {
  commitmentHash: string | null;
  frozenSnapshot: ReviewSnapshot;
  chain?: {
    snapshot: Pick<EditionsChainSnapshot, "productionHash" | "releaseEvidenceHash"> | null;
    challenges: ReadonlyArray<{ evidenceHash: string }>;
  };
  zeroHash: string;
}): ReadonlySet<string> {
  const targets = new Set(currentEditionsReviewTargets(input));
  const snapshot = input.chain?.snapshot;
  for (const target of [snapshot?.productionHash, snapshot?.releaseEvidenceHash, ...(input.chain?.challenges.map(item => item.evidenceHash) ?? [])]) {
    if (target && target !== input.zeroHash) targets.add(target);
  }
  return targets;
}

export function canUploadEditionsEvidence(
  state: Pick<EditionsChainSnapshot, "state" | "productionApproved" | "productionHash">,
  purpose: EditionsEvidencePurpose,
  zeroHash: string,
): boolean {
  if (state.state !== 1) return false;
  if (purpose === "PRODUCTION_EVIDENCE") return !state.productionApproved && state.productionHash === zeroHash;
  return state.productionApproved;
}

export function deriveEditionsEntitlementAccess(input: {
  canonical: boolean;
  refunded: boolean;
  streamId: string;
  currentStreamId: string;
  binding?: { snapshot: Pick<EditionsChainSnapshot, "state" | "releaseEvidenceHash"> };
  confirmedEvidenceHash: string | null;
  confirmedAt: Date | null;
  releaseAvailable: boolean;
}): { access: EditionsEntitlementAccess; confirmedAt: Date | null } {
  let confirmedAt: Date | null = null;
  let access: EditionsEntitlementAccess = input.refunded
    ? "REFUNDED"
    : !input.canonical || input.streamId !== input.currentStreamId
      ? "ORPHANED"
      : "PENDING_RELEASE";

  if (input.canonical && !input.refunded && input.streamId === input.currentStreamId) {
    if (input.binding?.snapshot.state === 4) access = "REFUND_ELIGIBLE";
    else if ([3, 5].includes(input.binding?.snapshot.state ?? -1)) access = input.releaseAvailable ? "DOWNLOAD_ELIGIBLE" : "DELIVERY_UNAVAILABLE";
    if (access === "DOWNLOAD_ELIGIBLE" && input.binding?.snapshot.releaseEvidenceHash === input.confirmedEvidenceHash)
      confirmedAt = input.confirmedAt;
  }

  return { access, confirmedAt };
}
