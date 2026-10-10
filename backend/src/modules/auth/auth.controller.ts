import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Request, Response } from "express";
import { z } from "zod";
import { AuthGuard } from "./auth.guard";
import { AuthService, SESSION_TTL_MS } from "./auth.service";
import { readSessionCookie, sessionCookieName } from "./auth-cookie";

const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
const verifyBodySchema = z
  .object({
    message: z.string().min(1).max(4096),
    signature: z
      .string()
      .regex(/^0x[\da-fA-F]+$/)
      .max(2048),
  })
  .strict();

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = this.parse(credentialsSchema, body);
    return this.establishSession(
      await this.authService.register(input.email, input.password),
      request,
      response,
    );
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = this.parse(credentialsSchema, body);
    return this.establishSession(
      await this.authService.login(input.email, input.password),
      request,
      response,
    );
  }

  @Get("nonce")
  @Header("Cache-Control", "no-store")
  nonce() {
    return this.authService.createNonce();
  }

  @Post("verify")
  @HttpCode(200)
  async verify(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = this.parse(verifyBodySchema, body);
    return this.establishSession(
      await this.authService.verifySiwe(input.message, input.signature),
      request,
      response,
    );
  }

  @Post("wallets/nonce")
  @UseGuards(AuthGuard)
  @HttpCode(200)
  walletNonce(@Req() request: Request) {
    return this.authService.createNonce(request.sessionToken!);
  }

  @Post("wallets/link")
  @UseGuards(AuthGuard)
  @HttpCode(200)
  linkWallet(@Body() body: unknown, @Req() request: Request) {
    const input = this.parse(verifyBodySchema, body);
    return this.authService.linkWallet(
      request.account!.userId,
      request.sessionToken!,
      input.message,
      input.signature,
    );
  }

  @Get("session")
  @Header("Cache-Control", "no-store")
  @UseGuards(AuthGuard)
  session(@Req() request: Request) {
    return request.account;
  }

  @Post("wallets/unlink")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @UseGuards(AuthGuard)
  unlinkWallet(@Body() body: unknown, @Req() request: Request) {
    const input = this.parse(z.object({
      address: z.string().regex(/^0x[\da-fA-F]{40}$/),
      chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      password: z.string().min(1).max(128),
    }).strict(), body);
    return this.authService.unlinkWallet(request.account!.userId, request.sessionToken!, input.address, input.chainId, input.password);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.revokeSession(this.cookieToken(request));
    response.clearCookie(sessionCookieName(this.configService), this.cookieOptions());
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return parsed.data;
  }

  private async establishSession(
    session: Awaited<ReturnType<AuthService["login"]>>,
    request: Request,
    response: Response,
  ) {
    await this.authService.revokeSession(this.cookieToken(request));
    response.cookie(sessionCookieName(this.configService), session.token, {
      ...this.cookieOptions(),
      maxAge: SESSION_TTL_MS,
    });
    return session.account;
  }

  private cookieToken(request: Request) {
    return readSessionCookie(request.headers.cookie, sessionCookieName(this.configService));
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>("nodeEnv") === "production",
      sameSite: "lax" as const,
      path: "/",
    };
  }
}
