import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { AdvanceWorkflowService } from "./advance-workflow.service";

@Controller("v1/advance")
@UseGuards(AuthGuard)
export class AdvanceWorkflowController {
  constructor(private readonly workflow: AdvanceWorkflowService) {}
  @Get("campaigns/:id/workflow")
  @Header("Cache-Control", "private, no-store")
  campaign(@Param("id", ParseUUIDPipe) id: string, @Req() request: Request) { return this.workflow.campaign(id, request.account!.userId); }
  @Post("campaigns/:id/actions/prepare")
  @Header("Cache-Control", "private, no-store")
  prepare(@Param("id", ParseUUIDPipe) id: string, @Req() request: Request, @Body() input: unknown) {
    return this.workflow.prepare(id, request.account!.userId, input);
  }
  @Get("refunds")
  @Header("Cache-Control", "private, no-store")
  refunds(@Req() request: Request) { return this.workflow.refunds(request.account!.userId); }
  @Get("refunds/:id")
  @Header("Cache-Control", "private, no-store")
  refund(@Param("id") id: string, @Req() request: Request) { return this.workflow.refunds(request.account!.userId, id); }
}
@Controller("v1/advance/public")
export class AdvancePublicController {
  constructor(private readonly workflow: AdvanceWorkflowService) {}
  @Get("campaigns")
  @Header("Cache-Control", "no-store")
  list() { return this.workflow.publicCampaigns(); }
  @Get("campaigns/:id")
  @Header("Cache-Control", "no-store")
  campaign(@Param("id") id: string) { return this.workflow.publicCampaign(id); }
  @Get("campaigns/:id/events")
  @Header("Cache-Control", "no-store")
  events(@Param("id") id: string) { return this.workflow.publicEvents(id); }
  @Get("records/:hash")
  @Header("Cache-Control", "no-store")
  record(@Param("hash") hash: string) { return this.workflow.publicRecord(hash); }
}
