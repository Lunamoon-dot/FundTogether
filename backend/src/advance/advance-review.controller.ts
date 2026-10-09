import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { AdvanceReviewService } from "./advance-review.service";

@Controller("v1/advance/internal/reviews")
@UseGuards(AuthGuard)
export class AdvanceReviewController {
  constructor(private readonly reviews: AdvanceReviewService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  queue(@Req() request: Request) { return this.reviews.queue(request.account!.userId); }
  @Post(":id/prepare")
  @Header("Cache-Control", "private, no-store")
  prepare(@Param("id", ParseUUIDPipe) id: string, @Req() request: Request, @Body() input: unknown) {
    return this.reviews.prepareReview(id, request.account!.userId, input);
  }
}
