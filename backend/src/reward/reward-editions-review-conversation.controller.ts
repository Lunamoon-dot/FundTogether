import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards, Body } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardEditionsReviewConversationService } from "./reward-editions-review-conversation.service";

@Controller("v1/reward/editions")
@UseGuards(AuthGuard)
export class RewardEditionsReviewConversationController {
  constructor(private readonly conversations: RewardEditionsReviewConversationService) {}

  @Post("campaigns/:id/review-threads")
  open(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.openThread(id, req.account!.userId, body);
  }

  @Get("review-threads/:threadId")
  thread(@Param("threadId", new ParseUUIDPipe()) threadId: string, @Req() req: Request) {
    return this.conversations.thread(threadId, req.account!.userId);
  }

  @Post("review-threads/:threadId/messages")
  message(@Param("threadId", new ParseUUIDPipe()) threadId: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.message(threadId, req.account!.userId, body);
  }
}
