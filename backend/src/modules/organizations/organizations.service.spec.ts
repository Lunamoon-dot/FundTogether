import { ConflictException, ForbiddenException } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { bindOrganizationWalletSchema } from "./organization.schema";

describe("Organization representative wallet", () => {
  const address = "0x1111111111111111111111111111111111111111";
  const input = { address, chainId: 31337 };
  const organization = {
    id: "org",
    createdByUserId: "creator",
    representativeWalletLinkId: null,
  };
  const wallet = {
    id: "verified-link",
    userId: "creator",
    address,
    chainId: "31337",
  };
  function setup(rows: unknown[][]) {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const transaction = {
      select: jest.fn(() => ({
        from: () => ({ where: () => ({ for: async () => rows.shift() }) }),
      })),
      update,
    };
    const database = {
      transaction: async (callback: (value: unknown) => unknown) =>
        callback(transaction),
    };
    return {
      service: new OrganizationsService(database as never),
      update,
      set,
    };
  }
  it("stores the verified creator wallet link", async () => {
    const { service, set } = setup([
      [organization],
      [{ role: "OWNER" }],
      [wallet],
    ]);
    await expect(service.bindWallet("org", "creator", input)).resolves.toEqual({
      organizationId: "org",
      representativeWallet: input,
    });
    expect(set).toHaveBeenCalledWith({
      representativeWalletLinkId: wallet.id,
      updatedAt: expect.any(Date),
    });
  });
  it("denies a noncreator before looking up wallets", async () => {
    const { service, update } = setup([[]]);
    await expect(
      service.bindWallet("org", "outsider", input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
  it("denies a creator whose membership was removed", async () => {
    const { service, update } = setup([[organization], []]);
    await expect(
      service.bindWallet("org", "creator", input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
  it("denies an address without an owned verified wallet link", async () => {
    const { service, update } = setup([
      [organization],
      [{ role: "OWNER" }],
      [],
    ]);
    await expect(
      service.bindWallet("org", "creator", input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });
  it("accepts the same selection idempotently", async () => {
    const { service, update } = setup([
      [{ ...organization, representativeWalletLinkId: wallet.id }],
      [{ role: "OWNER" }],
      [wallet],
    ]);
    await expect(service.bindWallet("org", "creator", input)).resolves.toEqual({
      organizationId: "org",
      representativeWallet: input,
    });
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects a replacement wallet", async () => {
    const { service, update } = setup([
      [{ ...organization, representativeWalletLinkId: "other-link" }],
      [{ role: "OWNER" }],
      [wallet],
    ]);
    await expect(
      service.bindWallet("org", "creator", input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });
  it("validates wallet input and rejects client identity overrides", () => {
    expect(bindOrganizationWalletSchema.safeParse(input).success).toBe(true);
    for (const invalid of [
      { ...input, address: "not-a-wallet" },
      { ...input, chainId: 0 },
      { ...input, chainId: 1.5 },
      { ...input, chainId: Number.MAX_SAFE_INTEGER + 1 },
      { ...input, userId: "outsider" },
    ]) {
      expect(bindOrganizationWalletSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
});
