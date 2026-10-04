import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get,
  Injectable, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile,
  UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes } from "@nestjs/swagger";
import { Request, Response } from "express";
import { Readable } from "node:stream";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceAccessService } from "./evidence-access.service";
import { EvidenceFilesService, EvidenceUploadFile, MAX_EVIDENCE_FILE_BYTES } from "./evidence-files.service";

const uploadSchema = z.object({
  expectedRevision: z.coerce.number().int().positive(),
  kind: z.enum(["REPORT", "INVOICE", "RECEIPT", "PAYMENT_PROOF", "DELIVERY_RECORD", "PHOTO", "OTHER"]),
}).strict();

function milestoneIndex(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new BadRequestException("Invalid milestone index");
  return value;
}

@Injectable()
export class EvidenceFileAccessGuard implements CanActivate {
  constructor(private readonly access: EvidenceAccessService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const id = z.uuid().safeParse(request.params.campaignId);
    if (!id.success) throw new BadRequestException("Invalid campaign ID");
    milestoneIndex(String(request.params.milestoneIndex));
    await this.access.assertCampaignOrganizer(id.data, request.account!.userId);
    return true;
  }
}

@Controller("campaigns/:campaignId/milestones/:milestoneIndex/evidence-draft/documents")
@UseGuards(AuthGuard, EvidenceFileAccessGuard)
export class EvidenceFilesController {
  constructor(private readonly files: EvidenceFilesService) {}

  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["file", "kind", "expectedRevision"], properties: {
    file: { type: "string", format: "binary" }, kind: { type: "string" }, expectedRevision: { type: "integer" },
  } } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 1024 } }))
  upload(@Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Param("milestoneIndex") index: string, @Body() body: unknown,
    @UploadedFile() file: EvidenceUploadFile | undefined, @Req() request: Request) {
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Upload requires kind and expectedRevision");
    return this.files.upload(campaignId, milestoneIndex(index), request.account!.userId,
      parsed.data.expectedRevision, parsed.data.kind, file);
  }

  @Get(":documentId")
  async download(@Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Param("milestoneIndex") index: string, @Param("documentId", new ParseUUIDPipe()) documentId: string,
    @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { document, body } = await this.files.download(campaignId, milestoneIndex(index), request.account!.userId, documentId);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(body as Readable, {
      type: "application/octet-stream", length: document.byteSize,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
    });
  }
}
