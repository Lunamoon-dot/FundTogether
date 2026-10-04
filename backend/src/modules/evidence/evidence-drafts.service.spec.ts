import { ConflictException } from "@nestjs/common";
import { EvidenceDraftsService } from "./evidence-drafts.service";
import { EvidenceAccessService } from "./evidence-access.service";

describe("EvidenceDraftsService", () => {
  const content = {
    report: {
      summary: "Work completed",
      performedFrom: "2026-10-01",
      performedTo: "2026-10-01",
      outcomes: [],
    },
    expenses: [],
    documents: [],
  };

  it("persists the authenticated owner and schema version on first save", async () => {
    const saved = {
      id: "draft-1",
      campaignMetadataId: "campaign-1",
      milestoneIndex: "0",
      organizerUserId: "user-1",
      evidenceSchemaVersion: "0.1",
      content,
      revision: 1,
    };
    const returning = jest.fn().mockResolvedValue([saved]);
    const values = jest.fn().mockReturnValue({ returning });
    const transaction = {
      insert: jest.fn().mockReturnValue({ values }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockReturnValue({
              for: jest.fn().mockResolvedValue([{ id: "campaign-1" }]),
              limit: jest.fn().mockResolvedValue([{ id: "milestone-1" }]),
            }),
        }),
      }),
    };
    const database = {
      transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const access = {
      assertCampaignOrganizer: jest.fn().mockResolvedValue(undefined),
    } as unknown as EvidenceAccessService;
    const service = new EvidenceDraftsService(database as never, access);

    await expect(
      service.create("campaign-1", "0", "user-1", content, "milestone-1"),
    ).resolves.toMatchObject({ evidenceSchemaVersion: "0.1", revision: 1 });
    expect(values).toHaveBeenCalledWith({
      campaignMetadataId: "campaign-1",
      milestoneIndex: "0",
      organizerUserId: "user-1",
      evidenceSchemaVersion: "0.1",
      content,
      revision: 1,
    });
  });

  it("rejects a stale update when the draft revision no longer matches", async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    const database = { update: jest.fn().mockReturnValue({ set }) };
    const access = {
      assertCampaignOrganizer: jest.fn().mockResolvedValue(undefined),
    } as unknown as EvidenceAccessService;
    const service = new EvidenceDraftsService(database as never, access);

    await expect(
      service.update("campaign-1", "0", "user-1", 3, content),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("turns a duplicate campaign/milestone draft into a conflict", async () => {
    const error = Object.assign(new Error("Drizzle query failed"), {
      cause: Object.assign(new Error("duplicate"), { code: "23505" }),
    });
    const returning = jest.fn().mockRejectedValue(error);
    const values = jest.fn().mockReturnValue({ returning });
    const transaction = {
      insert: jest.fn().mockReturnValue({ values }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockReturnValue({
              for: jest.fn().mockResolvedValue([{ id: "campaign-1" }]),
              limit: jest.fn().mockResolvedValue([{ id: "milestone-1" }]),
            }),
        }),
      }),
    };
    const database = {
      transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const access = {
      assertCampaignOrganizer: jest.fn().mockResolvedValue(undefined),
    } as unknown as EvidenceAccessService;
    const service = new EvidenceDraftsService(database as never, access);

    await expect(
      service.create("campaign-1", "0", "user-1", content, "milestone-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
