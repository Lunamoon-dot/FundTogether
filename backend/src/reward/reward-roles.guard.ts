import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class RewardAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const account = request.account;
    if (!account) {
      throw new UnauthorizedException("Authentication required");
    }
    if (!account.roles || !account.roles.includes("ADMIN")) {
      throw new ForbiddenException("ADMIN platform role required for this operation");
    }
    return true;
  }
}

@Injectable()
export class RewardResolverGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const account = request.account;
    if (!account) {
      throw new UnauthorizedException("Authentication required");
    }
    if (!account.roles || !account.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required for this operation");
    }
    return true;
  }
}
