import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { HedReviewService } from "./hed-review.service";

@Controller("v1/disbursement/reviews")
@UseGuards(AuthGuard)
export class HedReviewQueueController {
  constructor(private readonly reviews: HedReviewService) {}
  @Get("pending") pending(@Req() request: Request) { return this.reviews.pending(request.account!.userId); }
}
