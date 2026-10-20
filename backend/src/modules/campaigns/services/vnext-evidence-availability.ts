export type VNextEvidenceObjectState = "AVAILABLE" | "MISSING" | "UNAVAILABLE" | "NOT_INDEXED";
export type VNextEvidenceReviewPhase = "ENROLLMENT" | "VOTING" | "FINALIZED";
export type VNextEvidenceAvailabilityStatus =
  | "READY"
  | "WAITING_FOR_EVIDENCE"
  | "TIMEOUT_RETRY_ELIGIBLE"
  | "WAITING_FOR_INDEXER"
  | "REVIEW_CLOSED";

export type VNextEvidenceAvailabilityInput = {
  objectState: VNextEvidenceObjectState;
  reviewPhase: VNextEvidenceReviewPhase;
  nowSeconds: bigint;
  timeoutAtSeconds: bigint | null;
};

export type VNextEvidenceAvailability = {
  status: VNextEvidenceAvailabilityStatus;
  timeoutAtSeconds: bigint | null;
};

export function resolveVNextEvidenceAvailability(
  input: VNextEvidenceAvailabilityInput,
): VNextEvidenceAvailability {
  if (input.reviewPhase === "FINALIZED") {
    return { status: "REVIEW_CLOSED", timeoutAtSeconds: null };
  }
  if (input.objectState === "NOT_INDEXED") {
    return { status: "WAITING_FOR_INDEXER", timeoutAtSeconds: null };
  }
  if (input.objectState === "AVAILABLE") {
    return { status: "READY", timeoutAtSeconds: input.timeoutAtSeconds };
  }
  if (input.timeoutAtSeconds !== null && input.nowSeconds >= input.timeoutAtSeconds) {
    return { status: "TIMEOUT_RETRY_ELIGIBLE", timeoutAtSeconds: input.timeoutAtSeconds };
  }
  return { status: "WAITING_FOR_EVIDENCE", timeoutAtSeconds: input.timeoutAtSeconds };
}
