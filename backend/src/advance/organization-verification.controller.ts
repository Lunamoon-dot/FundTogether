import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { OrganizationVerificationService } from "./organization-verification.service";

@Controller("v1/advance/internal/organizations")
@UseGuards(AuthGuard)
export class OrganizationVerificationController {
  constructor(private readonly verification: OrganizationVerificationService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  queue(@Req() req: Request) { return this.verification.queue(req.account!.userId); }
  @Get(":id/verifications")
  @Header("Cache-Control", "private, no-store")
  history(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.verification.history(id, req.account!.userId);
  }
  @Post(":id/verifications")
  @Header("Cache-Control", "no-store")
  record(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() input: unknown) {
    return this.verification.record(id, req.account!.userId, input);
  }
}
