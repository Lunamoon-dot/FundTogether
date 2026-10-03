import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const cookie = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("ft_session="));
    const token = cookie?.slice("ft_session=".length);
    if (!token) throw new UnauthorizedException("Authentication required");

    request.account = await this.authService.verifySession(token);
    request.sessionToken = token;
    return true;
  }
}
