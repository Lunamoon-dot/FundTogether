const EDITIONS_POST_FUNDING_STATES = new Set([1, 2, 3, 5]);

export type EditionsReviewThreadWriteState = "ACTIVE" | "REFUNDED" | "ORPHANED";

export type EditionsReviewPublicationStatus =
  | "ON_CHAIN_CONFIRMED"
  | "NOT_PUBLISHED"
  | "ORPHANED";

export type EditionsReviewConversationGateInput = {
  userId: string;
  creatorUserId: string;
  publicationStatus: EditionsReviewPublicationStatus;
  chainState: number | null;
  entitlement: {
    backerUserId: string | null;
    canonical: boolean;
    refunded: boolean;
  } | null;
};

export function isEditionsPostFundingState(state: number | null): boolean {
  return state !== null && EDITIONS_POST_FUNDING_STATES.has(state);
}

export function canOpenEditionsReviewThread(
  input: EditionsReviewConversationGateInput,
): boolean {
  if (input.userId === input.creatorUserId) return false;
  if (input.publicationStatus !== "ON_CHAIN_CONFIRMED") return false;
  if (!isEditionsPostFundingState(input.chainState)) return false;

  const entitlement = input.entitlement;
  return Boolean(
    entitlement &&
      entitlement.backerUserId === input.userId &&
      entitlement.canonical &&
      !entitlement.refunded,
  );
}

export function deriveEditionsReviewThreadWriteState(input: {
  canonical: boolean;
  refunded: boolean;
  entitlementStreamId: string;
  currentStreamId: string;
}): EditionsReviewThreadWriteState {
  if (input.refunded) return "REFUNDED";
  if (!input.canonical || input.entitlementStreamId !== input.currentStreamId) return "ORPHANED";
  return "ACTIVE";
}
