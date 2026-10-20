import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { authSessions, campaigns, creatorProfiles, users, walletLinks } from "../../database/schema";

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
  let readsByTable: Map<unknown, unknown[][]> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    rows = [];
    inserted = [];
    readsByTable = undefined;
    const query = (operation: string, table?: unknown): any => {
      const builder: any = {};
      for (const key of [
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
      builder.from = jest.fn((target: unknown) => { table = target; return builder; });
      builder.values = jest.fn((value) => {
        inserted.push(value);
        return builder;
      });
      builder.then = (resolve: (value: unknown[]) => unknown) => {
        if (readsByTable && operation === "select") {
          const result = readsByTable.get(table)?.shift();
          if (!result) throw new Error("Unexpected table read in auth fixture");
          return Promise.resolve(result).then(resolve);
        }
        return Promise.resolve(rows.shift() ?? []).then(resolve);
      };
      return builder;
    };
    database = {
      select: jest.fn(() => query("select")),
      insert: jest.fn(table => query("insert", table)),
      delete: jest.fn(table => query("delete", table)),
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

  it("returns platform roles with the authenticated account", async () => {
    rows.push([{ ...user, roles: ["RESOLVER"] }], []);
    await expect((service as any).getAccount(user.id)).resolves.toEqual({
      userId: user.id,
      email: user.email,
      roles: ["RESOLVER"],
      wallets: [],
    });
  });

  it("provisions a wallet-owned account on the first successful SIWE login", async () => {
    const address = `0x${"1".repeat(40)}`;
    jest.spyOn(service as any, "verifyWalletMessage").mockResolvedValue({ address, chainId: 31339 });
    readsByTable = new Map<unknown, unknown[][]>([
      [walletLinks, [[], [{ userId: "wallet-user" }], [{ address, chainId: "31339" }]]],
      [users, [[{ id: "wallet-user", email: null, roles: null }]]],
    ]);
    rows.push([{ id: "wallet-user" }], [], []);

    const result = await service.verifySiwe("signed-message", "0xsignature");

    expect(result.account).toEqual({
      userId: "wallet-user",
      email: null,
      roles: [],
      wallets: [{ address, chainId: 31339 }],
    });
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted[0]).toEqual({});
    expect(inserted[1]).toMatchObject({ userId: "wallet-user", address, chainId: "31339", isPrimary: true });
    expect(inserted[2]).toMatchObject({ userId: "wallet-user" });
  });

  it("keeps an existing wallet attached to its original account", async () => {
    const address = `0x${"2".repeat(40)}`;
    jest.spyOn(service as any, "verifyWalletMessage").mockResolvedValue({ address, chainId: 31339 });
    readsByTable = new Map<unknown, unknown[][]>([
      [walletLinks, [[{ userId: user.id }], [{ address, chainId: "31339" }]]],
      [users, [[{ ...user, roles: null }]]],
    ]);
    rows.push([]);

    const result = await service.verifySiwe("signed-message", "0xsignature");

    expect(result.account.userId).toBe(user.id);
    expect(database.insert).toHaveBeenCalledTimes(1);
    expect(inserted[0]).toMatchObject({ userId: user.id });
  });

  describe("unlink wallet with account password", () => {
    const address = `0x${"1".repeat(40)}`;
    const token = "a".repeat(64);
    const wallet = { id: "link-1", userId: user.id, address, chainId: "31339" };
    beforeEach(() => {
      jest.mocked(argon2.verify).mockResolvedValue(true);
      readsByTable = new Map<unknown, unknown[][]>([
        [users, [[user], [user]]], [authSessions, [[{ userId: user.id }]]],
        [walletLinks, [[wallet], []]], [campaigns, [[]]], [creatorProfiles, [[]]],
      ]);
    });
    it("controller rejects malformed targets and caller-supplied user IDs", () => {
      const controller = new AuthController(service, new ConfigService());
      const request = { account: { userId: user.id }, sessionToken: token } as any;
      for (const body of [
        { address: 'wrong', chainId: 31339, password: 'password' },
        { address, chainId: -1, password: 'password' },
        { address, chainId: 31339, password: '' },
        { address, chainId: 31339, password: 'password', userId: 'another-user' },
      ]) expect(() => controller.unlinkWallet(body, request)).toThrow(BadRequestException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("controller takes owner and session exclusively from authentication", () => {
      const controller = new AuthController(service, new ConfigService());
      const unlink = jest.spyOn(service, 'unlinkWallet').mockResolvedValue({ userId: user.id } as any);
      controller.unlinkWallet({ address, chainId: 31339, password: 'password' }, { account: { userId: user.id }, sessionToken: token } as any);
      expect(unlink).toHaveBeenCalledWith(user.id, token, address, 31339, 'password');
    });
    it("rejects the wrong password before deleting anything", async () => {
      jest.mocked(argon2.verify).mockResolvedValue(false);
      await expect(service.unlinkWallet(user.id, token, address, 31339, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("protects accounts without a password login", async () => {
      readsByTable!.set(users, [[{ ...user, passwordHash: null }]]);
      await expect(service.unlinkWallet(user.id, token, address, 31339, "password")).rejects.toBeInstanceOf(ConflictException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("rejects a revoked session even when password is correct", async () => {
      readsByTable!.set(authSessions, [[]]);
      await expect(service.unlinkWallet(user.id, token, address, 31339, "password")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(database.delete).not.toHaveBeenCalled();
    });
    it.each(["FROZEN", "APPROVED"])("blocks a wallet pinned to an Campaign %s commitment", async status => {
      readsByTable!.set(campaigns, [[{ id: "campaign", status }]]);
      await expect(service.unlinkWallet(user.id, token, address, 31339, "password")).rejects.toThrow("cam kết Campaign đã khóa");
      expect(database.delete).not.toHaveBeenCalled();
    });
    it("removes an unused link and invalidates other sessions and pending challenges", async () => {
      const result = await service.unlinkWallet(user.id, token, address, 31339, "password");
      expect(result.userId).toBe(user.id);
      expect(result.wallets).toEqual([]);
      expect(database.delete).toHaveBeenCalledTimes(3);
    });
    it("retries safely when the scoped wallet link is absent", async () => {
      readsByTable!.set(walletLinks, [[], []]);
      await expect(service.unlinkWallet(user.id, token, address, 31339, "password")).resolves.toMatchObject({ userId: user.id });
      expect(database.delete).not.toHaveBeenCalled();
    });
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

  describe("wallet availability", () => {
    const address = `0x${"1".repeat(40)}`;

    it("allows an unlinked wallet without revealing another account", async () => {
      readsByTable = new Map([[walletLinks, [[]]]]);

      await expect(service.walletAvailability(user.id, address, 31339)).resolves.toEqual({
        canLink: true,
        alreadyLinked: false,
      });
    });

    it("recognizes a wallet linked to the current account", async () => {
      readsByTable = new Map([[walletLinks, [[{ userId: user.id }]]]]);

      await expect(service.walletAvailability(user.id, address, 31339)).resolves.toEqual({
        canLink: true,
        alreadyLinked: true,
      });
    });

    it("blocks a wallet linked to another account before SIWE", async () => {
      readsByTable = new Map([[walletLinks, [[{ userId: "other-user" }]]]]);

      await expect(service.walletAvailability(user.id, address, 31339)).resolves.toEqual({
        canLink: false,
        alreadyLinked: false,
      });
    });
  });
});
