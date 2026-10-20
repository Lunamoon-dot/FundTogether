import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { ResolverGuard } from "../../auth/roles.guard";
import { CampaignWorkflowService } from "./campaign.service";
import { PledgeService } from "../../pledges/workflow/pledge.service";
import {
  resolverActivateCampaignSchema,
  resolverVerifyProductionSchema,
} from "../schemas/campaign.schema";
import { resolveDisputeSchema } from "../../pledges/schemas/pledge.schema";

@Controller("v1/fundtogether/resolver")
@UseGuards(AuthGuard, ResolverGuard)
export class ResolverController {
  constructor(
    private readonly campaigns: CampaignWorkflowService,
    private readonly pledges: PledgeService,
  ) {}

  @Get("campaigns")
  listCampaigns() {
    return this.campaigns.listAllForResolver();
  }

  @Get("disputes")
  listDisputes() {
    return this.pledges.listDisputesForResolver();
  }

  @Post("campaigns/:id/activate")
  activateCampaign(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolverActivateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid campaign lifecycle activation payload", issues: parsed.error.issues });
    }
    return this.campaigns.activateCampaignOnchain(req.account!.userId, id, parsed.data.txHash);
  }

  @Post("campaigns/:id/production-verified")
  verifyProduction(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolverVerifyProductionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid production verification payload", issues: parsed.error.issues });
    }
    return this.campaigns.recordProductionVerifiedOnchain(req.account!.userId, id, parsed.data.txHash);
  }

  @Post("disputes/:id/resolve")
  resolveDispute(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolveDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid dispute resolution payload", issues: parsed.error.issues });
    }
    return this.pledges.resolveDispute(req.account!.userId, id, parsed.data);
  }

}
