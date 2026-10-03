import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { SiweMessage } from "siwe";
import { DRIZZLE_DB } from "../../database/database.constants";
import { users, walletLinks } from "../../database/schema/users.schema";
import * as schema from "../../database/schema";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 60 * 60 * 24;

@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
  ) {}

  createNonce(): string {
    const nonce = randomBytes(16).toString("hex");
    this.challenges.set(nonce, Date.now() + CHALLENGE_TTL_MS);
    this.removeExpiredChallenges();
    return nonce;
  }

  async verifySiwe(message: string, signature: string) {
    const jwtSecret = this.getJwtSecret();
    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch {
      throw new UnauthorizedException("SIWE message is invalid");
    }
    const nonceExpiry = this.challenges.get(siweMessage.nonce);

    if (!nonceExpiry || nonceExpiry < Date.now()) {
      this.challenges.delete(siweMessage.nonce);
      throw new UnauthorizedException("SIWE nonce is invalid or expired");
    }
    this.challenges.delete(siweMessage.nonce);
    if (siweMessage.chainId !== this.configService.get<number>("authChainId")) {
      throw new UnauthorizedException("Unsupported chain");
    }

    const origin = new URL(this.configService.getOrThrow<string>("webOrigin"));
    if (new URL(siweMessage.uri).origin !== origin.origin) {
      throw new UnauthorizedException(
        "SIWE URI does not match this application",
      );
    }
    const result = await siweMessage.verify(
      {
        signature,
        nonce: siweMessage.nonce,
        domain: this.configService.getOrThrow<string>("authDomain"),
        scheme: origin.protocol.slice(0, -1),
      },
      { suppressExceptions: true },
    );
    if (!result.success) {
      throw new UnauthorizedException("SIWE signature verification failed");
    }

    const address = result.data.address.toLowerCase();
    const chainId = result.data.chainId;
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

    const userId =
      link?.userId ?? (await this.createWalletUser(address, chainId));
    const token = await new SignJWT({ address, chainId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(jwtSecret);

    return { token, address, chainId, userId };
  }

  async verifySession(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.getJwtSecret());
      if (
        typeof payload.sub !== "string" ||
        typeof payload.address !== "string" ||
        typeof payload.chainId !== "number"
      ) {
        throw new Error("Invalid session claims");
      }
      return {
        userId: payload.sub,
        address: payload.address,
        chainId: payload.chainId,
      };
    } catch {
      throw new UnauthorizedException("Session is invalid or expired");
    }
  }

  private async createWalletUser(address: string, chainId: number) {
    return this.database.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({})
        .returning({ id: users.id });
      await tx.insert(walletLinks).values({
        userId: user.id,
        chainId: String(chainId),
        address,
        isPrimary: true,
      });
      return user.id;
    });
  }

  private getJwtSecret() {
    const secret = this.configService.get<string>("authJwtSecret");
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new InternalServerErrorException(
        "AUTH_JWT_SECRET must contain at least 32 bytes",
      );
    }
    return new TextEncoder().encode(secret);
  }

  private removeExpiredChallenges() {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.challenges) {
      if (expiresAt < now) this.challenges.delete(nonce);
    }
  }
}
