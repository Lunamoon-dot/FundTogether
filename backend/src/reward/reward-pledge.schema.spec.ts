import { createRewardPledgeSchema, updateShippingAddressSchema, createFulfillmentBatchSchema } from "./reward-pledge.schema";

describe("RewardPledgeSchema", () => {
  it("validates valid pledge input", () => {
    const validPledge = {
      tierId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      quantity: 2,
      txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      backerWallet: "0x1111111111111111111111111111111111111111",
    };
    const parsed = createRewardPledgeSchema.safeParse(validPledge);
    expect(parsed.success).toBe(true);
  });

  it("validates shipping address update", () => {
    const validShipping = {
      fullName: "Nguyen Van A",
      address: "123 Le Loi, Quan 1, TP. Ho Chi Minh",
      phone: "+84901234567",
    };
    const parsed = updateShippingAddressSchema.safeParse(validShipping);
    expect(parsed.success).toBe(true);
  });

  it("validates fulfillment batch creation with tracking codes", () => {
    const validBatch = {
      batchNumber: 1,
      title: "Batch 1 - Ho Chi Minh City Backers",
      carrier: "Vietnam Post",
      manifestHash: "0x" + "a".repeat(64),
      shippedItemCount: 15,
      trackingCodes: {
        "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d": "VNPOST-123456789",
      },
    };
    const parsed = createFulfillmentBatchSchema.safeParse(validBatch);
    expect(parsed.success).toBe(true);
  });
});
