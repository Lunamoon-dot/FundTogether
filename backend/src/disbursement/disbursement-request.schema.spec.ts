import { submitDisbursementRequestSchema } from "./disbursement-request.schema";

describe("HED request schema", () => {
  const valid = {
    campaignMetadataId: "c4fbb20c-6c6e-42a2-b0eb-a9d70e5b2c66",
    requestHash: `0x${"a".repeat(64)}`,
    vendorWallet: "0x1111111111111111111111111111111111111111",
    amount: "1000000",
    deposit: "200000",
  };

  it("accepts integer token units and rejects floats, zero hashes and deposits above the request", () => {
    expect(submitDisbursementRequestSchema.safeParse(valid).success).toBe(true);
    for (const value of [
      { ...valid, amount: "1.5" },
      { ...valid, amount: "0" },
      { ...valid, requestHash: `0x${"0".repeat(64)}` },
      { ...valid, deposit: "1000001" },
    ]) expect(submitDisbursementRequestSchema.safeParse(value).success).toBe(false);
  });
});
