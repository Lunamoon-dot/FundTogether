import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedReviewSchema } from "./hed-review.schema";
import { HedReviewService } from "./hed-review.service";

@Controller("v1/disbursement/activities/:activityId/reviews")
@UseGuards(AuthGuard)
export class HedOutcomeReviewController {
  constructor(private readonly reviews: HedReviewService) {}
  @Post() record(@Param("activityId", new ParseUUIDPipe()) activityId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedReviewSchema.safeParse(body); if (!parsed.success) throw new BadRequestException({ message: "Invalid HED outcome review", issues: parsed.error.issues });
    return this.reviews.recordOutcome(activityId, request.account!.userId, parsed.data);
  }
  @Post("outcome/:packageId") prepare(@Param("activityId", new ParseUUIDPipe()) activityId: string, @Param("packageId", new ParseUUIDPipe()) packageId: string, @Req() request: Request) {
    return this.reviews.prepareOutcome(activityId, packageId, request.account!.userId);
  }
}
