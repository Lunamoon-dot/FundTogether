import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

jest.mock("@nestjs/config", () => ({
  ConfigService: class {
    constructor(private readonly values: Record<string, unknown>) {}
    get(key: string) {
      return this.values[key];
    }
    getOrThrow(key: string) {
      return this.values[key];
    }
  },
}));

jest.mock("argon2", () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue("password-hash"),
  verify: jest.fn(),
}));

describe("account authentication", () => {
  const user = {
    id: "user-1",
    email: "donor@example.com",
    passwordHash: "hash",
  };
  let service: AuthService;
  let database: any;
  let rows: unknown[][];
  let inserted: unknown[];

  beforeEach(() => {
    jest.clearAllMocks();
    rows = [];
    inserted = [];
    const query = (): any => {
      const builder: any = {};
      for (const key of [
        "from",
        "where",
        "limit",
        "for",
        "leftJoin",
        "innerJoin",
        "returning",
        "onConflictDoNothing",
      ]) {
        builder[key] = jest.fn(() => builder);
      }
      builder.values = jest.fn((value) => {
        inserted.push(value);
        return builder;
      });
      builder.then = (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(rows.shift() ?? []).then(resolve);
      return builder;
    };
    database = {
      select: jest.fn(query),
      insert: jest.fn(query),
      delete: jest.fn(query),
    };
    database.transaction = async (callback: (tx: unknown) => unknown) =>
      callback(database);
    service = new AuthService(
      new ConfigService({
        webOrigin: "http://localhost:5173",
        authDomain: "localhost:5173",
        authChainId: 31337,
      }),
      database,
    );
  });

  it("registers a normalized email and creates an opaque session without a wallet", async () => {
    rows.push([user], [], [user], []);
    const result = await service.register(
      " Donor@Example.com ",
      "long-test-password",
    );
    expect(result.account).toEqual({
      userId: user.id,
      email: user.email,
      roles: [],
      wallets: [],
    });
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted[0]).toMatchObject({
      email: user.email,
      passwordHash: "password-hash",
    });
    expect(inserted[1]).toMatchObject({ userId: user.id });
    expect(JSON.stringify(inserted)).not.toContain(result.token);
    expect(argon2.hash).toHaveBeenCalledWith(
      "long-test-password",
      expect.objectContaining({ type: 2, memoryCost: 19456, timeCost: 2 }),
    );
  });

  it("returns platform roles with the authenticated account", async () => {
    rows.push([{ ...user, roles: ["RESOLVER"] }], []);
    await expect((service as any).getAccount(user.id)).resolves.toEqual({
      userId: user.id,
      email: user.email,
      roles: ["RESOLVER"],
      wallets: [],
    });
  });

  it("rejects duplicate email rather than merging accounts", async () => {
    rows.push([]);
    await expect(
      service.register(user.email, "long-test-password"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe("unlink wallet with account password", () => {
    const address = `0x${"1".repeat(40)}`;
    const token = "a".repeat(64);
    const wallet = { id: "link-1", userId: user.id, address, chainId: "31338" };
    beforeEach(() => { jest.mocked(argon2.verify).mockResolvedValue(true); });
    it("controller rejects malformed targets and caller-supplied user IDs", () => {
      const controller = new AuthController(service, new ConfigService());
      const request = { account: { userId: user.id }, sessionToken: token } as any;
      for (const body of [
        { address: 'wrong', chainId: 31338, password: 'password' },
        { address, chainId: -1, password: 'password' },
        { address, chainId: 31338, password: '' },
        { address, chainId: 31338, password: 'password', userId: 'another-user' },
      ]) expect(() => controller.unlinkWallet(body, request)).toThrow(BadRequestException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("controller takes owner and session exclusively from authentication", () => {
      const controller = new AuthController(service, new ConfigService());
      const unlink = jest.spyOn(service, 'unlinkWallet').mockResolvedValue({ userId: user.id } as any);
      controller.unlinkWallet({ address, chainId: 31338, password: 'password' }, { account: { userId: user.id }, sessionToken: token } as any);
      expect(unlink).toHaveBeenCalledWith(user.id, token, address, 31338, 'password');
    });
    it("rejects the wrong password before deleting anything", async () => {
      rows.push([user]);
      jest.mocked(argon2.verify).mockResolvedValue(false);
      await expect(service.unlinkWallet(user.id, token, address, 31338, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("protects accounts without a password login", async () => {
      rows.push([{ ...user, passwordHash: null }]);
      await expect(service.unlinkWallet(user.id, token, address, 31338, "password")).rejects.toBeInstanceOf(ConflictException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("rejects a revoked session even when password is correct", async () => {
      rows.push([user], []);
      await expect(service.unlinkWallet(user.id, token, address, 31338, "password")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("blocks organization representatives", async () => {
      rows.push([user], [{ userId: user.id }], [wallet], [{ id: "org" }]);
      await expect(service.unlinkWallet(user.id, token, address, 31338, "password")).rejects.toBeInstanceOf(ConflictException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    for (const [label, advance, legacy] of [["B frozen plan", [{ id: "plan" }], []], ["A submission", [], [{ id: "plan" }]]] as const) {
      it(`blocks ${label}`, async () => {
        rows.push([user], [{ userId: user.id }], [wallet], [], [...advance], [...legacy]);
        await expect(service.unlinkWallet(user.id, token, address, 31338, "password")).rejects.toBeInstanceOf(ConflictException);
        expect(database.delete).not.toHaveBeenCalled();
      });
    }
    it("removes an unused link and invalidates other sessions and pending challenges", async () => {
      rows.push([user], [{ userId: user.id }], [wallet], [], [], [], [], [], [], [user], []);
      const result = await service.unlinkWallet(user.id, token, address, 31338, "password");
      expect(result.userId).toBe(user.id);
      expect(result.wallets).toEqual([]);
      expect(database.delete).toHaveBeenCalledTimes(3);
    });
    it("retries safely when the scoped wallet link is absent", async () => {
      rows.push([user], [{ userId: user.id }], [], [user], []);
      await expect(service.unlinkWallet(user.id, token, address, 31338, "password")).resolves.toMatchObject({ userId: user.id });
      expect(database.delete).not.toHaveBeenCalled();
    });
  });

  it("rejects incorrect passwords without issuing a session", async () => {
    rows.push([user]);
    jest.mocked(argon2.verify).mockResolvedValue(false);
    await expect(
      service.login(user.email, "wrong-password"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.insert).not.toHaveBeenCalled();
  });

  it("rejects a missing, expired or revoked session", async () => {
    rows.push([]);
    await expect(service.verifySession("a".repeat(64))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects old JWT cookies before querying the database", async () => {
    await expect(
      service.verifySession("header.payload.signature"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.select).not.toHaveBeenCalled();
  });
});
