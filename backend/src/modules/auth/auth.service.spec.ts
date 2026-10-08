import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";

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
