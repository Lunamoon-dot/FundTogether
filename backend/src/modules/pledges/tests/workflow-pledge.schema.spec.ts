import { createPledgeSchema } from "../schemas/pledge.schema";

describe("CampaignPledgeSchema", () => {
  it("validates valid pledge input", () => {
    const validPledge = {
      tierId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      quantity: 2,
      txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      backerWallet: "0x1111111111111111111111111111111111111111",
    };
    const parsed = createPledgeSchema.safeParse(validPledge);
    expect(parsed.success).toBe(true);
  });

});
