import {
  MAX_REVIEW_MESSAGES_PER_THREAD,
  REVIEW_MESSAGES_PAGE_SIZE,
  canAppendReviewMessage,
  canOpenReviewThread,
  decodeReviewMessagesCursor,
  deriveReviewThreadWriteState,
  encodeReviewMessagesCursor,
  isPostFundingState,
} from "../policies/review-conversation.policy";

describe("Campaign review conversation policies", () => {
  it("recognizes only post-funding chain states as review states", () => {
    expect(isPostFundingState(0)).toBe(false);
    expect(isPostFundingState(1)).toBe(true);
    expect(isPostFundingState(2)).toBe(true);
    expect(isPostFundingState(3)).toBe(true);
    expect(isPostFundingState(4)).toBe(false);
    expect(isPostFundingState(5)).toBe(true);
    expect(isPostFundingState(null)).toBe(false);
  });

  it("requires a confirmed, current, non-refunded entitlement for the backer", () => {
    const valid = {
      userId: "backer-1",
      creatorUserId: "creator-1",
      publicationStatus: "ON_CHAIN_CONFIRMED" as const,
      chainState: 1,
      entitlement: {
        backerUserId: "backer-1",
        canonical: true,
        refunded: false,
      },
    };

    expect(canOpenReviewThread(valid)).toBe(true);
    expect(canOpenReviewThread({ ...valid, chainState: 0 })).toBe(false);
    expect(canOpenReviewThread({ ...valid, publicationStatus: "NOT_PUBLISHED" })).toBe(false);
    expect(canOpenReviewThread({ ...valid, entitlement: null })).toBe(false);
    expect(canOpenReviewThread({
      ...valid,
      entitlement: { ...valid.entitlement, canonical: false },
    })).toBe(false);
    expect(canOpenReviewThread({
      ...valid,
      entitlement: { ...valid.entitlement, refunded: true },
    })).toBe(false);
    expect(canOpenReviewThread({
      ...valid,
      entitlement: { ...valid.entitlement, backerUserId: "other-backer" },
    })).toBe(false);
    expect(canOpenReviewThread({ ...valid, userId: "creator-1" })).toBe(false);
  });

  it("classifies existing thread write access from current entitlement state", () => {
    const active = { canonical: true, refunded: false, entitlementStreamId: "campaigns:current", currentStreamId: "campaigns:current" };

    expect(deriveReviewThreadWriteState(active)).toBe("ACTIVE");
    expect(deriveReviewThreadWriteState({ ...active, refunded: true })).toBe("REFUNDED");
    expect(deriveReviewThreadWriteState({ ...active, canonical: false })).toBe("ORPHANED");
    expect(deriveReviewThreadWriteState({ ...active, entitlementStreamId: "campaigns:old" })).toBe("ORPHANED");
    expect(deriveReviewThreadWriteState({ ...active, refunded: true, entitlementStreamId: "campaigns:old" })).toBe("REFUNDED");
  });

  it("bounds review-thread messages and page reads", () => {
    expect(MAX_REVIEW_MESSAGES_PER_THREAD).toBe(200);
    expect(REVIEW_MESSAGES_PAGE_SIZE).toBe(50);
    expect(canAppendReviewMessage(0)).toBe(true);
    expect(canAppendReviewMessage(199)).toBe(true);
    expect(canAppendReviewMessage(200)).toBe(false);
    expect(canAppendReviewMessage(201)).toBe(false);
    expect(canAppendReviewMessage(Number.NaN)).toBe(false);
  });

  it("round-trips an opaque cursor and rejects malformed cursors", () => {
    const cursor = { createdAt: "2026-10-18T10:00:00.000Z", id: "00000000-0000-0000-0000-000000000001" };
    expect(decodeReviewMessagesCursor(encodeReviewMessagesCursor(cursor))).toEqual(cursor);
    expect(() => decodeReviewMessagesCursor("not-a-cursor")).toThrow("Invalid review message cursor");
  });
});
