import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../../auth/auth.guard";
import { CampaignIndexerService } from "../../../indexer/campaign-indexer.service";
import { PublicationService } from "../services/publication.service";

const campaignTransactionActionSchema = z.enum([
  "approveCampaign", "createCampaign", "pledge", "submitProduction", "submitRelease",
  "reviewProduction", "confirmCampaignCompletion", "reviewRelease", "challengeRelease", "resolveChallenge",
  "finalizeFunding", "startRefunds", "claimRefund", "requestCompletion", "approveCompletion", "rejectCompletion", "claimSurplus", "cancelCampaign",
  "requestDisbursement", "approveDisbursement", "rejectDisbursement",
]);
const syncReceiptSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  campaignId: z.string().uuid(),
  action: campaignTransactionActionSchema,
}).strict();

@Controller("v1/fundtogether/campaigns")
export class ChainController {
  constructor(private readonly indexer: CampaignIndexerService, private readonly publication: PublicationService) {}

  @Get("deployment")
  deployment() { return this.indexer.deployment(); }

  @Get("campaigns/:id/chain")
  chain(@Param("id", new ParseUUIDPipe()) id: string) { return this.publication.chainCampaign(id); }

  @Get("campaigns/:id/publication-terms")
  @UseGuards(AuthGuard)
  terms(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) { return this.publication.terms(id, req.account!.userId); }

  @Get("operations/creator")
  @UseGuards(AuthGuard)
  creatorOperations(@Req() req: Request) { return this.publication.operations("creator", req.account!.userId); }

  @Get("operations/resolver")
  @UseGuards(AuthGuard)
  resolverOperations(@Req() req: Request) { return this.publication.operations("resolver", req.account!.userId); }

  @Get("operations/admin")
  @UseGuards(AuthGuard)
  adminOperations(@Req() req: Request) { return this.publication.operations("admin", req.account!.userId); }

  @Post("sync-receipt")
  @UseGuards(AuthGuard)
  sync(@Body() body: unknown, @Req() req: Request) {
    const parsed = syncReceiptSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("An Campaign transaction hash, campaign and action are required");
    return this.indexer.processExpectedReceipt({ ...parsed.data, userId: req.account!.userId });
  }
}
