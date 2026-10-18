import { z } from "zod";
import { createPublicClient, defineChain, http, keccak256, toHex } from "viem";
import type { Abi, PublicClient } from "viem";
import campaignAbiJson = require("./generated/campaigns/fund-together-campaign.abi.json");
import tokenAbiJson = require("./generated/fundtogether/mock-usdc.abi.json");

export const campaignAbi = campaignAbiJson as Abi;
export const campaignPolicyHash = keccak256(toHex("campaigns-local-escrow-v6"));
export const campaignAbiHash = keccak256(toHex(JSON.stringify(campaignAbiJson, null, 2) + "\n"));
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(value => value !== `0x${"0".repeat(40)}`).transform(value => value.toLowerCase() as `0x${string}`);
const schema = z.strictObject({
  protocolKind: z.literal("CAMPAIGNS"), chainId: z.literal(31339), abiVersion: z.literal("campaigns-local-v6"),
  rpcUrl: z.string().refine(value => {
    try { const url = new URL(value); return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "9548" && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash; }
    catch { return false; }
  }),
  abiHash: z.literal(campaignAbiHash), policyHash: z.literal(campaignPolicyHash),
  tokenDecimals: z.literal(6), confirmations: z.literal(1),
  contractAddress: address, tokenAddress: address, resolver: address, backupResolver: address,
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, deploymentBlockNumber: z.string().regex(/^[1-9][0-9]*$/), deploymentBlockHash: hash,
}).refine(value => value.resolver !== value.backupResolver && value.tokenAddress !== value.contractAddress);
export type DeploymentManifest = z.output<typeof schema>;
export function parseDeploymentManifest(value: unknown): DeploymentManifest { return schema.parse(value); }

export function campaignClient(manifest: DeploymentManifest) {
  const chain = defineChain({ id: 31339, name: "FundTogether Campaign local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
  return createPublicClient({ chain, transport: http(manifest.rpcUrl, { timeout: 10000 }), pollingInterval: 100 });
}

export async function verifyDeploymentManifest(client: PublicClient, manifest: DeploymentManifest) {
  parseDeploymentManifest(manifest);
  const [chainId, genesis, anchor, code, tokenCode] = await Promise.all([
    client.getChainId(), client.getBlock({ blockNumber: 0n }), client.getBlock({ blockNumber: BigInt(manifest.deploymentBlockNumber) }),
    client.getCode({ address: manifest.contractAddress }), client.getCode({ address: manifest.tokenAddress }),
  ]);
  if (chainId !== 31339 || genesis.hash !== manifest.genesisHash || anchor.hash !== manifest.deploymentBlockHash || !code || code === "0x" || !tokenCode || tokenCode === "0x" ||
    keccak256(code) !== manifest.contractCodeHash || keccak256(tokenCode) !== manifest.tokenCodeHash) throw new Error("Campaign deployment identity mismatch");
  for (const [functionName, expected] of Object.entries({ supportedToken: manifest.tokenAddress, resolver: manifest.resolver, backupResolver: manifest.backupResolver, policyHash: manifest.policyHash })) {
    const value = await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName });
    if (String(value).toLowerCase() !== expected.toLowerCase()) throw new Error(`Campaign ${functionName} mismatch`);
  }
  if (await client.readContract({ address: manifest.tokenAddress, abi: tokenAbiJson as Abi, functionName: "decimals" }) !== 6) throw new Error("Campaign token decimals mismatch");
}
