import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedOrganizationVerificationContentSchema, hedOrganizationVerificationDecisionSchema } from "./hed-organization-verification.schema";
import { HedOrganizationVerificationService } from "./hed-organization-verification.service";

@Controller("v1/disbursement/organization-verification")
@UseGuards(AuthGuard)
export class HedOrganizationVerificationController {
  constructor(private readonly verification: HedOrganizationVerificationService) {}
  @Get("organizations/:organizationId") list(@Param("organizationId", new ParseUUIDPipe()) id: string, @Req() request: Request) { return this.verification.listForOrganization(id, request.account!.userId); }
  @Post("organizations/:organizationId") save(@Param("organizationId", new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() request: Request) { const parsed = hedOrganizationVerificationContentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.verification.createOrSave(id, request.account!.userId, parsed.data); }
  @Post("requests/:requestId/submit") submit(@Param("requestId", new ParseUUIDPipe()) id: string, @Req() request: Request) { return this.verification.submit(id, request.account!.userId); }
  @Post("requests/:requestId/documents") @UseInterceptors(FileInterceptor("file")) upload(@Param("requestId", new ParseUUIDPipe()) id: string, @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined, @Req() request: Request) { if (!file) throw new BadRequestException("Document file is required"); return this.verification.uploadDocument(id, request.account!.userId, file); }
  @Get("internal/queue") queue(@Req() request: Request) { return this.verification.queue(request.account!.userId); }
  @Post("internal/requests/:requestId/decision") decide(@Param("requestId", new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() request: Request) { const parsed = hedOrganizationVerificationDecisionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.verification.decide(id, request.account!.userId, parsed.data.decision, parsed.data.note, parsed.data.validUntil); }
}
