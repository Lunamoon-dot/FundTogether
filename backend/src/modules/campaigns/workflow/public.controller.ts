import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../../auth/auth.guard";
import { CampaignWorkflowService } from "./campaign.service";
import { HISTORICAL_TRANSACTION_ACTIONS } from "../../../indexer/historical-campaign-indexer.service";

const syncCampaignReceiptSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  campaignId: z.string().uuid(),
  action: z.enum(HISTORICAL_TRANSACTION_ACTIONS),
});

@Controller("v1/fundtogether/public")
export class PublicController {
  constructor(private readonly campaignService: CampaignWorkflowService) {}

  @Get("campaigns")
  listPublicCampaigns() {
    return this.campaignService.listPublic();
  }

  @Get("campaigns/:id")
  getPublicCampaign(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.campaignService.getById(id);
  }

  @Post("sync-receipt")
  @UseGuards(AuthGuard)
  syncReceipt(@Body() body: unknown, @Req() req: Request) {
    const parsed = syncCampaignReceiptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "A transaction hash, campaign and action are required", issues: parsed.error.issues });
    }
    return this.campaignService.syncReceipt(parsed.data.txHash, parsed.data.campaignId, parsed.data.action, req.account!.userId);
  }

}

