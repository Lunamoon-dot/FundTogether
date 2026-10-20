import { describe, expect, it } from "@jest/globals";
import {
  buildVNextTransactionStatus,
  normalizeVNextTransactionHash,
} from "./vnext-transaction-status";

describe("VNext transaction status", () => {
  it("accepts a canonical hash and reports indexed events", () => {
    const hash = `0x${"a".repeat(64)}`;
    expect(normalizeVNextTransactionHash(hash)).toBe(hash);
    expect(buildVNextTransactionStatus(hash, [{ eventName: "ContributionReceived" }])).toEqual({
      txHash: hash,
      state: "ON_CHAIN_CONFIRMED",
      eventCount: 1,
    });
  });

  it("keeps a valid receipt in indexing while no canonical event exists", () => {
    const hash = `0x${"b".repeat(64)}`;
    expect(buildVNextTransactionStatus(hash, [])).toEqual({
      txHash: hash,
      state: "INDEXING",
      eventCount: 0,
    });
  });

  it("rejects malformed transaction hashes", () => {
    expect(() => normalizeVNextTransactionHash("not-a-hash")).toThrow("Invalid VNext transaction hash");
  });
});
