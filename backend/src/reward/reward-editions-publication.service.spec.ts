import { deriveEditionsPublication } from "./reward-editions-publication.service";

describe("deriveEditionsPublication", () => {
  const event = (campaignId: string, canonical: boolean, transactionHash: string) => ({
    transactionHash,
    args: { campaignId },
    canonical,
  });
  const binding = (onchainCampaignId: string, canonical: boolean, state: number) => ({
    onchainCampaignId,
    canonical,
    snapshot: { state },
  });

  it("distinguishes missing, orphaned and canonical bindings without a legacy campaign id", () => {
    expect(deriveEditionsPublication([], [])).toEqual({
      binding: undefined,
      publicationStatus: "NOT_PUBLISHED",
      bindingTransactionHash: null,
    });

    const orphaned = deriveEditionsPublication(
      [binding("7", false, 0)],
      [event("7", false, `0x${"1".repeat(64)}`)],
    );
    expect(orphaned).toMatchObject({
      binding: undefined,
      publicationStatus: "ORPHANED",
      bindingTransactionHash: `0x${"1".repeat(64)}`,
    });

    for (const state of [0, 1, 2, 3, 4, 5]) {
      const canonical = deriveEditionsPublication(
        [binding("8", true, state)],
        [event("8", true, `0x${"2".repeat(64)}`)],
      );
      expect(canonical.publicationStatus).toBe("ON_CHAIN_CONFIRMED");
      expect(canonical.binding?.snapshot.state).toBe(state);
      expect(canonical.bindingTransactionHash).toBe(`0x${"2".repeat(64)}`);
    }
  });

  it("fails closed when more than one canonical binding exists", () => {
    const result = deriveEditionsPublication(
      [binding("1", true, 0), binding("2", true, 0)],
      [event("1", true, `0x${"3".repeat(64)}`)],
    );
    expect(result.publicationStatus).toBe("ORPHANED");
    expect(result.binding).toBeUndefined();
  });
});
