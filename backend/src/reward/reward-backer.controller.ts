import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardPledgeService } from "./reward-pledge.service";
import {
  notifyRewardPledgeSchema,
  openRewardDisputeSchema,
  updateShippingAddressSchema,
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

  @Get("entitlements")
  listMyEntitlements(@Req() req: Request) {
    return this.pledgeService.listMyEntitlements(req.account!.userId);
  }

  @Post("entitlements/:id/shipping")
  updateShipping(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = updateShippingAddressSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid shipping payload", issues: parsed.error.issues });
    }
    return this.pledgeService.updateShipping(req.account!.userId, id, parsed.data);
  }

  @Get("entitlements/:id/shipping")
  getDecryptedShipping(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.pledgeService.getDecryptedShipping(req.account!.userId, id);
  }

  @Post("entitlements/:id/confirm")
  confirmDelivery(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.pledgeService.confirmDelivery(req.account!.userId, id);
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
