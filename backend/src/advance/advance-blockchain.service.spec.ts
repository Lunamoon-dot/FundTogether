jest.mock("viem", () => ({ ...jest.requireActual("viem"), createPublicClient: () => mockClient }));
import { ServiceUnavailableException } from "@nestjs/common";
import { resolve } from "node:path";
import { keccak256 } from "viem";
import generatedAbi = require("../blockchain/generated/advance/fund-together-advance.abi.json");
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import type { AdvanceDeployment } from "./advance.types";

const { policy, hashJson, workflowPolicy } = require(resolve(process.cwd(), "scripts/workflow-b/generate-artifacts.cjs"));
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const deployment = { protocolKind: "ADVANCE", chainId: 31338, rpcUrl: "http://127.0.0.1:9547",
  contractAddress: "0x0000000000000000000000000000000000000001",
  tokenAddress: "0x0000000000000000000000000000000000000002",
  resolver: "0x0000000000000000000000000000000000000003", deploymentId: h(4),
  genesisHash: h(5), deploymentBlockHash: h(6), deploymentBlockNumber: "2", tokenDecimals: 6,
  confirmations: 1, abiVersion: "1", abiHash: hashJson(generatedAbi), policyHash: hashJson(policy),
  workflowPolicy, contractCodeHash: keccak256("0x6000"), tokenCodeHash: keccak256("0x6001") } as AdvanceDeployment;
const mockClient = {
  getChainId: jest.fn(), getBlock: jest.fn(), getCode: jest.fn(), readContract: jest.fn(),
};
const zeroHash: `0x${string}` = `0x${"0".repeat(64)}`;
const rawStage = { budget: 2200n, criteriaHash: deployment.workflowPolicy, state: 0,
  advanced: 0n, returned: 0n, latestVersion: 1n, hardStop: 0n, submissionEnd: 0n,
  reviewEnd: 0n, challengeEnd: 0n, finalizeEnd: 0n, acceptedCampaignSpent: 0n,
  declaredUnused: 0n, publicHash: zeroHash, reportHash: zeroHash };

describe("isolated AdvanceBlockchainService", () => {
  let service: AdvanceBlockchainService;
  beforeEach(() => {
    jest.resetAllMocks();
    mockClient.getChainId.mockResolvedValue(31338);
    mockClient.getBlock.mockImplementation(async ({ blockNumber }) => ({
      number: blockNumber, timestamp: 123n, hash: blockNumber === 0n ? deployment.genesisHash : deployment.deploymentBlockHash,
    }));
    // Code mismatch tests run before getters; the positive snapshot test replaces verification.
    mockClient.getCode.mockResolvedValue("0x00");
    service = new AdvanceBlockchainService(deployment);
  });
  it.each([31337, 1])("fails closed for chain %s before reading funds", async chainId => {
    mockClient.getChainId.mockResolvedValue(chainId);
    await expect(service.verifyDeployment()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("rejects missing/wrong deployment bytecode, genesis and anchor", async () => {
    await expect(service.verifyDeployment()).rejects.toBeInstanceOf(ServiceUnavailableException);
    mockClient.getBlock.mockResolvedValue({ hash: zeroHash });
    await expect(service.verifyDeployment()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("validates manifest before creating a client; cannot use A or zero instance", () => {
    expect(() => new AdvanceBlockchainService({ ...deployment, chainId: 31337 })).toThrow(/Workflow B/);
    expect(() => new AdvanceBlockchainService({ ...deployment, deploymentId: zeroHash })).toThrow(/Workflow B/);
  });
  it("reads only B ABI/address at the requested canonical block, serializes uint256 and unreviewed outcome", async () => {
    jest.spyOn(service, "verifyDeployment").mockResolvedValue();
    mockClient.readContract.mockImplementation(async ({ functionName }) => {
      if (functionName === "campaign") return { organizer: deployment.resolver, planHash: deployment.workflowPolicy,
        goal: 2200n, fundingDuration: 86400n, state: 5, currentStage: 0n, fundingEnd: 99n,
        firstReviewEnd: 100n, claimEnd: 110n, contributed: 2200n, advanced: 2200n,
        returned: 0n, refunded: 0n, custody: 0n, refundSnapshotted: false, basePool: 0n, supplementPool: 0n };
      if (functionName === "stageCount") return 1n;
      if (functionName === "stage") return rawStage;
      if (functionName === "submission") return { version: 1n, evidenceHash: deployment.workflowPolicy,
        parentVersion: 0n, submittedAt: 120n, reviewed: false, outcome: 0, reportHash: zeroHash, publicHash: zeroHash };
      if (functionName === "challengeCase") return { opener: deployment.resolver, reasonHash: zeroHash,
        responseHash: zeroHash, responseEnd: 0n, resolutionEnd: 0n, resolution: 0, resolutionReasonHash: zeroHash, caseUsed: false };
      return BigInt(policy[functionName]);
    });
    const snapshot = await service.snapshot(0n, 10n);
    expect(snapshot.campaign.state).toBe("EXECUTING");
    expect(snapshot.campaign.goal).toBe("2200");
    expect(snapshot.stages[0].submissions[0].outcome).toBeNull();
    expect(snapshot.stages[0].submissions[0].challengeCase.resolution).toBe("PENDING");
    expect(snapshot.context.protocolKind).toBe("ADVANCE");
    expect(JSON.stringify(snapshot)).not.toContain("2200n");
    for (const [call] of mockClient.readContract.mock.calls) {
      expect(call.address).toBe(deployment.contractAddress);
      expect(call.blockNumber).toBe(10n);
    }
  });
  it("rejects a checkpoint which becomes orphaned during reads", async () => {
    jest.spyOn(service, "verifyDeployment").mockResolvedValue();
    mockClient.getBlock.mockResolvedValueOnce({ hash: deployment.genesisHash, timestamp: 123n })
      .mockResolvedValueOnce({ hash: deployment.deploymentBlockHash, timestamp: 124n });
    mockClient.readContract.mockImplementation(async ({ functionName }) => functionName === "stageCount" ? 0n : { state: 0, fundingEnd: 0n });
    await expect(service.snapshot(0n, 10n)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockClient.getBlock).toHaveBeenCalledTimes(2);
  });
});
