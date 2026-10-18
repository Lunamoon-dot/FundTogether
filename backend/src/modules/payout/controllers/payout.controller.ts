import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { MAX_EVIDENCE_FILES, MAX_EVIDENCE_FILE_BYTES, EvidenceUploadFile } from "../../evidence/evidence-file-validation";
import { PayoutService } from "../services/payout.service";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox",
};

@Controller("v1/fundtogether")
@UseGuards(AuthGuard)
export class PayoutController {
  constructor(private readonly payout: PayoutService) {}

  @Post("campaigns/:id/payout-requests")
  @UseInterceptors(FileFieldsInterceptor([
    { name: "explanationFiles", maxCount: MAX_EVIDENCE_FILES },
    { name: "evidenceFiles", maxCount: MAX_EVIDENCE_FILES },
  ], {
    limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: MAX_EVIDENCE_FILES * 2, fields: 5, fieldSize: 30000 },
  }))
  create(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Body() body: unknown,
    @UploadedFiles() files?: { explanationFiles?: EvidenceUploadFile[]; evidenceFiles?: EvidenceUploadFile[] },
  ) {
    return this.payout.create(id, req.account!.userId, body, files);
  }

  @Get("campaigns/:id/payout-requests")
  list(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.payout.list(id, req.account!.userId);
  }

  @Get("campaigns/:id/payout-requests/:requestId/files/:fileId")
  async file(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const file = await this.payout.readFile(id, requestId, fileId, req.account!.userId);
    res.set({ ...privateHeaders, "Content-Type": file.mediaType, "Content-Disposition": `attachment; filename="${file.originalName.replace(/["\\]/g, "_")}"` }).send(file.bytes);
  }

  @Post("payout-requests/:requestId/decisions")
  prepareDecision(@Param("requestId", new ParseUUIDPipe()) requestId: string, @Req() req: Request, @Body() body: unknown) {
    return this.payout.prepareDecision(requestId, req.account!.userId, body);
  }
}
