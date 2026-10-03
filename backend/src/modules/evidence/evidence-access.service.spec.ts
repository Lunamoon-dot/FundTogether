import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { EvidenceAccessService } from "./evidence-access.service";

describe("EvidenceAccessService", () => {
  const select = jest.fn();
  const from = jest.fn();
  const where = jest.fn();
  const limit = jest.fn();
  const database = {
    select: (...args: unknown[]) => {
      select(...args);
      return { from };
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
  });

  it("allows the campaign owner", async () => {
    limit.mockResolvedValue([{ organizerUserId: "owner-1" }]);
    const service = new EvidenceAccessService(database as never);

    await expect(
      service.assertCampaignOrganizer("campaign-1", "owner-1"),
    ).resolves.toBeUndefined();
  });

  it("rejects another authenticated user", async () => {
    limit.mockResolvedValue([{ organizerUserId: "owner-1" }]);
    const service = new EvidenceAccessService(database as never);

    await expect(
      service.assertCampaignOrganizer("campaign-1", "other-user"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found for an unknown campaign", async () => {
    limit.mockResolvedValue([]);
    const service = new EvidenceAccessService(database as never);

    await expect(
      service.assertCampaignOrganizer("missing", "owner-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
