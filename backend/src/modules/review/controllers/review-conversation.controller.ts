import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { ReviewConversationService } from "../services/review-conversation.service";

@Controller("v1/fundtogether/campaigns")
@UseGuards(AuthGuard)
export class ReviewConversationController {
  constructor(private readonly conversations: ReviewConversationService) {}

  @Post("campaigns/:id/review-threads")
  open(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.openThread(id, req.account!.userId, body);
  }

  @Get("review-threads/:threadId")
  thread(@Param("threadId", new ParseUUIDPipe()) threadId: string, @Req() req: Request, @Query() query: unknown) {
    return this.conversations.thread(threadId, req.account!.userId, query);
  }

  @Get("campaigns/:id/review-threads")
  list(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Query() query: unknown) {
    return this.conversations.listThreads(id, req.account!.userId, query);
  }

  @Post("review-threads/:threadId/messages")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  message(@Param("threadId", new ParseUUIDPipe()) threadId: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.message(threadId, req.account!.userId, body);
  }

  @Post("review-threads/:threadId/escalate")
  escalate(@Param("threadId", new ParseUUIDPipe()) threadId: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.escalate(threadId, req.account!.userId, body);
  }

  @Get("resolver/review-cases")
  resolverCases(@Req() req: Request) { return this.conversations.listResolverCases(req.account!.userId); }

  @Get("resolver/review-cases/:escalationId")
  resolverCase(@Param("escalationId", new ParseUUIDPipe()) escalationId: string, @Req() req: Request) {
    return this.conversations.resolverCase(escalationId, req.account!.userId);
  }

  @Post("review-escalations/:escalationId/request-creator-response")
  requestCreatorResponse(@Param("escalationId", new ParseUUIDPipe()) escalationId: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.requestCreatorResponse(escalationId, req.account!.userId, body);
  }

  @Post("review-escalations/:escalationId/resolve")
  resolve(@Param("escalationId", new ParseUUIDPipe()) escalationId: string, @Req() req: Request, @Body() body: unknown) {
    return this.conversations.resolveEscalation(escalationId, req.account!.userId, body);
  }
}
