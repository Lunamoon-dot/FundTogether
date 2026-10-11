import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedRequestDraftSchema } from "./hed-request-draft.schema";
import { HedRequestDraftService } from "./hed-request-draft.service";
import { MAX_EVIDENCE_FILE_BYTES } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";

@Controller("v1/disbursement/campaigns/:campaignId/requests")
@UseGuards(AuthGuard)
export class HedRequestDraftController {
  constructor(private readonly requests: HedRequestDraftService) {}

  @Get()
  list(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.requests.list(campaignId, request.account!.userId);
  }

  @Post()
  create(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedRequestDraftSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "HED payment request is incomplete or invalid", issues: parsed.error.issues });
    return this.requests.create(campaignId, request.account!.userId, parsed.data);
  }

  @Post(":requestId/evidence")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 64 } }))
  upload(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Body("kind") kind: unknown, @UploadedFile() file: EvidenceUploadFile | undefined, @Req() request: Request) {
    if (kind !== "QUOTE" && kind !== "NEED" && kind !== "TERMS" && kind !== "OTHER") throw new BadRequestException("Invalid HED request evidence kind");
    return this.requests.uploadEvidence(campaignId, requestId, request.account!.userId, kind, file);
  }

  @Post(":requestId/freeze")
  freeze(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Req() request: Request) {
    return this.requests.freeze(campaignId, requestId, request.account!.userId);
  }
}
