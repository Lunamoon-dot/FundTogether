import { Inject, Injectable, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { createPublicClient, defineChain, http } from "viem";
import type { Abi } from "viem";
import generatedAbi = require("../blockchain/generated/hed/fund-together-disbursement.abi.json");
import tokenAbi = require("../blockchain/generated/hed/mock-usdc.abi.json");
import { HED_ACTIVITY_STATES, HED_CAMPAIGN_STATES, HED_DEPLOYMENT, HED_REQUEST_STATES } from "./hed.types";
import type { HedCampaignSnapshot, HedCampaignView, HedDeployment, HedRequestView, HedActivityView, HedRiskProjection } from "./hed.types";
import { backendRoot } from "../backend-root";
import { resolve } from "node:path";

const identity = require(resolve(backendRoot, "scripts/hed/generate-artifacts.cjs"));
const json = <T>(value: unknown): T => JSON.parse(JSON.stringify(value,
  (_key, field) => typeof field === "bigint" ? field.toString() : field)) as T;
function label<T extends string>(labels: readonly T[], index: unknown): T {
  const value = labels[Number(index)];
  if (value === undefined) throw new Error("Unknown HED state");
  return value;
}

export function computeHedRiskProjection(
  campaign: HedCampaignView,
  activities: readonly HedActivityView[],
  requests: readonly HedRequestView[],
): HedRiskProjection {
  const goal = BigInt(campaign.goal || 0);
  const maxRequestCap = goal > 0n ? (goal / 4n).toString() : "0";
  const financialExposureLimit = maxRequestCap;
  const outcomeExposureLimit = goal > 0n ? (goal / 2n).toString() : "0";

  let financialExposureBigInt = 0n;
  let hasOpenRequest = false;
  for (const r of requests) {
    if (r.state === "SUBMITTED" || r.state === "APPROVED_DISBURSED" || r.state === "EXPENDITURE_CANDIDATE") {
      hasOpenRequest = true;
    }
    if (r.state === "APPROVED_DISBURSED" || r.state === "EXPENDITURE_CANDIDATE") {
      const gross = BigInt(r.grossPaid || 0);
      const ret = BigInt(r.returned || 0);
      financialExposureBigInt += gross > ret ? gross - ret : 0n;
    }
  }

  let outcomeExposureBigInt = 0n;
  let hasOpenActivity = false;
  for (const a of activities) {
    if (a.state === "OPEN" || a.state === "OUTCOME_CANDIDATE") {
      hasOpenActivity = true;
      outcomeExposureBigInt += BigInt(a.approved || 0);
    }
  }

  const financialLimitBigInt = BigInt(financialExposureLimit);
  const outcomeLimitBigInt = BigInt(outcomeExposureLimit);

  const financialExposureRatioBps = financialLimitBigInt > 0n
    ? Math.min(10000, Number((financialExposureBigInt * 10000n) / financialLimitBigInt))
    : 0;

  const outcomeExposureRatioBps = outcomeLimitBigInt > 0n
    ? Math.min(10000, Number((outcomeExposureBigInt * 10000n) / outcomeLimitBigInt))
    : 0;

  const canCreateRequest = campaign.state === "ACTIVE" && !hasOpenRequest && hasOpenActivity;

  return {
    maxRequestCap,
    financialExposure: financialExposureBigInt.toString(),
    financialExposureLimit,
    financialExposureRatioBps,
    outcomeExposure: outcomeExposureBigInt.toString(),
    outcomeExposureLimit,
    outcomeExposureRatioBps,
    hasOpenRequest,
    hasOpenActivity,
    canCreateRequest,
  };
}

@Injectable()
export class HedBlockchainService implements OnModuleInit {
  readonly client;
  readonly abi = generatedAbi as Abi;
  readonly context;

  constructor(@Inject(HED_DEPLOYMENT) readonly deployment: HedDeployment) {
    identity.validateManifest(deployment);
    this.deployment = Object.freeze({ ...deployment });
    const { protocolKind, chainId, contractAddress, tokenAddress, resolver, backupResolver, policyHash, abiVersion, confirmations } = deployment;
    this.context = Object.freeze({ protocolKind, chainId, contractAddress, tokenAddress, resolver, backupResolver, policyHash, abiVersion, confirmations });
    const chain = defineChain({ id: chainId, name: "FundTogether HED", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [deployment.rpcUrl] } } });
    this.client = createPublicClient({ chain, transport: http(deployment.rpcUrl, { timeout: 8000, retryCount: 0 }) });
  }

  async onModuleInit() { await this.verifyDeployment(); }

  async verifyDeployment(): Promise<void> {
    try { await identity.verifyDeployment(this.client, this.deployment, this.abi, tokenAbi as Abi); }
    catch { throw new ServiceUnavailableException("HED blockchain unavailable or deployment identity changed"); }
  }

  read(functionName: string, args: unknown[], blockNumber?: bigint): Promise<unknown> {
    return this.client.readContract({ address: this.deployment.contractAddress, abi: this.abi, functionName, args, blockNumber });
  }

  async snapshot(id: bigint, blockNumber: bigint): Promise<HedCampaignSnapshot> {
    await this.verifyDeployment();
    try {
      const before = await this.client.getBlock({ blockNumber });
      const [rawCampaign, requestCount, activityCount] = await Promise.all([
        this.read("campaign", [id], blockNumber), this.read("requestCount", [id], blockNumber), this.read("activityCount", [id], blockNumber),
      ]);
      const campaign = json<HedCampaignView>(rawCampaign);
      campaign.state = label(HED_CAMPAIGN_STATES, campaign.state);
      const requests: HedRequestView[] = [];
      for (let requestId = 0n; requestId < (requestCount as bigint); requestId++) {
        const request = json<HedRequestView>(await this.read("request", [id, requestId], blockNumber));
        request.state = label(HED_REQUEST_STATES, request.state);
        requests.push(request);
      }
      const activities: HedActivityView[] = [];
      for (let activityId = 0n; activityId < (activityCount as bigint); activityId++) {
        const activity = json<HedActivityView>(await this.read("activity", [id, activityId], blockNumber));
        activity.state = label(HED_ACTIVITY_STATES, activity.state);
        activities.push(activity);
      }
      await this.verifyDeployment();
      const after = await this.client.getBlock({ blockNumber });
      if (!before.hash || before.hash !== after.hash) throw new Error("HED checkpoint orphaned");
      const riskProjection = computeHedRiskProjection(campaign, activities, requests);
      return { context: this.context, checkpoint: { blockNumber: blockNumber.toString(), blockHash: before.hash,
        chainTimestamp: before.timestamp.toString() }, campaignId: id.toString(), campaign, activities, requests, riskProjection };
    } catch { throw new ServiceUnavailableException("HED canonical snapshot unavailable"); }
  }
}
