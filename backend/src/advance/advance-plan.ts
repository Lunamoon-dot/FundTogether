import { createHash } from "node:crypto";
import type { Address, Hex } from "viem";
import { giftUpdateSchema, goalUnits } from "./advance-campaign.schema";
import type { GiftDraft } from "./advance-campaign.schema";
import type { AdvanceDeployment, AdvanceSubmissionPlan } from "./advance.types";
import { ConflictException } from "@nestjs/common";
export const sha256 = (bytes: string | Buffer): Hex => `0x${createHash("sha256").update(bytes).digest("hex")}`;

export function restoreGiftPlan(row: { campaignMetadataId: string; frozenPlanBytes: string | null;
  planHash: string | null; draftKey: string | null; organizerWallet: string | null }, deployment: AdvanceDeployment): AdvanceSubmissionPlan {
  if (!row.frozenPlanBytes || sha256(row.frozenPlanBytes) !== row.planHash)
    throw new ConflictException("Frozen plan bytes/hash mismatch");
  const stored = JSON.parse(row.frozenPlanBytes);
  const rebuilt = freezeGiftPlan(row.campaignMetadataId, stored.revision, row.organizerWallet as Address,
    { activityType: stored.activityType, channel: stored.channel, checklistVersion: stored.checklistVersion,
      title: stored.title, description: stored.description, recipientScope: stored.recipientScope,
      eligibilityBasis: stored.eligibilityBasis, fundingDuration: stored.fundingDuration,
      stages: stored.stages.map((s: { milestoneId: string | null; [key: string]: unknown }) => ({ id: s.milestoneId ?? undefined,
        title: s.title, description: s.description, budgetUnits: s.budgetUnits, targetPackages: s.targetPackages,
        goods: s.goods, tasks: s.tasks, acceptanceCriteria: s.acceptanceCriteria })) } as GiftDraft, deployment);
  if (rebuilt.planHash !== row.planHash || rebuilt.draftKey !== row.draftKey || rebuilt.planBytes !== row.frozenPlanBytes)
    throw new ConflictException("Frozen plan deployment or commitment changed");
  return rebuilt;
}

export function freezeGiftPlan(id: string, revision: number, organizer: Address,
  input: GiftDraft, deployment: AdvanceDeployment): AdvanceSubmissionPlan {
  const draft = giftUpdateSchema.parse({ ...input, expectedRevision: revision });
  const { protocolKind, chainId, deploymentId, contractAddress, tokenAddress, resolver,
    workflowPolicy, abiVersion, confirmations, genesisHash, contractCodeHash, tokenCodeHash,
    deploymentBlockNumber, deploymentBlockHash, abiHash, policyHash, tokenDecimals } = deployment;
  const context = { protocolKind, chainId, deploymentId, contractAddress, tokenAddress, resolver, workflowPolicy, abiVersion, confirmations };
  const deploymentIdentity = { genesisHash, contractCodeHash, tokenCodeHash, deploymentBlockNumber, deploymentBlockHash, abiHash, policyHash, tokenDecimals };
  const draftKey = sha256(`FundTogether.Advance.draft.v1:${deploymentId}:${id}`);
  const stages = draft.stages.map((s, index) => ({ index, milestoneId: s.id ?? null, title: s.title, description: s.description,
    budgetUnits: s.budgetUnits, targetPackages: s.targetPackages, goods: s.goods,
    tasks: s.tasks.map(t => ({ taskId: t.taskId, description: t.description, criterionIds: t.criterionIds })),
    acceptanceCriteria: s.acceptanceCriteria.map(c => ({ criterionId: c.criterionId, description: c.description, requiredDocuments: c.requiredDocuments })),
  }));
  const criteriaHashes = stages.map(s => sha256(JSON.stringify({ version: "gift.v1", channel: draft.channel,
    recipientScope: draft.recipientScope, eligibilityBasis: draft.eligibilityBasis, ...s })));
  const planBytes = JSON.stringify({ schemaVersion: "advance.plan.v1", context, deploymentIdentity,
    campaignMetadataId: id, draftKey, organizer: organizer.toLowerCase(), revision,
    activityType: draft.activityType, channel: draft.channel, checklistVersion: draft.checklistVersion,
    title: draft.title, description: draft.description, recipientScope: draft.recipientScope,
    eligibilityBasis: draft.eligibilityBasis, fundingDuration: draft.fundingDuration,
    goalUnits: goalUnits(draft), stages, criteriaHashes });
  return { context, draftKey, organizer: organizer.toLowerCase() as Address, planHash: sha256(planBytes), planBytes,
    fundingDuration: draft.fundingDuration, budgets: stages.map(s => s.budgetUnits), criteriaHashes, expectedRevision: revision };
}
