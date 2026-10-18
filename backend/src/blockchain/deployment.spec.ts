import { campaignAbiHash, campaignPolicyHash, parseDeploymentManifest, verifyDeploymentManifest } from "./deployment";

const hash = `0x${"1".repeat(64)}`;
const manifest = () => ({ protocolKind: "CAMPAIGNS", chainId: 31339, rpcUrl: "http://127.0.0.1:9548", abiVersion: "campaigns-local-v6", abiHash: campaignAbiHash, policyHash: campaignPolicyHash,
  tokenDecimals: 6, confirmations: 1, contractAddress: `0x${"1".repeat(40)}`, tokenAddress: `0x${"2".repeat(40)}`, resolver: `0x${"3".repeat(40)}`, backupResolver: `0x${"4".repeat(40)}`,
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, deploymentBlockNumber: "1", deploymentBlockHash: hash });

describe("Campaign deployment boundary", () => {
  it("accepts only the exact versioned local policy and ABI", () => { expect(parseDeploymentManifest(manifest()).protocolKind).toBe("CAMPAIGNS"); });
  it.each([{ chainId: 1 }, { protocolKind: "INVALID" }, { abiVersion: "1" }, { abiHash: hash }, { policyHash: hash },
    { rpcUrl: "https://mainnet.example" }, { rpcUrl: "http://user:pass@127.0.0.1:9548" }, { rpcUrl: "http://127.0.0.1:9548/?redirect=x" },
    { contractAddress: `0x${"0".repeat(40)}` }, { confirmations: 0 }, { deploymentBlockNumber: "0" }, { backupResolver: `0x${"3".repeat(40)}` },
  ])("fails closed on %j", patch => { expect(() => parseDeploymentManifest({ ...manifest(), ...patch })).toThrow(); });
  it("does not trust a syntactically valid manifest without bytecode/chain identity", async () => {
    const client = { getChainId: async () => 31339, getBlock: async () => ({ hash }), getCode: async () => "0x" };
    await expect(verifyDeploymentManifest(client as any, parseDeploymentManifest(manifest()))).rejects.toThrow("identity mismatch");
  });
});
