import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { readSessionCookie, sessionCookieName } from "./auth-cookie";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService = new ConfigService(),
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionCookie(request.headers.cookie, sessionCookieName(this.configService));
    if (!token) throw new UnauthorizedException("Authentication required");

    request.account = await this.authService.verifySession(token);
    request.sessionToken = token;
    return true;
  }
}
