import { Inject, Injectable, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { resolve } from "node:path";
import { createPublicClient, defineChain, http } from "viem";
import type { Abi } from "viem";
import { ADVANCE_DEPLOYMENT, ADVANCE_STATES, STAGE_STATES, REVIEW_OUTCOMES, CASE_RESOLUTIONS } from "./advance.types";
import type { AdvanceDeployment, AdvanceContext, AdvanceCampaignSnapshot, AdvanceCampaignView,
  AdvanceStageView, AdvanceSubmissionView, AdvanceCaseView } from "./advance.types";
import generatedAbi = require("../blockchain/generated/advance/fund-together-advance.abi.json");
import tokenAbi = require("../blockchain/generated/advance/mock-usdc.abi.json");
import { backendRoot } from "./backend-root";

const identity = require(resolve(backendRoot, "scripts/workflow-b/generate-artifacts.cjs"));
const json = <T>(value: unknown): T => JSON.parse(JSON.stringify(value,
  (_key, field) => typeof field === "bigint" ? field.toString() : field)) as T;
function label<T extends string>(labels: readonly T[], index: unknown): T {
  const result = labels[Number(index)];
  if (result === undefined) throw new Error("Unknown Workflow B state");
  return result;
}

@Injectable()
export class AdvanceBlockchainService implements OnModuleInit {
  readonly client;
  readonly abi = generatedAbi as Abi;
  readonly context: AdvanceContext;

  constructor(@Inject(ADVANCE_DEPLOYMENT) readonly deployment: AdvanceDeployment) {
    identity.validateManifest(deployment);
    this.deployment = Object.freeze({ ...deployment });
    const { protocolKind, chainId, deploymentId, contractAddress, tokenAddress, resolver,
      workflowPolicy, abiVersion, confirmations } = deployment;
    this.context = Object.freeze({ protocolKind, chainId, deploymentId, contractAddress, tokenAddress,
      resolver, workflowPolicy, abiVersion, confirmations });
    const chain = defineChain({ id: 31338, name: "FundTogether Workflow B",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [deployment.rpcUrl] } } });
    this.client = createPublicClient({ chain, transport: http(deployment.rpcUrl, { timeout: 8000, retryCount: 0 }) });
  }

  async onModuleInit() { await this.verifyDeployment(); }

  async verifyDeployment(): Promise<void> {
    try { await identity.verifyDeployment(this.client, this.deployment, this.abi, tokenAbi as Abi); }
    catch { throw new ServiceUnavailableException("Workflow B blockchain unavailable or deployment identity changed"); }
  }

  read(functionName: string, args: unknown[], blockNumber?: bigint): Promise<unknown> {
    return this.client.readContract({ address: this.deployment.contractAddress, abi: this.abi, functionName, args, blockNumber });
  }

  async snapshot(id: bigint, blockNumber: bigint): Promise<AdvanceCampaignSnapshot> {
    await this.verifyDeployment();
    try {
      const before = await this.client.getBlock({ blockNumber });
      const [rawCampaign, rawCount] = await Promise.all([
        this.read("campaign", [id], blockNumber), this.read("stageCount", [id], blockNumber),
      ]);
      const campaign = json<AdvanceCampaignView>(rawCampaign);
      campaign.state = label(ADVANCE_STATES, campaign.state);
      const stages: AdvanceCampaignSnapshot["stages"] = [];
      for (let index = 0n; index < (rawCount as bigint); ++index) {
        const stage = json<AdvanceStageView>(await this.read("stage", [id, index], blockNumber));
        stage.state = label(STAGE_STATES, stage.state);
        const submissions: AdvanceCampaignSnapshot["stages"][number]["submissions"] = [];
        for (let version = 1n; version <= BigInt(stage.latestVersion); ++version) {
          const [rawSubmission, rawCase] = await Promise.all([
            this.read("submission", [id, index, version], blockNumber),
            this.read("challengeCase", [id, index, version], blockNumber),
          ]);
          const submission = json<AdvanceSubmissionView>(rawSubmission);
          submission.outcome = submission.reviewed ? label(REVIEW_OUTCOMES, submission.outcome) : null;
          const challengeCase = json<AdvanceCaseView>(rawCase);
          challengeCase.resolution = label(CASE_RESOLUTIONS, challengeCase.resolution);
          submissions.push({ ...submission, challengeCase });
        }
        stages.push({ ...stage, submissions });
      }
      await this.verifyDeployment();
      const after = await this.client.getBlock({ blockNumber });
      if (!before.hash || before.hash !== after.hash) throw new Error("Workflow B checkpoint orphaned");
      return { context: this.context, checkpoint: { blockNumber: blockNumber.toString(), blockHash: before.hash,
        chainTimestamp: before.timestamp.toString() }, campaignId: id.toString(), campaign, stages,
        published: BigInt(campaign.fundingEnd) > 0n, publicationTransactionHash: null };
    } catch { throw new ServiceUnavailableException("Workflow B canonical snapshot unavailable"); }
  }
}
