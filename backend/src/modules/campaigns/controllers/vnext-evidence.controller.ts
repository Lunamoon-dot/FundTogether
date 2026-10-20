import { Body, Controller, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { EvidenceUploadFile, MAX_EVIDENCE_FILE_BYTES } from "../../evidence/evidence-file-validation";
import { VNextEvidenceService } from "../services/vnext-evidence.service";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox" };

@Controller("v1/fundtogether/vnext/reviews")
@UseGuards(AuthGuard)
export class VNextEvidenceController {
  constructor(private readonly evidence: VNextEvidenceService) {}

  @Get(":reviewCaseId/evidence")
  list(@Param("reviewCaseId") reviewCaseId: string, @Req() request: Request) {
    return this.evidence.list(reviewCaseId, request.account!);
  }

  @Post(":reviewCaseId/evidence")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 1, fieldSize: 20000 } }))
  upload(@Param("reviewCaseId") reviewCaseId: string, @Req() request: Request, @Body() body: unknown, @UploadedFile() file?: EvidenceUploadFile) {
    return this.evidence.upload(reviewCaseId, request.account!, body, file);
  }

  @Post(":reviewCaseId/evidence/:evidenceHash/ticket")
  ticket(@Param("reviewCaseId") reviewCaseId: string, @Param("evidenceHash") evidenceHash: string, @Req() request: Request) {
    return this.evidence.issueTicket(reviewCaseId, evidenceHash, request.account!);
  }

  @Get("evidence-downloads/:token")
  async download(@Param("token") token: string, @Req() request: Request, @Res() response: Response) {
    const file = await this.evidence.downloadTicket(token, request.account!);
    response.set({ ...privateHeaders, "Content-Type": file.mediaType, "Content-Disposition": "attachment; filename=vnext-evidence" }).send(file.bytes);
  }
}
