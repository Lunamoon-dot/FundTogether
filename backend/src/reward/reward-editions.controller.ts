import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { MAX_EVIDENCE_FILE_BYTES, EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { assertEmptyRewardBody } from "./reward-campaign.schema";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";
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
  constructor(private readonly editions: RewardEditionsService, private readonly publication: RewardEditionsPublicationService) {}

  private async withSurface(id: string) {
    const item = await this.editions.publicPreview(id);
    if (item.status === "UNDER_REVIEW") return { ...item, surface: "REVIEW" as const };
    const states = await this.publication.canonicalCampaignStates();
    return { ...item, surface: states.get(id) === 0 ? "FUNDING" as const : "ACTIVATION_PENDING" as const };
  }

  @Get()
  list() { return this.fundingList(); }

  @Get("review")
  async review() {
    return (await this.editions.publicList("UNDER_REVIEW")).map(item => ({ ...item, surface: "REVIEW" as const }));
  }

  @Get("activation")
  async activation() {
    const [items, states] = await Promise.all([this.editions.publicList("APPROVED"), this.publication.canonicalCampaignStates()]);
    return items.filter(item => !states.has(item.id)).map(item => ({ ...item, surface: "ACTIVATION_PENDING" as const }));
  }

  @Get("funding")
  async fundingList() {
    const [items, states] = await Promise.all([this.editions.publicList("APPROVED"), this.publication.canonicalCampaignStates()]);
    return items.filter(item => states.get(item.id) === 0).map(item => ({ ...item, surface: "FUNDING" as const }));
  }

  @Get(":id")
  preview(@Param("id", new ParseUUIDPipe()) id: string) { return this.withSurface(id); }
}
