import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { AdvanceCampaignService } from "./advance-campaign.service";
import { freezeGiftPlan } from "./advance-plan";
import { createHash } from "node:crypto";
import type { Address } from "viem";
import { zeroHash } from "viem";
import type { AdvanceDeployment } from "./advance.types";

const context = { protocolKind: "ADVANCE", chainId: 31338, deploymentId: `0x${"1".repeat(64)}`,
  contractAddress: `0x${"1".repeat(40)}`, tokenAddress: `0x${"2".repeat(40)}`,
  resolver: `0x${"3".repeat(40)}`, workflowPolicy: `0x${"4".repeat(64)}`,
  abiVersion: "1", confirmations: 1, genesisHash: `0x${"5".repeat(64)}`,
  contractCodeHash: `0x${"6".repeat(64)}`, tokenCodeHash: `0x${"7".repeat(64)}`,
  deploymentBlockNumber: "2", deploymentBlockHash: `0x${"8".repeat(64)}`,
  policyHash: `0x${"9".repeat(64)}`, abiHash: `0x${"a".repeat(64)}`, tokenDecimals: 6,
} as AdvanceDeployment;
const organizer: Address = `0x${"b".repeat(40)}`;
const giftInput = { activityType: "GIFT_DISTRIBUTION", channel: "INSTITUTION", checklistVersion: "gift.v1",
  title: "Controlled gift plan", description: "Deliver100 synthetic packages", recipientScope: "School receipt only",
  eligibilityBasis: "Controlled authorized-contact registry", fundingDuration: "604800", stages: [{
    title: "Deliver", description: "Buy then deliver", budgetUnits: "2200000000", targetPackages: 100, goods: "Rice and oil",
    tasks: [{ taskId: "handover", description: "Deliver", criterionIds: ["C1"] }],
    acceptanceCriteria: [{ criterionId: "C1", description: "Authorized receipt100 packages", requiredDocuments: ["DELIVERY_RECORD"] }],
  }] };

describe("B plan freeze and access", () => {
  it("hashes exact UTF8 canonical bytes and keeps task completion separate from stage budget", () => {
    const input = giftInput as never;
    const one = freezeGiftPlan("11111111-1111-4111-8111-111111111111", 1, organizer, input, context);
    const reordered = Object.fromEntries(Object.entries(giftInput).reverse()) as never;
    const two = freezeGiftPlan("11111111-1111-4111-8111-111111111111", 1, organizer, reordered, context);
    expect(two).toEqual(one);
    expect(one.planHash).toBe(`0x${createHash("sha256").update(one.planBytes, "utf8").digest("hex")}`);
    expect(one.budgets).toEqual(["2200000000"]);
    expect(one.criteriaHashes).toHaveLength(1);
    expect(one.draftKey).not.toBe(zeroHash);
    expect(JSON.parse(one.planBytes).goalUnits).toBe("2200000000");
  });
  it("commitment changes with wallet/deployment/channel/criteria/budget and includes full anchor identity", () => {
    const base = freezeGiftPlan("11111111-1111-4111-8111-111111111111", 1, organizer, giftInput as never, context);
    expect(JSON.parse(base.planBytes).deploymentIdentity.genesisHash).toBe(context.genesisHash);
    for (const changed of [
      freezeGiftPlan("other", 1, organizer, giftInput as never, context),
      freezeGiftPlan("11111111-1111-4111-8111-111111111111", 1, context.tokenAddress, giftInput as never, context),
      freezeGiftPlan("11111111-1111-4111-8111-111111111111", 1, organizer, { ...giftInput, channel: "DIRECT" } as never, context),
      freezeGiftPlan("11111111-1111-4111-8111-111111111111", 1, organizer, giftInput as never, { ...context, deploymentId: zeroHash }),
    ]) expect(changed.planHash).not.toBe(base.planHash);
    expect(base.planBytes).not.toContain("rpcUrl");
  });
  it("create rejects a non-owner before writing any draft", async () => {
    const q: Record<string, unknown> = {};
    for (const method of ["from", "where", "for", "limit"]) q[method] = () => q;
    q.then = (resolve: (rows: never[]) => unknown) => resolve([]);
    const tx = { select: () => q, insert: jest.fn() };
    const db = { transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new AdvanceCampaignService(db as never, { context } as never);
    await expect(service.create("org", "outsider", giftInput as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it("foreign/deleted/non-B campaign access rejects rather than falling back to A", async () => {
    const q: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "for", "limit"]) q[method] = () => q;
    q.then = (resolve: (rows: never[]) => unknown) => resolve([]);
    const tx = { select: () => q, update: jest.fn() };
    const db = { transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new AdvanceCampaignService(db as never, { context } as never);
    await expect(service.update("unknown", "user", { ...giftInput, expectedRevision: 1 } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.update).not.toHaveBeenCalled();
  });
});
