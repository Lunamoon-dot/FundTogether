import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class BrowserOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    if (
      request.headers.origin !== this.config.getOrThrow<string>("webOrigin")
    ) {
      throw new ForbiddenException("Request Origin must match the application");
    }
    return true;
  }
}
