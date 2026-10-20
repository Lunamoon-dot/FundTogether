type LatestBlockClient = {
  getBlock: (args: { blockTag: "latest" }) => Promise<{ timestamp: bigint }>;
};

export async function readVNextLatestChainTimestamp(client: LatestBlockClient): Promise<bigint> {
  return (await client.getBlock({ blockTag: "latest" })).timestamp;
}
