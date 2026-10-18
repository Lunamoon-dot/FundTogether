const CAMPAIGNS_POST_FUNDING_STATES = new Set([1, 2, 3, 5]);

export const MAX_REVIEW_MESSAGES_PER_THREAD = 200;
export const REVIEW_MESSAGES_PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewMessagesCursor = {
  createdAt: string;
  id: string;
};

export type ReviewThreadWriteState = "ACTIVE" | "REFUNDED" | "ORPHANED";

export type ReviewPublicationStatus =
  | "ON_CHAIN_CONFIRMED"
  | "NOT_PUBLISHED"
  | "ORPHANED";

export type ReviewConversationGateInput = {
  userId: string;
  creatorUserId: string;
  publicationStatus: ReviewPublicationStatus;
  chainState: number | null;
  entitlement: {
    backerUserId: string | null;
    canonical: boolean;
    refunded: boolean;
  } | null;
};

export function isPostFundingState(state: number | null): boolean {
  return state !== null && CAMPAIGNS_POST_FUNDING_STATES.has(state);
}

export function canAppendReviewMessage(messageCount: number): boolean {
  return Number.isInteger(messageCount) && messageCount >= 0 && messageCount < MAX_REVIEW_MESSAGES_PER_THREAD;
}

export function encodeReviewMessagesCursor(cursor: ReviewMessagesCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeReviewMessagesCursor(value: string): ReviewMessagesCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ReviewMessagesCursor>;
    if (
      typeof parsed.createdAt === "string" &&
      !Number.isNaN(Date.parse(parsed.createdAt)) &&
      typeof parsed.id === "string" &&
      UUID_PATTERN.test(parsed.id)
    ) return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {}
  throw new Error("Invalid review message cursor");
}

export function canOpenReviewThread(
  input: ReviewConversationGateInput,
): boolean {
  if (input.userId === input.creatorUserId) return false;
  if (input.publicationStatus !== "ON_CHAIN_CONFIRMED") return false;
  if (!isPostFundingState(input.chainState)) return false;

  const entitlement = input.entitlement;
  return Boolean(
    entitlement &&
      entitlement.backerUserId === input.userId &&
      entitlement.canonical &&
      !entitlement.refunded,
  );
}

export function deriveReviewThreadWriteState(input: {
  canonical: boolean;
  refunded: boolean;
  entitlementStreamId: string;
  currentStreamId: string;
}): ReviewThreadWriteState {
  if (input.refunded) return "REFUNDED";
  if (!input.canonical || input.entitlementStreamId !== input.currentStreamId) return "ORPHANED";
  return "ACTIVE";
}
