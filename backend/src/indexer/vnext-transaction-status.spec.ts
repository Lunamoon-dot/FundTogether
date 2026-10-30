import { describe, expect, it } from "@jest/globals";
import {
  buildVNextTransactionStatus,
  normalizeVNextTransactionHash,
} from "./vnext-transaction-status";

describe("VNext transaction status", () => {
  it("accepts a canonical hash and reports indexed events", () => {
    const hash = `0x${"a".repeat(64)}`;
    expect(normalizeVNextTransactionHash(hash)).toBe(hash);
    const event = {
      eventName: "ContributionReceived",
      args: { campaignId: "7", backer: "0x00000000000000000000000000000000000000a1", amount: "25500000" },
    };
    expect(buildVNextTransactionStatus(hash, [event])).toEqual({
      txHash: hash,
      state: "ON_CHAIN_CONFIRMED",
      eventCount: 1,
      events: [event],
    });
  });

  it("keeps a valid receipt in indexing while no canonical event exists", () => {
    const hash = `0x${"b".repeat(64)}`;
    expect(buildVNextTransactionStatus(hash, [])).toEqual({
      txHash: hash,
      state: "INDEXING",
      eventCount: 0,
      events: [],
    });
  });

  it("rejects malformed transaction hashes", () => {
    expect(() => normalizeVNextTransactionHash("not-a-hash")).toThrow("Invalid VNext transaction hash");
  });
});
