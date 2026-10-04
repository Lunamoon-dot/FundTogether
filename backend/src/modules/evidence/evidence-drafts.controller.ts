import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceDraftsService } from "./evidence-drafts.service";
import { evidenceDraftContentSchema } from "./evidence.schema";

const createDraftSchema = z
  .object({ milestoneId: z.uuid(), content: evidenceDraftContentSchema })
  .strict();

const updateDraftSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    content: evidenceDraftContentSchema,
  })
  .strict();

function parseMilestoneIndex(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException("milestoneIndex must be an unsigned integer");
  }
  return value;
}

@Controller("campaigns/:campaignId/milestones/:milestoneIndex/evidence-draft")
@UseGuards(AuthGuard)
export class EvidenceDraftsController {
  constructor(private readonly draftsService: EvidenceDraftsService) {}

  @Post()
  create(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Param("milestoneIndex") milestoneIndex: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const parsed = createDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.draftsService.create(
      campaignId,
      parseMilestoneIndex(milestoneIndex),
      request.account!.userId,
      parsed.data.content,
      parsed.data.milestoneId,
    );
  }

  @Patch()
  update(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Param("milestoneIndex") milestoneIndex: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const parsed = updateDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.draftsService.update(
      campaignId,
      parseMilestoneIndex(milestoneIndex),
      request.account!.userId,
      parsed.data.expectedRevision,
      parsed.data.content,
    );
  }

  @Get()
  get(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Param("milestoneIndex") milestoneIndex: string,
    @Req() request: Request,
  ) {
    return this.draftsService.get(
      campaignId,
      parseMilestoneIndex(milestoneIndex),
      request.account!.userId,
    );
  }
}
