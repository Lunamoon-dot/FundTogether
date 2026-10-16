import {
  canOpenEditionsReviewThread,
  isEditionsPostFundingState,
} from "./reward-editions-review-conversation.policy";

describe("Editions review conversation policies", () => {
  it("recognizes only post-funding chain states as review states", () => {
    expect(isEditionsPostFundingState(0)).toBe(false);
    expect(isEditionsPostFundingState(1)).toBe(true);
    expect(isEditionsPostFundingState(2)).toBe(true);
    expect(isEditionsPostFundingState(3)).toBe(true);
    expect(isEditionsPostFundingState(4)).toBe(false);
    expect(isEditionsPostFundingState(5)).toBe(true);
    expect(isEditionsPostFundingState(null)).toBe(false);
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

    expect(canOpenEditionsReviewThread(valid)).toBe(true);
    expect(canOpenEditionsReviewThread({ ...valid, chainState: 0 })).toBe(false);
    expect(canOpenEditionsReviewThread({ ...valid, publicationStatus: "NOT_PUBLISHED" })).toBe(false);
    expect(canOpenEditionsReviewThread({ ...valid, entitlement: null })).toBe(false);
    expect(canOpenEditionsReviewThread({
      ...valid,
      entitlement: { ...valid.entitlement, canonical: false },
    })).toBe(false);
    expect(canOpenEditionsReviewThread({
      ...valid,
      entitlement: { ...valid.entitlement, refunded: true },
    })).toBe(false);
    expect(canOpenEditionsReviewThread({
      ...valid,
      entitlement: { ...valid.entitlement, backerUserId: "other-backer" },
    })).toBe(false);
    expect(canOpenEditionsReviewThread({ ...valid, userId: "creator-1" })).toBe(false);
  });
});
