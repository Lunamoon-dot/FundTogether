import { editionsAbiHash, editionsPolicyHash, parseEditionsDeployment, verifyEditionsDeployment } from "./editions-deployment";

const hash = `0x${"1".repeat(64)}`;
const manifest = () => ({ protocolKind: "EDITIONS", chainId: 31339, rpcUrl: "http://127.0.0.1:9548", abiVersion: "editions-local-v1", abiHash: editionsAbiHash, policyHash: editionsPolicyHash,
  tokenDecimals: 6, confirmations: 1, contractAddress: `0x${"1".repeat(40)}`, tokenAddress: `0x${"2".repeat(40)}`, resolver: `0x${"3".repeat(40)}`, backupResolver: `0x${"4".repeat(40)}`,
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, deploymentBlockNumber: "1", deploymentBlockHash: hash });

describe("Editions deployment boundary", () => {
  it("accepts only the exact versioned local policy and ABI", () => { expect(parseEditionsDeployment(manifest()).protocolKind).toBe("EDITIONS"); });
  it.each([{ chainId: 1 }, { protocolKind: "REWARD" }, { abiVersion: "1" }, { abiHash: hash }, { policyHash: hash },
    { rpcUrl: "https://mainnet.example" }, { rpcUrl: "http://user:pass@127.0.0.1:9548" }, { rpcUrl: "http://127.0.0.1:9548/?redirect=x" },
    { contractAddress: `0x${"0".repeat(40)}` }, { confirmations: 0 }, { deploymentBlockNumber: "0" }, { backupResolver: `0x${"3".repeat(40)}` },
  ])("fails closed on %j", patch => { expect(() => parseEditionsDeployment({ ...manifest(), ...patch })).toThrow(); });
  it("does not trust a syntactically valid manifest without bytecode/chain identity", async () => {
    const client = { getChainId: async () => 31339, getBlock: async () => ({ hash }), getCode: async () => "0x" };
    await expect(verifyEditionsDeployment(client as any, parseEditionsDeployment(manifest()))).rejects.toThrow("identity mismatch");
  });
});
