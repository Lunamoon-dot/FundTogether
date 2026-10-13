import { z } from "zod";
import { createPublicClient, defineChain, http, keccak256, toHex } from "viem";
import type { Abi, PublicClient } from "viem";
import editionsAbiJson = require("./generated/editions/fund-together-editions.abi.json");
import tokenAbiJson = require("./generated/reward/mock-usdc.abi.json");

export const editionsAbi = editionsAbiJson as Abi;
export const editionsPolicyHash = keccak256(toHex("editions-local-escrow-v1"));
export const editionsAbiHash = keccak256(toHex(JSON.stringify(editionsAbiJson, null, 2) + "\n"));
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(value => value !== `0x${"0".repeat(40)}`).transform(value => value.toLowerCase() as `0x${string}`);
const schema = z.strictObject({
  protocolKind: z.literal("EDITIONS"), chainId: z.literal(31339), abiVersion: z.literal("editions-local-v1"),
  rpcUrl: z.string().refine(value => {
    try { const url = new URL(value); return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "9548" && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash; }
    catch { return false; }
  }),
  abiHash: z.literal(editionsAbiHash), policyHash: z.literal(editionsPolicyHash),
  tokenDecimals: z.literal(6), confirmations: z.literal(1),
  contractAddress: address, tokenAddress: address, resolver: address, backupResolver: address,
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, deploymentBlockNumber: z.string().regex(/^[1-9][0-9]*$/), deploymentBlockHash: hash,
}).refine(value => value.resolver !== value.backupResolver && value.tokenAddress !== value.contractAddress);
export type EditionsDeployment = z.output<typeof schema>;
export function parseEditionsDeployment(value: unknown): EditionsDeployment { return schema.parse(value); }

export function editionsClient(manifest: EditionsDeployment) {
  const chain = defineChain({ id: 31339, name: "FundTogether Editions local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
  return createPublicClient({ chain, transport: http(manifest.rpcUrl, { timeout: 10000 }), pollingInterval: 100 });
}

export async function verifyEditionsDeployment(client: PublicClient, manifest: EditionsDeployment) {
  parseEditionsDeployment(manifest);
  const [chainId, genesis, anchor, code, tokenCode] = await Promise.all([
    client.getChainId(), client.getBlock({ blockNumber: 0n }), client.getBlock({ blockNumber: BigInt(manifest.deploymentBlockNumber) }),
    client.getCode({ address: manifest.contractAddress }), client.getCode({ address: manifest.tokenAddress }),
  ]);
  if (chainId !== 31339 || genesis.hash !== manifest.genesisHash || anchor.hash !== manifest.deploymentBlockHash || !code || code === "0x" || !tokenCode || tokenCode === "0x" ||
    keccak256(code) !== manifest.contractCodeHash || keccak256(tokenCode) !== manifest.tokenCodeHash) throw new Error("Editions deployment identity mismatch");
  for (const [functionName, expected] of Object.entries({ supportedToken: manifest.tokenAddress, resolver: manifest.resolver, backupResolver: manifest.backupResolver, policyHash: manifest.policyHash })) {
    const value = await client.readContract({ address: manifest.contractAddress, abi: editionsAbi, functionName });
    if (String(value).toLowerCase() !== expected.toLowerCase()) throw new Error(`Editions ${functionName} mismatch`);
  }
  if (await client.readContract({ address: manifest.tokenAddress, abi: tokenAbiJson as Abi, functionName: "decimals" }) !== 6) throw new Error("Editions token decimals mismatch");
}
