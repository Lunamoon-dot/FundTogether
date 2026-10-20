import { describe, expect, it, jest } from "@jest/globals";
import { readVNextLatestChainTimestamp } from "./vnext-chain-clock";

describe("VNext chain clock", () => {
  it("reads the latest canonical block timestamp", async () => {
    const getBlock = jest.fn(async (_args: { blockTag: "latest" }) => ({ timestamp: 1234n }));

    await expect(readVNextLatestChainTimestamp({ getBlock } as any)).resolves.toBe(1234n);
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
  });
});
