import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardEditionsIndexerService } from "./reward-editions-indexer.service";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";

const editionsTransactionActionSchema = z.enum([
  "approveCampaign", "createCampaign", "pledge", "submitProduction", "submitRelease",
  "reviewProduction", "reviewRelease", "challengeRelease", "resolveChallenge",
  "finalizeFunding", "startRefunds", "claimRefund", "payout", "cancelCampaign",
]);
const editionsSyncReceiptSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  campaignId: z.string().uuid(),
  action: editionsTransactionActionSchema,
}).strict();

@Controller("v1/reward/editions")
export class RewardEditionsChainController {
  constructor(private readonly indexer: RewardEditionsIndexerService, private readonly publication: RewardEditionsPublicationService) {}

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
    const parsed = editionsSyncReceiptSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("An Editions transaction hash, campaign and action are required");
    return this.indexer.processExpectedReceipt({ ...parsed.data, userId: req.account!.userId });
  }
}
