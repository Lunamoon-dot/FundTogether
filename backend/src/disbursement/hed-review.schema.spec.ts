import { hedReviewSchema } from "./hed-review.schema";

const source = "11111111-1111-4111-8111-111111111111";
const review = { evidenceVersion: 1, criterionId: "NEED-01", outcome: "MET", reasonCode: "SCOPE_MATCH",
  reason: "Nhu cầu, scope và activity đã được đối chiếu bởi người xét.", manifestHash: `0x${"1".repeat(64)}`,
  publicHash: `0x${"2".repeat(64)}`, sourceReferences: [source] };

describe("hedReviewSchema", () => {
  it("requires a human reason, immutable manifest and public bundle before MET", () => {
    expect(hedReviewSchema.parse(review).criterionId).toBe("NEED-01");
    expect(hedReviewSchema.safeParse({ ...review, publicHash: undefined }).success).toBe(false);
    expect(hedReviewSchema.safeParse({ ...review, sourceReferences: [] }).success).toBe(false);
    expect(hedReviewSchema.safeParse({ ...review, criterionId: "DEL-99" }).success).toBe(false);
  });
});
