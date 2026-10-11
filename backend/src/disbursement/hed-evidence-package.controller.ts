import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Request } from "express";
import type { Response } from "express";
import { Readable } from "node:stream";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { MAX_EVIDENCE_FILE_BYTES } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { hedEvidencePackageSchema } from "./hed-evidence-package.schema";
import { HedEvidencePackageService } from "./hed-evidence-package.service";

@Controller("v1/disbursement/campaigns/:campaignId/evidence")
@UseGuards(AuthGuard)
export class HedEvidencePackageController {
  constructor(private readonly evidence: HedEvidencePackageService) {}
  @Get() list(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) { return this.evidence.list(campaignId, request.account!.userId); }
  @Get("documents/:documentId") async download(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Param("documentId", new ParseUUIDPipe()) documentId: string,
    @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { document, body } = await this.evidence.download(campaignId, request.account!.userId, documentId);
    response.setHeader("Cache-Control", "private, no-store"); response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(body as Readable, { type: "application/octet-stream", length: document.byteSize,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}` });
  }
  @Post("upload") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 4, parts: 5, fieldSize: 64 } }))
  upload(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Body("kind") kind: unknown, @Body("activityId") activityId: unknown, @Body("requestDraftId") requestDraftId: unknown, @Body("visibility") visibility: unknown, @UploadedFile() file: EvidenceUploadFile | undefined, @Req() request: Request) {
    if ((kind !== "DELIVERY" && kind !== "OUTCOME") || typeof activityId !== "string" || (visibility !== "PRIVATE" && visibility !== "PUBLIC")) throw new BadRequestException("Invalid HED evidence scope");
    return this.evidence.upload(campaignId, request.account!.userId, kind, activityId, typeof requestDraftId === "string" ? requestDraftId : undefined, visibility, file);
  }
  @Post() create(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedEvidencePackageSchema.safeParse(body); if (!parsed.success) throw new BadRequestException({ message: "Invalid HED evidence package", issues: parsed.error.issues });
    return this.evidence.create(campaignId, request.account!.userId, parsed.data);
  }
}
