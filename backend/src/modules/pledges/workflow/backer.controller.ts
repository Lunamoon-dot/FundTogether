import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { PledgeService } from "./pledge.service";
import {
  claimRefundSchema,
  notifyPledgeSchema,
  openDisputeSchema,
} from "../schemas/pledge.schema";

@Controller("v1/fundtogether/backer")
@UseGuards(AuthGuard)
export class BackerController {
  constructor(private readonly pledgeService: PledgeService) {}

  @Post("notify-pledge")
  notifyPledge(@Body() body: unknown, @Req() req: Request) {
    const parsed = notifyPledgeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid notify pledge payload", issues: parsed.error.issues });
    }
    return this.pledgeService.notifyPledge(req.account!.userId, parsed.data);
  }

  @Post("claim-refund")
  claimRefund(@Body() body: unknown, @Req() req: Request) {
    const parsed = claimRefundSchema.safeParse(body);
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
    const parsed = openDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid dispute payload", issues: parsed.error.issues });
    }
    return this.pledgeService.openDispute(req.account!.userId, id, parsed.data);
  }
}

