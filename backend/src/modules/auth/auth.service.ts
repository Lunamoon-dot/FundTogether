import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { SiweMessage } from "siwe";
import { DRIZZLE_DB } from "../../database/database.constants";
import * as schema from "../../database/schema";
import {
  authChallenges,
  authSessions,
  platformRoles,
  users,
  walletLinks,
  campaigns,
  creatorProfiles,
} from "../../database/schema";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
  ) {}

  async verifySession(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("Session is invalid or expired");
    const [session] = await this.database
      .select({ userId: authSessions.userId })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.tokenHash, hashToken(token)),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session)
      throw new UnauthorizedException("Session is invalid or expired");
    return this.getAccount(session.userId);
  }

  async revokeSession(token?: string) {
    if (token)
      await this.database
        .delete(authSessions)
        .where(eq(authSessions.tokenHash, hashToken(token)));
  }

  async createNonce(token?: string) {
    await this.database
      .delete(authChallenges)
      .where(lt(authChallenges.expiresAt, new Date()));
    const nonce = randomBytes(16).toString("hex");
    await this.database
      .insert(authChallenges)
      .values({
        nonce,
        sessionHash: token ? hashToken(token) : null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      });
    return {
      nonce,
      chainId: this.configService.getOrThrow<number>("authChainId"),
      domain: this.configService.getOrThrow<string>("authDomain"),
      uri: this.configService.getOrThrow<string>("webOrigin"),
    };
  }

  async walletAvailability(userId: string, address: string, chainId: number) {
    const [link] = await this.database
      .select({ userId: walletLinks.userId })
      .from(walletLinks)
      .where(
        and(
          eq(walletLinks.chainId, String(chainId)),
          eq(walletLinks.address, address.toLowerCase()),
        ),
      )
      .limit(1);
    const alreadyLinked = link?.userId === userId;
    return {
      canLink: !link || alreadyLinked,
      alreadyLinked,
    };
  }

  async linkWallet(
    userId: string,
    token: string,
    message: string,
    signature: string,
  ) {
    const { address, chainId } = await this.verifyWalletMessage(
      message,
      signature,
      token,
    );
    // Conflict handling never reassigns a wallet owned by another account.
    await this.database
      .insert(walletLinks)
      .values({ userId, address, chainId: String(chainId) })
      .onConflictDoNothing();
    const [link] = await this.database
      .select({ userId: walletLinks.userId })
      .from(walletLinks)
      .where(
        and(
          eq(walletLinks.chainId, String(chainId)),
          eq(walletLinks.address, address),
        ),
      )
      .limit(1);
    if (link?.userId !== userId)
      throw new ConflictException(
        "Wallet is already linked to another account",
      );
    return this.getAccount(userId);
  }

  async unlinkWallet(userId: string, token: string, address: string, chainId: number, password: string) {
    await this.database.transaction(async tx => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!user?.email || !user.passwordHash)
        throw new ConflictException("Tài khoản cần có email và mật khẩu trước khi gỡ ví; không thể gỡ phương thức đăng nhập bằng ví theo cách này.");
      if (!(await argon2.verify(user.passwordHash, password)))
        throw new UnauthorizedException("Mật khẩu xác nhận không đúng.");
      const [session] = await tx.select().from(authSessions).where(and(
        eq(authSessions.userId, userId), eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date()),
      )).for("update");
      if (!session) throw new UnauthorizedException("Phiên đăng nhập đã hết hạn. Đăng nhập lại để gỡ ví.");
      const [wallet] = await tx.select().from(walletLinks).where(and(
        eq(walletLinks.userId, userId), eq(walletLinks.address, address.toLowerCase()), eq(walletLinks.chainId, String(chainId)),
      )).for("update");
      // Safe retry after a response was lost; never touch another account's link.
      if (!wallet) return;
      const [campaign] = await tx.select({ id: campaigns.id }).from(campaigns)
        .where(eq(campaigns.payoutWalletLinkId, wallet.id)).limit(1);
      if (campaign) throw new ConflictException("Ví này đang gắn với cam kết Campaign đã khóa; không thể gỡ liên kết.");
      const [studioProfile] = await tx.select({ id: creatorProfiles.id }).from(creatorProfiles)
        .where(eq(creatorProfiles.studioWalletLinkId, wallet.id)).limit(1);
      if (studioProfile) throw new ConflictException("Ví này đang là ví Studio đã xác minh; hãy cập nhật hồ sơ Studio trước khi gỡ liên kết.");
      await tx.delete(walletLinks).where(and(eq(walletLinks.id, wallet.id), eq(walletLinks.userId, userId)));
      // Old authenticated sessions must not retain access after wallet removal.
      await tx.delete(authSessions).where(and(eq(authSessions.userId, userId), ne(authSessions.tokenHash, hashToken(token))));
      await tx.delete(authChallenges).where(eq(authChallenges.sessionHash, hashToken(token)));
    });
    return this.getAccount(userId);
  }

  async verifySiwe(message: string, signature: string) {
    const { address, chainId } = await this.verifyWalletMessage(
      message,
      signature,
    );
    return this.database.transaction(async tx => {
      const [link] = await tx
        .select({ userId: walletLinks.userId })
        .from(walletLinks)
        .where(
          and(
            eq(walletLinks.chainId, String(chainId)),
            eq(walletLinks.address, address),
          ),
        )
        .limit(1)
        .for("share");
      let userId = link?.userId;
      if (!userId) {
        const [createdUser] = await tx
          .insert(users)
          .values({})
          .returning({ id: users.id });
        if (!createdUser) throw new ConflictException("Wallet account could not be created");
        await tx
          .insert(walletLinks)
          .values({
            userId: createdUser.id,
            address,
            chainId: String(chainId),
            isPrimary: true,
          })
          .onConflictDoNothing();
        const [resolvedLink] = await tx
          .select({ userId: walletLinks.userId })
          .from(walletLinks)
          .where(
            and(
              eq(walletLinks.chainId, String(chainId)),
              eq(walletLinks.address, address),
            ),
          )
          .limit(1)
          .for("share");
        if (!resolvedLink) {
          await tx.delete(users).where(eq(users.id, createdUser.id));
          throw new ConflictException("Wallet account could not be linked");
        }
        userId = resolvedLink.userId;
        if (userId !== createdUser.id)
          await tx.delete(users).where(eq(users.id, createdUser.id));
      }
      return this.createSession(userId, tx);
    });
  }

  private async verifyWalletMessage(
    message: string,
    signature: string,
    token?: string,
  ) {
    let siwe: SiweMessage;
    const origin = new URL(this.configService.getOrThrow<string>("webOrigin"));
    try {
      siwe = new SiweMessage(message);
      if (
        new URL(siwe.uri).origin !== origin.origin ||
        siwe.chainId !== this.configService.getOrThrow<number>("authChainId")
      )
        throw new Error("Invalid wallet context");
    } catch {
      throw new UnauthorizedException("SIWE message, URI or chain is invalid");
    }
    // Consume once, atomically; a different session cannot consume this nonce.
    const [challenge] = await this.database
      .delete(authChallenges)
      .where(
        and(
          eq(authChallenges.nonce, siwe.nonce),
          gt(authChallenges.expiresAt, new Date()),
          token
            ? eq(authChallenges.sessionHash, hashToken(token))
            : isNull(authChallenges.sessionHash),
        ),
      )
      .returning();
    if (!challenge)
      throw new UnauthorizedException("SIWE nonce is invalid or expired");
    try {
      const result = await siwe.verify(
        {
          signature,
          nonce: siwe.nonce,
          domain: this.configService.getOrThrow<string>("authDomain"),
          scheme: origin.protocol.slice(0, -1),
        },
        { suppressExceptions: true },
      );
      if (!result.success) throw new Error("Invalid signature");
      return {
        address: result.data.address.toLowerCase(),
        chainId: result.data.chainId,
      };
    } catch {
      throw new UnauthorizedException("SIWE signature verification failed");
    }
  }

  private async createSession(
    userId: string,
    database: Pick<NodePgDatabase<typeof schema>, "insert" | "select"> = this.database,
  ) {
    const token = randomBytes(32).toString("hex");
    await database
      .insert(authSessions)
      .values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });
    return { token, account: await this.getAccount(userId, database) };
  }

  private async getAccount(
    userId: string,
    database: Pick<NodePgDatabase<typeof schema>, "select"> = this.database,
  ) {
    const [user] = await database
      .select({ id: users.id, email: users.email, roles: platformRoles.roles })
      .from(users)
      .leftJoin(platformRoles, eq(platformRoles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException("Account no longer exists");
    const wallets = await database
      .select({ address: walletLinks.address, chainId: walletLinks.chainId })
      .from(walletLinks)
      .where(eq(walletLinks.userId, userId));
    return {
      userId: user.id,
      email: user.email,
      roles: user.roles ?? [],
      wallets: wallets.map((wallet) => ({
        address: wallet.address,
        chainId: Number(wallet.chainId),
      })),
    };
  }
}
