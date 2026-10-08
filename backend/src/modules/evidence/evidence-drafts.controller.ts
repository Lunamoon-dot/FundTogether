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
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { EvidenceDraftsService } from "./evidence-drafts.service";
import { evidenceDraftContentSchema } from "./evidence.schema";
import { EvidencePackagesService } from './evidence-packages.service';

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
  constructor(private readonly draftsService: EvidenceDraftsService, private readonly packages: EvidencePackagesService) {}

  @Post('freeze')
  freeze(@Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('milestoneIndex') milestoneIndex: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = z.object({ expectedRevision: z.number().int().positive() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.packages.freeze(campaignId, parseMilestoneIndex(milestoneIndex), request.account!.userId, parsed.data.expectedRevision);
  }

  @Get('packages')
  packagesList(@Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('milestoneIndex') milestoneIndex: string, @Req() request: Request) {
    return this.packages.list(campaignId, parseMilestoneIndex(milestoneIndex), request.account!.userId);
  }

  @Get('packages/:packageId/manifest')
  async manifest(@Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('milestoneIndex') milestoneIndex: string, @Param('packageId', new ParseUUIDPipe()) packageId: string,
    @Req() request: Request, @Res() response: Response) {
    const bytes = await this.packages.manifest(campaignId, parseMilestoneIndex(milestoneIndex), packageId, request.account!.userId);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="evidence-${packageId}.json"`);
    response.send(Buffer.from(bytes, 'utf8'));
  }

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
