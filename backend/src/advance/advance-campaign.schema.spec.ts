import { giftDraftSchema, giftUpdateSchema, goalUnits } from "./advance-campaign.schema";

export const gift = (count = 1) => ({ activityType: "GIFT_DISTRIBUTION", channel: count === 1 ? "INSTITUTION" : "DIRECT",
  checklistVersion: "gift.v1", title: "Synthetic gifts", description: "Buy and deliver controlled test gifts",
  recipientScope: "Controlled school or individual cohort", eligibilityBasis: "Synthetic authority registry",
  fundingDuration: "604800", stages: Array.from({ length: count }, (_, index) => ({
    title: `Stage${index + 1}`, description: "Purchase, inventory, transport, handover",
    budgetUnits: count === 1 ? "2200000000" : "1100000000", targetPackages: count === 1 ? 100 : 50,
    goods: "2kg rice,1L oil,5 noodles per package", tasks: [
      { taskId: "purchase", description: "Buy gifts", criterionIds: ["C1"] },
      { taskId: "handover", description: "Deliver gifts", criterionIds: ["C2"] }],
    acceptanceCriteria: [
      { criterionId: "C1", description: "Quantity and composition match", requiredDocuments: ["INVOICE", "PAYMENT_PROOF"] },
      { criterionId: "C2", description: "Correct recipient and authorized handover", requiredDocuments: ["DELIVERY_RECORD", "PHOTO"] }],
  })) });

describe("gift plan schema", () => {
  it("accepts G1/G2 with separate tasks and stages and derives exact goal", () => {
    expect(goalUnits(giftDraftSchema.parse(gift()))).toBe("2200000000");
    expect(goalUnits(giftDraftSchema.parse(gift(3)))).toBe("3300000000");
    expect(giftDraftSchema.parse(gift()).stages).toHaveLength(1);
  });
  it.each(["0", "-1", "1.2", "01", "1e6", ((1n << 256n)).toString()])("rejects non uint256 budget %s", budgetUnits => {
    const input = gift(); input.stages[0].budgetUnits = budgetUnits;
    expect(giftDraftSchema.safeParse(input).success).toBe(false);
  });
  it("rejects summed overflow, wrong activity/channel/checklist and client-supplied financial fields", () => {
    const overflow = gift(3); overflow.stages.forEach(s => { s.budgetUnits = ((1n << 256n) - 1n).toString(); });
    for (const input of [overflow, { ...gift(), channel: "OTHER" }, { ...gift(), activityType: "OTHER" },
      { ...gift(), checklistVersion: "unknown" }, { ...gift(), goal: "1" }, { ...gift(), bond: "0" }]) {
      expect(giftDraftSchema.safeParse(input).success).toBe(false);
    }
  });
  it("rejects duplicate task/criterion IDs and task references to missing criteria", () => {
    for (const kind of ["task", "criterion", "unknown"]) {
      const input = gift();
      if (kind === "task") input.stages[0].tasks.push(input.stages[0].tasks[0]);
      if (kind === "criterion") input.stages[0].acceptanceCriteria.push(input.stages[0].acceptanceCriteria[0]);
      if (kind === "unknown") input.stages[0].tasks[0].criterionIds = ["missing"];
      expect(giftDraftSchema.safeParse(input).success).toBe(false);
    }
  });
  it("requires revision only for update and unique persistent milestone IDs", () => {
    expect(giftUpdateSchema.safeParse(gift()).success).toBe(false);
    expect(giftUpdateSchema.safeParse({ ...gift(), expectedRevision: 1 }).success).toBe(true);
    const input = { ...gift(3), expectedRevision: 1, stages: gift(3).stages.map(s => ({ ...s, id: "11111111-1111-4111-8111-111111111111" })) };
    expect(giftUpdateSchema.safeParse(input).success).toBe(false);
  });
  it.each(["86399", "2592001", "3.5", "0"])("rejects funding duration %s", fundingDuration => {
    expect(giftDraftSchema.safeParse({ ...gift(), fundingDuration }).success).toBe(false);
  });
});
