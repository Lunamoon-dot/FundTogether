import { CampaignWorkflowService } from "../workflow/campaign.service";

const draft = {
  mode: "FUNDTOGETHER_V1" as const,
  policyVersion: "fundtogether-comic-download-mvp-v1" as const,
  title: "A digital comic",
  pitch: "A short pitch for the campaign",
  story: "A longer story description for the digital comic campaign.",
  category: "COMICS_ARTBOOK" as const,
  goal: "1000000",
  fundingDuration: 86400,
  tiers: [{
    tierType: "STANDARD" as const,
    title: "PDF edition",
    description: "A private digital PDF download",
    price: "100000",
    benefitItems: [{ type: "DIGITAL_DOWNLOAD" as const, format: "PDF" as const, title: "PDF", description: "Digital PDF" }],
  }],
};

function fakeDb(profile: unknown) {
  const campaign = { id: "campaign-1", creatorUserId: "creator-1", status: "DRAFT", draftConfig: draft };
  const selectBuilder: any = {
    from: jest.fn(() => selectBuilder),
    where: jest.fn(() => selectBuilder),
    limit: jest.fn(() => selectBuilder),
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(profile ? [profile] : []).then(resolve),
  };
  return {
    select: jest.fn(() => selectBuilder),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ returning: jest.fn(async () => [campaign]) })),
    })),
  } as any;
}

describe("publication gates", () => {
  it.each([null, { status: "PENDING", studioWalletLinkId: null }, { status: "REJECTED", studioWalletLinkId: null }])(
    "allows a creator to create a draft without Studio verification: %j",
    async profile => {
      const service = new CampaignWorkflowService(fakeDb(profile), {} as any, {} as any);

      await expect(service.createDraft("creator-1", draft)).resolves.toMatchObject({ status: "DRAFT" });
    },
  );
});
