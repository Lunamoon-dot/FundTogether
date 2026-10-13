import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardPledgeService } from "./reward-pledge.service";
import {
  claimRewardRefundSchema,
  notifyRewardPledgeSchema,
  openRewardDisputeSchema,
} from "./reward-pledge.schema";

@Controller("v1/reward/backer")
@UseGuards(AuthGuard)
export class RewardBackerController {
  constructor(private readonly pledgeService: RewardPledgeService) {}

  @Post("notify-pledge")
  notifyPledge(@Body() body: unknown, @Req() req: Request) {
    const parsed = notifyRewardPledgeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid notify pledge payload", issues: parsed.error.issues });
    }
    return this.pledgeService.notifyPledge(req.account!.userId, parsed.data);
  }

  @Post("claim-refund")
  claimRefund(@Body() body: unknown, @Req() req: Request) {
    const parsed = claimRewardRefundSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid claim refund payload", issues: parsed.error.issues });
    }
    return this.pledgeService.claimRefund(req.account!.userId, parsed.data);
  }

  @Get("entitlements")
  listMyEntitlements(@Req() req: Request) {
    return this.pledgeService.listMyEntitlements(req.account!.userId);
  }

  @Post("entitlements/:id/dispute")
  openDispute(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = openRewardDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid dispute payload", issues: parsed.error.issues });
    }
    return this.pledgeService.openDispute(req.account!.userId, id, parsed.data);
  }
}

