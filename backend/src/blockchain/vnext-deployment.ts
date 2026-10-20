import { z } from "zod";
import { createPublicClient, defineChain, http, keccak256, toHex } from "viem";
import type { Abi, PublicClient } from "viem";
import campaignArtifact = require("./generated/vnext/CampaignEscrowVNext.json");
import registryArtifact = require("./generated/vnext/JuryRegistry.json");
import reviewArtifact = require("./generated/vnext/JuryReview.json");
import tokenAbiJson = require("./generated/fundtogether/mock-usdc.abi.json");

export const vnextCampaignAbi = campaignArtifact.abi as Abi;
export const vnextRegistryAbi = registryArtifact.abi as Abi;
export const vnextReviewAbi = reviewArtifact.abi as Abi;
export const vnextPolicyHash = keccak256(toHex("fundtogether-vnext-local-v2-remediation"));
export const vnextCampaignAbiHash = keccak256(
  toHex(JSON.stringify(campaignArtifact.abi, null, 2) + "\n"),
);
const vnextLocalPolicy = {
  campaign: {
    protocolVersion: 1n,
    challengeWindowDuration: 7n * 24n * 60n * 60n,
    milestoneSubmissionWindow: 7n * 24n * 60n * 60n,
    correctionWindow: 7n * 24n * 60n * 60n,
    maxMilestoneCorrections: 1n,
  },
  review: {
    protocolVersion: 1n,
    enrollmentDuration: 48n * 60n * 60n,
    commitDuration: 24n * 60n * 60n,
    revealDuration: 24n * 60n * 60n,
    appealWindowDuration: 48n * 60n * 60n,
    randomnessTimeout: 48n * 60n * 60n,
    maxEligibleJudges: 300n,
    minimumStakeFloor: 10_000_000n,
    riskMultiplierBps: 500n,
    appealBond: 1_000_000n,
    maximumAppealRounds: 2n,
    maximumRetriesPerReviewLevel: 2n,
    minoritySlashBps: 500n,
  },
} as const;
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

  const campaignWiringReads = await Promise.all([
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "supportedToken" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "reviewEngine" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "protocolVersion" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "policyHash" }),
  ]);
  if (String(campaignWiringReads[0]).toLowerCase() !== manifest.tokenAddress
    || String(campaignWiringReads[1]).toLowerCase() !== manifest.juryReview
    || campaignWiringReads[2] !== vnextLocalPolicy.campaign.protocolVersion
    || String(campaignWiringReads[3]).toLowerCase() !== manifest.policyHash.toLowerCase()) {
    throw new Error("VNext campaign wiring mismatch");
  }

  const campaignPolicyReads = await Promise.all([
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "milestoneSubmissionWindow" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "correctionWindow" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "challengeWindowDuration" }),
    client.readContract({ address: manifest.campaignEscrow, abi: vnextCampaignAbi, functionName: "MAX_MILESTONE_CORRECTIONS" }),
  ]);
  if (campaignPolicyReads[0] !== vnextLocalPolicy.campaign.milestoneSubmissionWindow
    || campaignPolicyReads[1] !== vnextLocalPolicy.campaign.correctionWindow
    || campaignPolicyReads[2] !== vnextLocalPolicy.campaign.challengeWindowDuration
    || campaignPolicyReads[3] !== vnextLocalPolicy.campaign.maxMilestoneCorrections) {
    throw new Error("VNext campaign policy mismatch");
  }

  const reviewWiringReads = await Promise.all([
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "registry" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "campaignEscrow" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "randomnessProvider" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "protocolVersion" }),
  ]);
  if (String(reviewWiringReads[0]).toLowerCase() !== manifest.juryRegistry
    || String(reviewWiringReads[1]).toLowerCase() !== manifest.campaignEscrow
    || String(reviewWiringReads[2]).toLowerCase() !== manifest.randomnessProvider
    || reviewWiringReads[3] !== vnextLocalPolicy.review.protocolVersion) {
    throw new Error("VNext review wiring mismatch");
  }

  const reviewPolicyReads = await Promise.all([
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "enrollmentDuration" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "commitDuration" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "revealDuration" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "appealWindowDuration" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "randomnessTimeout" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "maxEligibleJudges" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "MINIMUM_STAKE_FLOOR" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "RISK_MULTIPLIER_BPS" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "appealBond" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "maximumAppealRounds" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "MAXIMUM_RETRIES_PER_REVIEW_LEVEL" }),
    client.readContract({ address: manifest.juryReview, abi: vnextReviewAbi, functionName: "minoritySlashBps" }),
  ]);
  if (reviewPolicyReads[0] !== vnextLocalPolicy.review.enrollmentDuration
    || reviewPolicyReads[1] !== vnextLocalPolicy.review.commitDuration
    || reviewPolicyReads[2] !== vnextLocalPolicy.review.revealDuration
    || reviewPolicyReads[3] !== vnextLocalPolicy.review.appealWindowDuration
    || reviewPolicyReads[4] !== vnextLocalPolicy.review.randomnessTimeout
    || reviewPolicyReads[5] !== vnextLocalPolicy.review.maxEligibleJudges
    || reviewPolicyReads[6] !== vnextLocalPolicy.review.minimumStakeFloor
    || reviewPolicyReads[7] !== vnextLocalPolicy.review.riskMultiplierBps
    || reviewPolicyReads[8] !== vnextLocalPolicy.review.appealBond
    || reviewPolicyReads[9] !== vnextLocalPolicy.review.maximumAppealRounds
    || reviewPolicyReads[10] !== vnextLocalPolicy.review.maximumRetriesPerReviewLevel
    || reviewPolicyReads[11] !== vnextLocalPolicy.review.minoritySlashBps) {
    throw new Error("VNext review policy mismatch");
  }
  const decimals = await client.readContract({
    address: manifest.tokenAddress,
    abi: tokenAbiJson as Abi,
    functionName: "decimals",
  });
  if (decimals !== 6) throw new Error("VNext token decimals mismatch");
}
