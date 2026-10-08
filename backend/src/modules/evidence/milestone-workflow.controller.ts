import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { EvidenceFileAccessGuard } from './evidence-files.controller';
import { EvidenceUploadFile, MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES } from './evidence-files.service';
import { MilestoneWorkflowService, publicationInputSchema } from './milestone-workflow.service';
import { recordInputSchema } from './milestone-policy';

@Controller('milestone-workflows')
@UseGuards(AuthGuard)
export class MilestoneWorkflowController {
  constructor(private readonly workflow: MilestoneWorkflowService) {}

  @Get('review-queue')
  queue(@Req() r: Request) { return this.workflow.reviewQueue(r.account!.userId); }

  @Get(':campaignId/:milestoneIndex')
  @Header('Cache-Control', 'private, no-store')
  detail(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string, @Req() r: Request) {
    return this.workflow.detail(id, index, r.account!.userId);
  }

  @Post(':campaignId/:milestoneIndex/publication')
  @UseGuards(EvidenceFileAccessGuard)
  @UseInterceptors(FilesInterceptor('files', MAX_EVIDENCE_FILES, { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES,
    files: MAX_EVIDENCE_FILES, fields: 1, parts: MAX_EVIDENCE_FILES + 1, fieldSize: 512 * 1024 } }))
  publication(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string,
    @Req() r: Request, @Body() body: { input?: string }, @UploadedFiles() files: EvidenceUploadFile[]) {
    let value: unknown; try { value = JSON.parse(body.input ?? ''); } catch { throw new BadRequestException('Public evidence input required'); }
    const parsed = publicationInputSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Explicit redaction confirmation and complete criterion outcomes required');
    return this.workflow.publish(id, index, r.account!.userId, parsed.data, files ?? []);
  }

  @Post(':campaignId/:milestoneIndex/prepare')
  prepare(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string,
    @Req() r: Request, @Body() body: unknown) {
    const parsed = recordInputSchema.extend({ publicationHash: z.string().regex(/^0x[\da-fA-F]{64}$/).optional() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Action, linked wallet, version, evidence, substantive reason and acknowledgement required');
    return this.workflow.prepare(id, index, r.account!.userId, parsed.data, parsed.data.publicationHash);
  }

  @Get(':campaignId/:milestoneIndex/documents/:hash/:documentId')
  async document(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string,
    @Param('hash') hash: string, @Param('documentId', new ParseUUIDPipe()) doc: string, @Req() r: Request,
    @Res({ passthrough: true }) response: Response) {
    const result = await this.workflow.publicDocument(id, index, r.account!.userId, hash, doc);
    return this.download(result.bytes, result.name, response);
  }

  @Get(':campaignId/:milestoneIndex/original')
  @Header('Cache-Control', 'private, no-store')
  original(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string, @Req() r: Request) {
    return this.workflow.original(id, index, r.account!.userId);
  }

  @Get(':campaignId/:milestoneIndex/manifests/:hash')
  async manifest(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string,
    @Param('hash') hash: string, @Req() r: Request, @Res({ passthrough: true }) response: Response) {
    return this.download(await this.workflow.publicManifest(id, index, r.account!.userId, hash), `evidence-${hash}.json`, response);
  }

  @Get(':campaignId/:milestoneIndex/original/:documentId')
  async originalDocument(@Param('campaignId', new ParseUUIDPipe()) id: string, @Param('milestoneIndex') index: string,
    @Param('documentId', new ParseUUIDPipe()) doc: string, @Req() r: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.workflow.original(id, index, r.account!.userId, doc);
    return this.download(result.bytes!, 'original-document', response);
  }

  private download(bytes: Buffer, name: string, response: Response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes, { type: 'application/octet-stream', length: bytes.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
  }
}
