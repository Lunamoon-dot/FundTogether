import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { MAX_EVIDENCE_FILES, MAX_EVIDENCE_FILE_BYTES, EvidenceUploadFile } from "../../evidence/evidence-file-validation";
import { CompletionService } from "../services/completion.service";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox",
};

@Controller("v1/fundtogether")
@UseGuards(AuthGuard)
export class CompletionController {
  constructor(private readonly completion: CompletionService) {}

  @Post("campaigns/:id/completion-requests")
  @UseInterceptors(FilesInterceptor("files", MAX_EVIDENCE_FILES, {
    limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: MAX_EVIDENCE_FILES, fields: 3, fieldSize: 30000 },
  }))
  create(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Body() body: unknown,
    @UploadedFiles() files?: EvidenceUploadFile[],
  ) {
    return this.completion.create(id, req.account!.userId, body, files);
  }

  @Get("campaigns/:id/completion-requests")
  list(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.completion.list(id, req.account!.userId);
  }

  @Get("campaigns/:id/completion-requests/:requestId/files/:fileId")
  async file(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const file = await this.completion.readFile(id, requestId, fileId, req.account!.userId);
    res.set({ ...privateHeaders, "Content-Type": file.mediaType, "Content-Disposition": `attachment; filename="${file.originalName.replace(/["\\]/g, "_")}"` }).send(file.bytes);
  }

  @Post("completion-requests/:requestId/decisions")
  prepareDecision(@Param("requestId", new ParseUUIDPipe()) requestId: string, @Req() req: Request, @Body() body: unknown) {
    return this.completion.prepareDecision(requestId, req.account!.userId, body);
  }

  @Get("campaigns/:id/surplus-claims")
  listClaims(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.completion.listClaims(id, req.account!.userId);
  }
}
