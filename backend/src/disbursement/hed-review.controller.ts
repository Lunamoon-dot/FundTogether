import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedReviewSchema } from "./hed-review.schema";
import { HedReviewService } from "./hed-review.service";

@Controller("v1/disbursement/requests/:requestId/reviews")
@UseGuards(AuthGuard)
export class HedReviewController {
  constructor(private readonly reviews: HedReviewService) {}
  @Get() list(@Param("requestId", new ParseUUIDPipe()) requestId: string, @Req() request: Request) { return this.reviews.list(requestId, request.account!.userId); }
  @Post() record(@Param("requestId", new ParseUUIDPipe()) requestId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedReviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "Invalid HED review", issues: parsed.error.issues });
    return this.reviews.record(requestId, request.account!.userId, parsed.data);
  }
  @Post(":requestId/approval") prepareApproval(@Param("requestId", new ParseUUIDPipe()) requestId: string, @Req() request: Request) {
    return this.reviews.prepareApproval(requestId, request.account!.userId);
  }
}
