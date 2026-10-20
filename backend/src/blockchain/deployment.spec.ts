import { campaignAbiHash, campaignPolicyHash, parseDeploymentManifest, verifyDeploymentManifest } from "./deployment";
import { keccak256 } from "viem";

const hash = `0x${"1".repeat(64)}`;
const judges = [`0x${"5".repeat(40)}`, `0x${"6".repeat(40)}`, `0x${"7".repeat(40)}`, `0x${"8".repeat(40)}`];
const manifest = () => ({ protocolKind: "CAMPAIGNS", chainId: 31339, rpcUrl: "http://127.0.0.1:9548", abiVersion: "campaigns-local-judge-v1", abiHash: campaignAbiHash, policyHash: campaignPolicyHash,
  tokenDecimals: 6, confirmations: 1, contractAddress: `0x${"1".repeat(40)}`, tokenAddress: `0x${"2".repeat(40)}`, resolver: `0x${"3".repeat(40)}`, backupResolver: `0x${"4".repeat(40)}`, judges,
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, deploymentBlockNumber: "1", deploymentBlockHash: hash });

describe("Campaign deployment boundary", () => {
  it("accepts only the exact versioned local policy and ABI", () => { expect(parseDeploymentManifest(manifest()).protocolKind).toBe("CAMPAIGNS"); });
  it.each([{ chainId: 1 }, { protocolKind: "INVALID" }, { abiVersion: "1" }, { abiHash: hash }, { policyHash: hash },
    { rpcUrl: "https://mainnet.example" }, { rpcUrl: "http://user:pass@127.0.0.1:9548" }, { rpcUrl: "http://127.0.0.1:9548/?redirect=x" },
    { contractAddress: `0x${"0".repeat(40)}` }, { confirmations: 0 }, { deploymentBlockNumber: "0" }, { backupResolver: `0x${"3".repeat(40)}` },
    { judges: judges.slice(0, 2) }, { judges: [judges[0], judges[0], judges[2], judges[3]] },
  ])("fails closed on %j", patch => { expect(() => parseDeploymentManifest({ ...manifest(), ...patch })).toThrow(); });
  it("does not trust a syntactically valid manifest without bytecode/chain identity", async () => {
    const client = { getChainId: async () => 31339, getBlock: async () => ({ hash }), getCode: async () => "0x" };
    await expect(verifyDeploymentManifest(client as any, parseDeploymentManifest(manifest()))).rejects.toThrow("identity mismatch");
  });
  it("fails closed when the chain Judge pool differs from the manifest", async () => {
    const current = parseDeploymentManifest(manifest());
    const client = {
      getChainId: async () => 31339,
      getBlock: async () => ({ hash }),
      getCode: async ({ address }: { address: string }) => address === current.contractAddress ? "0x6000" : "0x6001",
      readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
        if (functionName === "supportedToken") return current.tokenAddress;
        if (functionName === "resolver") return current.resolver;
        if (functionName === "backupResolver") return current.backupResolver;
        if (functionName === "policyHash") return current.policyHash;
        if (functionName === "judgePoolLength") return 4n;
        if (functionName === "judgePoolAt") return args?.[0] === 0n ? current.judges[0] : `0x${"9".repeat(40)}`;
        if (functionName === "decimals") return 6;
        throw new Error(`unexpected read ${functionName}`);
      },
    };
    (client.getBlock as any) = async ({ blockNumber }: { blockNumber: bigint }) => ({ hash: blockNumber === 0n ? current.genesisHash : current.deploymentBlockHash });
    (client.getCode as any) = async ({ address }: { address: string }) => address === current.contractAddress ? "0x6000" : "0x6001";
    const withHashes = { ...current, contractCodeHash: keccak256("0x6000"), tokenCodeHash: keccak256("0x6001") };
    await expect(verifyDeploymentManifest(client as any, withHashes)).rejects.toThrow("Judge pool mismatch");
  });
});
