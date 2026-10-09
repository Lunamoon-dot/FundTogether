import { advanceStreamKey, matchingAdvancePlan, AdvanceIndexerService } from "./advance-indexer.service";
import type { AdvanceDeployment, AdvanceCampaignSnapshot, AdvanceSubmissionPlan } from "./advance.types";
describe("B indexer context and metadata association", () => {
  const deployment = { chainId: 31338, contractAddress: "0xAA", deploymentId: "instance-a", genesisHash: "genesis-a",
    deploymentBlockNumber: "2", deploymentBlockHash: "anchor-a" } as unknown as AdvanceDeployment;
  it("separates protocol/incarnation even when chain ID and address repeat", () => {
    const key = advanceStreamKey(deployment);
    expect(key.startsWith("ADVANCE:31338:0xaa:")).toBe(true);
    for (const delta of [{ deploymentId: "instance-b" }, { genesisHash: "genesis-b" }, { deploymentBlockHash: "anchor-b" }, { deploymentBlockNumber: "3" }])
      expect(advanceStreamKey({ ...deployment, ...delta } as AdvanceDeployment)).not.toBe(key);
  });
  it("associates exact plan/organizer/budgets/criteria/duration and integer goal only", () => {
    const plan = { planHash: "h", organizer: "0xAA", fundingDuration: "86400", budgets: ["9007199254740993", "2"],
      criteriaHashes: ["c1", "c2"] } as unknown as AdvanceSubmissionPlan;
    const snapshot = { campaign: { planHash: "h", organizer: "0xaa", fundingDuration: "86400", goal: "9007199254740995" },
      stages: [{ budget: "9007199254740993", criteriaHash: "c1" }, { budget: "2", criteriaHash: "c2" }] } as unknown as AdvanceCampaignSnapshot;
    expect(matchingAdvancePlan(plan, snapshot)).toBe(true);
    for (const delta of [{ planHash: "other" }, { organizer: "0xbb" }, { goal: "9007199254740996" }, { fundingDuration: "86401" }])
      expect(matchingAdvancePlan(plan, { ...snapshot, campaign: { ...snapshot.campaign, ...delta } } as AdvanceCampaignSnapshot)).toBe(false);
    expect(matchingAdvancePlan(plan, { ...snapshot, stages: [...snapshot.stages].reverse() })).toBe(false);
  });
  it("coalesces concurrent poll calls and retains no stale promise after an error", async () => {
    let reject!: (error: Error) => void;
    const verify = jest.fn(() => new Promise<void>((_resolve, no) => { reject = no; }));
    const service = new AdvanceIndexerService({} as never, { deployment, verifyDeployment: verify } as never);
    const first = service.runOnce();
    expect(service.runOnce()).toBe(first);
    reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    const second = service.runOnce();
    expect(second).not.toBe(first); expect(verify).toHaveBeenCalledTimes(2);
    reject(new Error("offline")); await expect(second).rejects.toThrow("offline");
  });
});
