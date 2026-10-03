import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { SiweMessage } from "siwe";
import { DRIZZLE_DB } from "../../database/database.constants";
import * as schema from "../../database/schema";
import {
  authChallenges,
  authSessions,
  users,
  walletLinks,
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

  async register(email: string, password: string) {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const [user] = await this.database
      .insert(users)
      .values({ email: email.trim().toLowerCase(), passwordHash })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (!user) throw new ConflictException("Email is already registered");
    return this.createSession(user.id);
  }

  async login(email: string, password: string) {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    if (!user?.passwordHash) {
      // Keep a comparable password-work cost for unknown and existing emails.
      await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      throw new UnauthorizedException("Email or password is incorrect");
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Email or password is incorrect");
    }
    return this.createSession(user.id);
  }

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

  async verifySiwe(message: string, signature: string) {
    const { address, chainId } = await this.verifyWalletMessage(
      message,
      signature,
    );
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
    if (!link)
      throw new UnauthorizedException(
        "Register an account and link this wallet before using wallet login",
      );
    return this.createSession(link.userId);
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

  private async createSession(userId: string) {
    const token = randomBytes(32).toString("hex");
    await this.database
      .insert(authSessions)
      .values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });
    return { token, account: await this.getAccount(userId) };
  }

  private async getAccount(userId: string) {
    const [user] = await this.database
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new UnauthorizedException("Account no longer exists");
    const wallets = await this.database
      .select({ address: walletLinks.address, chainId: walletLinks.chainId })
      .from(walletLinks)
      .where(eq(walletLinks.userId, userId));
    return {
      userId: user.id,
      email: user.email,
      wallets: wallets.map((wallet) => ({
        address: wallet.address,
        chainId: Number(wallet.chainId),
      })),
    };
  }
}
