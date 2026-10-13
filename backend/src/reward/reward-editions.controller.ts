import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { MAX_EVIDENCE_FILE_BYTES, EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { assertEmptyRewardBody } from "./reward-campaign.schema";
import { RewardEditionsService } from "./reward-editions.service";

@Controller("v1/reward/editions")
@UseGuards(AuthGuard)
export class RewardEditionsController {
  constructor(private readonly editions: RewardEditionsService) {}

  @Get("wallets")
  wallets(@Req() req: Request) { return this.editions.linkedWallets(req.account!.userId); }

  @Patch("campaigns/:id")
  update(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.editions.update(id, req.account!.userId, body);
  }

  @Post("campaigns/:id/samples")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 0 } }))
  upload(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @UploadedFile() file: EvidenceUploadFile | undefined, @Body() body: unknown) {
    assertEmptyRewardBody(body);
    return this.editions.uploadSample(id, req.account!.userId, file);
  }

  @Get("campaigns/:id/samples")
  samples(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) { return this.editions.listSamples(id, req.account!.userId); }

  @Get("campaigns/:id/samples/:sampleId")
  async sample(@Param("id", new ParseUUIDPipe()) id: string, @Param("sampleId", new ParseUUIDPipe()) sampleId: string,
    @Req() req: Request, @Res() res: Response) {
    const file = await this.editions.readSample(id, sampleId, req.account!.userId);
    res.set({ "Content-Type": file.mediaType, "Content-Disposition": "attachment; filename=sample",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(file.bytes);
  }

  @Post("campaigns/:id/freeze")
  freeze(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) { return this.editions.freeze(id, req.account!.userId, body); }

  @Post("campaigns/:id/submit-review")
  submit(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) { return this.editions.submit(id, req.account!.userId, body); }

  @Post("campaigns/:id/review")
  review(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) { return this.editions.review(id, req.account!.userId, body); }
}

@Controller("v1/reward/public/editions")
export class RewardEditionsPreviewController {
  constructor(private readonly editions: RewardEditionsService) {}

  @Get()
  list() { return this.editions.publicList(); }

  @Get(":id")
  preview(@Param("id", new ParseUUIDPipe()) id: string) { return this.editions.publicPreview(id); }
}
