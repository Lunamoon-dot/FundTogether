import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { EvidenceUploadFile, MAX_EVIDENCE_FILE_BYTES } from "../modules/evidence/evidence-file-validation";
import { assertEmptyRewardBody } from "./reward-campaign.schema";
import { RewardEditionsDeliveryService } from "./reward-editions-delivery.service";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox" };

@Controller("v1/reward/editions")
@UseGuards(AuthGuard)
export class RewardEditionsDeliveryController {
  constructor(private readonly delivery: RewardEditionsDeliveryService) {}

  @Post("campaigns/:id/evidence")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 2, fieldSize: 20000 } }))
  upload(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown, @UploadedFile() file?: EvidenceUploadFile) {
    return this.delivery.upload(id, req.account!.userId, body, file);
  }
  @Get("campaigns/:id/evidence")
  evidence(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) { return this.delivery.listEvidence(id, req.account!.userId); }

  @Get("campaigns/:id/evidence/:evidenceId/file")
  async file(@Param("id", new ParseUUIDPipe()) id: string, @Param("evidenceId", new ParseUUIDPipe()) evidenceId: string, @Req() req: Request, @Res() res: Response) {
    const file = await this.delivery.readEvidence(id, evidenceId, req.account!.userId);
    res.set({ ...privateHeaders, "Content-Type": file.mediaType, "Content-Disposition": "attachment; filename=evidence" }).send(file.bytes);
  }
  @Post("campaigns/:id/feedback")
  feedback(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) { return this.delivery.addFeedback(id, req.account!.userId, body); }

  @Get("campaigns/:id/feedback")
  feedbackList(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) { return this.delivery.feedback(id, req.account!.userId); }

  @Get("entitlements")
  entitlements(@Req() req: Request) { return this.delivery.listEntitlements(req.account!.userId); }

  @Post("entitlements/:id/download")
  async ticket(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    assertEmptyRewardBody(body); res.set(privateHeaders);
    return this.delivery.issueTicket(id, req.account!.userId);
  }
  @Post("entitlements/:id/confirm")
  confirm(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    assertEmptyRewardBody(body); return this.delivery.confirm(id, req.account!.userId);
  }
  @Get("downloads/:token")
  async download(@Param("token") token: string, @Req() req: Request, @Res() res: Response) {
    const bytes = await this.delivery.download(token, req.account!.userId);
    res.set({ ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=edition.pdf" }).send(bytes);
  }
}

@Controller("v1/reward/public/editions")
export class RewardEditionsPublicEvidenceController {
  constructor(private readonly delivery: RewardEditionsDeliveryService) {}

  @Get(":id/evidence")
  evidence(@Param("id", new ParseUUIDPipe()) id: string) { return this.delivery.publicEvidence(id); }
}
