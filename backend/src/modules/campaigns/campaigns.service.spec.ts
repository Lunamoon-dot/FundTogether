import { CampaignsService } from "./campaigns.service";

describe("CampaignsService", () => {
  it("creates a campaign draft owned by the authenticated user", async () => {
    const saved = { id: "campaign-1", title: "Clean water", description: null };
    const returning = jest.fn().mockResolvedValue([saved]);
    const values = jest.fn().mockReturnValue({ returning });
    const milestoneValues = jest
      .fn()
      .mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
    const transaction = {
      insert: jest
        .fn()
        .mockReturnValueOnce({ values })
        .mockReturnValueOnce({ values: milestoneValues }),
    };
    const database = {
      transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new CampaignsService(database as never, {} as never);

    await expect(
      service.createDraft("user-1", {
        title: "Clean water",
        description: "Provide water",
        milestones: [
          {
            budgetUnits: "1000000",
            title: "Install filter",
            description: "Install and operate the filter",
            acceptanceCriteria: [
              { criterionId: "C1", description: "Filter operates" },
            ],
          },
        ],
      }),
    ).resolves.toEqual({ ...saved, milestones: [] });
    expect(values).toHaveBeenCalledWith({
      organizerUserId: "user-1",
      organizationId: null,
      createdByUserId: "user-1",
      title: "Clean water",
      description: "Provide water",
    });
  });
});
