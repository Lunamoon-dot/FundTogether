import { BadRequestException, Body, Controller, Get, Post, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CampaignProjectionService } from './campaign-projection.service';
import { CampaignReviewService } from './campaign-review.service';

@Controller('public/campaigns')
export class PublicCampaignsController {
  constructor(private readonly projection: CampaignProjectionService) {}

  @Get()
  list(@Query() query: unknown) {
    const input = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().safeParse(query);
    if (!input.success) throw new BadRequestException('Valid pagination required');
    return this.projection.publicList(input.data.limit, input.data.offset);
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) { return this.projection.publicDetail(id); }
}

@Controller('contributions')
@UseGuards(AuthGuard)
export class ContributionsController {
  constructor(private readonly projection: CampaignProjectionService) {}

  @Get()
  list(@Req() request: Request) { return this.projection.donorContributions(request.account!.userId); }
}

@Controller('refunds')
@UseGuards(AuthGuard)
export class RefundsController {
  constructor(private readonly projection: CampaignProjectionService) {}

  @Get()
  list(@Req() request: Request) { return this.projection.donorRefunds(request.account!.userId); }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request) {
    return this.projection.donorRefunds(request.account!.userId, id);
  }
}

@Controller('review')
@UseGuards(AuthGuard)
export class CampaignReviewController {
  constructor(private readonly projection: CampaignProjectionService, private readonly reviews: CampaignReviewService) {}

  @Get('access')
  access(@Req() request: Request) { return this.projection.reviewAccess(request.account!.userId); }

  @Get('campaigns')
  list(@Req() request: Request) { return this.projection.reviewList(request.account!.userId); }

  @Get('campaigns/:id')
  detail(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request) { return this.projection.reviewDetail(id, request.account!.userId); }

  @Post('campaigns/:id/decision')
  decision(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request, @Body() body: unknown) {
    const input = z.object({ decision: z.enum(['approve', 'request_changes', 'reject']), reason: z.string().trim().min(10).max(4000),
      expectedDossierHash: z.string().regex(/^0x[0-9a-f]{64}$/) }).strict().safeParse(body);
    if (!input.success) throw new BadRequestException('Decision, substantive reason (10–4000 characters) and dossier hash required');
    return this.reviews.decide(id, request.account!.userId, input.data);
  }

  @Get('campaigns/:id/approval')
  approval(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request) { return this.reviews.authorizeApproval(id, request.account!.userId); }
}

@Controller('campaigns')
@UseGuards(AuthGuard)
export class CampaignPublicationController {
  constructor(private readonly projection: CampaignProjectionService, private readonly reviews: CampaignReviewService) {}

  @Get(':id/publication')
  publication(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request) { return this.projection.publication(id, request.account!.userId); }

  @Post(':id/revision')
  revision(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request) { return this.reviews.revise(id, request.account!.userId); }
}
