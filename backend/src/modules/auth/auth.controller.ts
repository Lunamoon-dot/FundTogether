import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { z } from "zod";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

const verifyBodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[\da-fA-F]+$/),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get("nonce")
  nonce() {
    return { nonce: this.authService.createNonce() };
  }

  @Post("verify")
  @HttpCode(200)
  async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = verifyBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const input = parsed.data;
    const session = await this.authService.verifySiwe(
      input.message,
      input.signature,
    );
    response.cookie("ft_session", session.token, {
      httpOnly: true,
      secure: this.configService.get<string>("nodeEnv") === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return {
      userId: session.userId,
      address: session.address,
      chainId: session.chainId,
    };
  }

  @Get("session")
  @UseGuards(AuthGuard)
  session(@Req() request: Request) {
    return request.wallet;
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie("ft_session", { path: "/" });
  }
}
