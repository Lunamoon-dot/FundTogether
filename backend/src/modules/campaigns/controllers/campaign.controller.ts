import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { MAX_EVIDENCE_FILE_BYTES, EvidenceUploadFile } from "../../evidence/evidence-file-validation";
import { assertEmptyBody } from "../schemas/campaign.schema";
import { PublicationService } from "../services/publication.service";
import { CampaignService } from "../services/campaign.service";

@Controller("v1/fundtogether/campaigns")
@UseGuards(AuthGuard)
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Get("wallets")
  wallets(@Req() req: Request) { return this.campaigns.linkedWallets(req.account!.userId); }

  @Get("wallets/transaction")
  transactionWallets(@Req() req: Request) { return this.campaigns.transactionWallets(req.account!.userId); }

  @Patch("campaigns/:id")
  update(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.campaigns.update(id, req.account!.userId, body);
  }

  @Post("campaigns/:id/samples")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 0 } }))
  upload(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @UploadedFile() file: EvidenceUploadFile | undefined, @Body() body: unknown) {
    assertEmptyBody(body);
    return this.campaigns.uploadSample(id, req.account!.userId, file);
  }

  @Get("campaigns/:id/samples")
  samples(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) { return this.campaigns.listSamples(id, req.account!.userId); }

  @Get("campaigns/:id/samples/:sampleId")
  async sample(@Param("id", new ParseUUIDPipe()) id: string, @Param("sampleId", new ParseUUIDPipe()) sampleId: string,
    @Req() req: Request, @Res() res: Response) {
    const file = await this.campaigns.readSample(id, sampleId, req.account!.userId);
    res.set({ "Content-Type": file.mediaType, "Content-Disposition": "attachment; filename=sample",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(file.bytes);
  }

  @Post("campaigns/:id/freeze")
  freeze(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) { return this.campaigns.freeze(id, req.account!.userId, body); }

  @Post("campaigns/:id/submit-review")
  submit(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) { return this.campaigns.submit(id, req.account!.userId, body); }

}

@Controller("v1/fundtogether/public/campaigns")
export class CampaignPreviewController {
  private static readonly FUNDED_CHAIN_STATES = new Set([1, 2, 3, 5]);

  constructor(private readonly campaigns: CampaignService, private readonly publication: PublicationService) {}

  private async withSurface(id: string) {
    const item = await this.campaigns.publicPreview(id);
    if (item.status === "COMMUNITY_REVIEW") return { ...item, surface: "REVIEW" as const };
    const [states, orphaned] = await Promise.all([
      this.publication.canonicalCampaignStates(),
      this.publication.orphanedCampaignIds(),
    ]);
    const chainState = states.get(id);
    return { ...item, chainState, surface: chainState === 0
      ? "FUNDING" as const
      : CampaignPreviewController.FUNDED_CHAIN_STATES.has(chainState ?? -1)
        ? "FUNDED" as const
        : orphaned.has(id) ? "ORPHANED" as const : "ACTIVATION_PENDING" as const };
  }

  @Get()
  list() { return this.fundingList(); }

  @Get("review")
  async review() {
    return (await this.campaigns.publicList("COMMUNITY_REVIEW")).map(item => ({ ...item, surface: "REVIEW" as const }));
  }

  @Get("activation")
  async activation() {
    const [items, states, orphaned] = await Promise.all([
      this.campaigns.publicList(["APPROVED", "PUBLISHED"]),
      this.publication.canonicalCampaignStates(),
      this.publication.orphanedCampaignIds(),
    ]);
    return items.filter(item => !states.has(item.id) && !orphaned.has(item.id))
      .map(item => ({ ...item, surface: "ACTIVATION_PENDING" as const }));
  }

  @Get("orphaned")
  async orphaned() {
    const [items, states, orphaned] = await Promise.all([
      this.campaigns.publicList(["APPROVED", "PUBLISHED"]),
      this.publication.canonicalCampaignStates(),
      this.publication.orphanedCampaignIds(),
    ]);
    return items.filter(item => !states.has(item.id) && orphaned.has(item.id))
      .map(item => ({ ...item, surface: "ORPHANED" as const }));
  }

  @Get("funded")
  async funded() {
    const [items, states] = await Promise.all([this.campaigns.publicList(["APPROVED", "PUBLISHED"]), this.publication.canonicalCampaignStates()]);
    return items
      .map(item => ({ item, chainState: states.get(item.id) }))
      .filter(({ chainState }) => CampaignPreviewController.FUNDED_CHAIN_STATES.has(chainState ?? -1))
      .map(({ item, chainState }) => ({ ...item, surface: "FUNDED" as const, chainState }));
  }

  @Get("funding")
  async fundingList() {
    const [items, states] = await Promise.all([this.campaigns.publicList(["APPROVED", "PUBLISHED"]), this.publication.canonicalCampaignStates()]);
    return items
      .map(item => ({ item, chainState: states.get(item.id) }))
      .filter(({ chainState }) => chainState === 0)
      .map(({ item, chainState }) => ({ ...item, surface: "FUNDING" as const, chainState }));
  }

  @Get(":id")
  preview(@Param("id", new ParseUUIDPipe()) id: string) { return this.withSurface(id); }
}
