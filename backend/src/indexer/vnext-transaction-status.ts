export type VNextTransactionState = "INDEXING" | "ON_CHAIN_CONFIRMED";

export type VNextTransactionEvent = {
  eventName: string;
  args: Record<string, unknown>;
};

export function normalizeVNextTransactionHash(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Invalid VNext transaction hash");
  }
  return value.toLowerCase() as `0x${string}`;
}

export function buildVNextTransactionStatus(
  txHash: string,
  events: VNextTransactionEvent[],
) {
  const normalizedHash = normalizeVNextTransactionHash(txHash);
  return {
    txHash: normalizedHash,
    state: (events.length > 0 ? "ON_CHAIN_CONFIRMED" : "INDEXING") as VNextTransactionState,
    eventCount: events.length,
    events,
  };
}
