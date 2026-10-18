import { CampaignPreviewController } from "../controllers/campaign.controller";

describe("CampaignPreviewController", () => {
  it("exposes a published campaign without a current canonical binding as activation pending", async () => {
    const approved = { id: "approved", status: "APPROVED" };
    const published = { id: "published", status: "PUBLISHED" };
    const campaigns = {
      publicList: jest.fn(async (statuses: string | readonly string[]) =>
        Array.isArray(statuses) && statuses.includes("PUBLISHED") ? [approved, published] : [approved]),
      publicPreview: jest.fn(),
    };
    const publication = {
      canonicalCampaignStates: jest.fn(async () => new Map<string, number>()),
      orphanedCampaignIds: jest.fn(async () => new Set<string>()),
    };
    const controller = new CampaignPreviewController(campaigns as any, publication as any);

    await expect(controller.activation()).resolves.toEqual([
      { ...approved, surface: "ACTIVATION_PENDING" },
      { ...published, surface: "ACTIVATION_PENDING" },
    ]);
    expect(campaigns.publicList).toHaveBeenCalledWith(["APPROVED", "PUBLISHED"]);
  });

  it("exposes a canonical successful campaign on the funded surface", async () => {
    const funded = { id: "funded", status: "PUBLISHED" };
    const campaigns = {
      publicList: jest.fn(async () => [funded]),
      publicPreview: jest.fn(),
    };
    const publication = {
      canonicalCampaignStates: jest.fn(async () => new Map([["funded", 1]])),
      orphanedCampaignIds: jest.fn(async () => new Set<string>()),
    };
    const controller = new CampaignPreviewController(campaigns as any, publication as any);

    await expect(controller.funded()).resolves.toEqual([
      { ...funded, surface: "FUNDED", chainState: 1 },
    ]);
    expect(campaigns.publicList).toHaveBeenCalledWith(["APPROVED", "PUBLISHED"]);
  });

  it("does not mislabel a campaign from an older deployment as activation pending", async () => {
    const stale = { id: "stale", status: "PUBLISHED" };
    const campaigns = {
      publicList: jest.fn(async () => [stale]),
      publicPreview: jest.fn(),
    };
    const publication = {
      canonicalCampaignStates: jest.fn(async () => new Map<string, number>()),
      orphanedCampaignIds: jest.fn(async () => new Set(["stale"])),
    };
    const controller = new CampaignPreviewController(campaigns as any, publication as any);

    await expect(controller.activation()).resolves.toEqual([]);
  });
});
