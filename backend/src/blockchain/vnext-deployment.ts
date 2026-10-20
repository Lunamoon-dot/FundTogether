import { z } from "zod";
import { createPublicClient, defineChain, http, keccak256, toHex } from "viem";
import type { Abi, PublicClient } from "viem";
import campaignArtifact = require("./generated/vnext/CampaignEscrowVNext.json");
import registryArtifact = require("./generated/vnext/JuryRegistry.json");
import reviewArtifact = require("./generated/vnext/JuryReview.json");
import tokenAbiJson = require("./generated/fundtogether/mock-usdc.abi.json");

export const vnextCampaignAbi = campaignArtifact.abi as Abi;
// Kept separate until Foundry is available to regenerate the checked-in
// artifact. The indexer can still decode the new canonical state events while
// transaction/read ABI identity remains tied to the generated artifact.
export const vnextCampaignEventAbi = [
  {
    type: "event",
    name: "MilestoneReviewStateChanged",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "milestoneId", type: "uint256", indexed: true },
      { name: "reviewCaseId", type: "bytes32", indexed: true },
      { name: "state", type: "uint8", indexed: false },
      { name: "outcome", type: "uint8", indexed: false },
      { name: "challengeDeadline", type: "uint256", indexed: false },
      { name: "correctionDeadline", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PublicationReviewCaseChanged",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true },
      { name: "reviewCaseId", type: "bytes32", indexed: true },
    ],
    anonymous: false,
  },
] as Abi;
export const vnextRegistryAbi = registryArtifact.abi as Abi;
export const vnextReviewAbi = reviewArtifact.abi as Abi;
export const vnextPolicyHash = keccak256(toHex("fundtogether-vnext-local-v2-remediation"));
export const vnextCampaignAbiHash = keccak256(
  toHex(JSON.stringify(campaignArtifact.abi, null, 2) + "\n"),
);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => value.toLowerCase() as `0x${string}`);

const schema = z.strictObject({
  protocolKind: z.literal("FUNDTOGETHER_VNEXT"),
  chainId: z.literal(31339),
  rpcUrl: z.string().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
        && url.port === "9548" && url.pathname === "/" && !url.username && !url.password
        && !url.search && !url.hash;
    } catch {
      return false;
    }
  }),
  abiVersion: z.literal("fundtogether-vnext-local-v2-remediation"),
  abiHash: z.literal(vnextCampaignAbiHash),
  policyHash: z.literal(vnextPolicyHash),
  tokenDecimals: z.literal(6),
  confirmations: z.literal(1),
  campaignEscrow: address,
  juryRegistry: address,
  juryReview: address,
  randomnessProvider: address,
  tokenAddress: address,
  genesisHash: hash,
  campaignCodeHash: hash,
  registryCodeHash: hash,
  reviewCodeHash: hash,
  tokenCodeHash: hash,
  deploymentBlockNumber: z.string().regex(/^[1-9][0-9]*$/),
  deploymentBlockHash: hash,
}).refine(value => new Set([
  value.campaignEscrow,
  value.juryRegistry,
  value.juryReview,
  value.randomnessProvider,
  value.tokenAddress,
]).size === 5, "VNext deployment addresses must be unique");

export type VNextDeploymentManifest = z.output<typeof schema>;

export function parseVNextDeploymentManifest(value: unknown): VNextDeploymentManifest {
  return schema.parse(value);
}

export function vnextClient(manifest: VNextDeploymentManifest) {
  const chain = defineChain({
    id: 31339,
    name: "FundTogether VNext local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [manifest.rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(manifest.rpcUrl, { timeout: 10000 }), pollingInterval: 100 });
}

async function codeHash(client: PublicClient, address: `0x${string}`) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`VNext contract has no code: ${address}`);
  return keccak256(code);
}

export async function verifyVNextDeployment(
  client: PublicClient,
  manifest: VNextDeploymentManifest,
) {
  parseVNextDeploymentManifest(manifest);
  const [chainId, genesis, deploymentBlock, campaignCode, registryCode, reviewCode, tokenCode] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockNumber: 0n }),
    client.getBlock({ blockNumber: BigInt(manifest.deploymentBlockNumber) }),
    codeHash(client, manifest.campaignEscrow),
    codeHash(client, manifest.juryRegistry),
    codeHash(client, manifest.juryReview),
    codeHash(client, manifest.tokenAddress),
  ]);
  if (chainId !== 31339 || genesis.hash !== manifest.genesisHash
    || deploymentBlock.hash !== manifest.deploymentBlockHash
    || campaignCode !== manifest.campaignCodeHash
    || registryCode !== manifest.registryCodeHash
    || reviewCode !== manifest.reviewCodeHash
    || tokenCode !== manifest.tokenCodeHash) {
    throw new Error("VNext deployment identity mismatch");
  }

  const campaignReads = await Promise.all([
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "supportedToken" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "reviewEngine" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "protocolVersion" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "policyHash" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "milestoneSubmissionWindow" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "correctionWindow" }),
  ]);
  if (String(campaignReads[0]).toLowerCase() !== manifest.tokenAddress
    || String(campaignReads[1]).toLowerCase() !== manifest.juryReview
    || campaignReads[2] !== 1n
    || String(campaignReads[3]).toLowerCase() !== manifest.policyHash.toLowerCase()
    || campaignReads[4] !== 7n * 24n * 60n * 60n
    || campaignReads[5] !== 7n * 24n * 60n * 60n) {
    throw new Error("VNext campaign wiring mismatch");
  }

  const reviewReads = await Promise.all([
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "registry" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "campaignEscrow" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "protocolVersion" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "MINIMUM_STAKE_FLOOR" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "RISK_MULTIPLIER_BPS" }),
  ]);
  if (String(reviewReads[0]).toLowerCase() !== manifest.juryRegistry
    || String(reviewReads[1]).toLowerCase() !== manifest.campaignEscrow
    || reviewReads[2] !== 1n
    || reviewReads[3] !== 10_000_000n
    || reviewReads[4] !== 500n) {
    throw new Error("VNext review wiring mismatch");
  }
  const decimals = await client.readContract({
    address: manifest.tokenAddress,
    abi: tokenAbiJson as Abi,
    functionName: "decimals",
  });
  if (decimals !== 6) throw new Error("VNext token decimals mismatch");
}
