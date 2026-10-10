import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Header, Injectable, Param, ParseUUIDPipe,
  Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request, Response } from "express";
import { z } from "zod";
import { AuthGuard } from "../modules/auth/auth.guard";
import { MAX_EVIDENCE_FILE_BYTES, type EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { OrganizationRequestService } from "./organization-request.service";
import { organizationDocumentKindSchema, organizationRequestRevisionSchema, organizationRequestSubmitSchema } from "./organization-request.schema";

@Injectable()
export class OrganizationRequestUploadGuard implements CanActivate {
  constructor(private readonly requests: OrganizationRequestService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>(); const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new BadRequestException("Invalid verification request ID");
    await this.requests.assertUploadOwner(id.data, req.account!.userId); return true;
  }
}

@Controller("v1/advance/organizations/:id/verification-requests")
@UseGuards(AuthGuard)
export class OrganizationRequestListController {
  constructor(private readonly requests: OrganizationRequestService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request) { return this.requests.list(id, req.account!.userId); }
  @Post()
  @Header("Cache-Control", "private, no-store")
  create(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() body: unknown) {
    if (!z.object({}).strict().safeParse(body ?? {}).success) throw new BadRequestException("Request creation takes no profile overrides");
    return this.requests.create(id, req.account!.userId);
  }
}

@Controller("v1/advance/verification-requests")
@UseGuards(AuthGuard)
export class OrganizationRequestController {
  constructor(private readonly requests: OrganizationRequestService) {}
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  get(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request) { return this.requests.get(id, req.account!.userId); }
  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  save(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() input: unknown) { return this.requests.save(id, req.account!.userId, input); }
  @Post(":id/submit")
  @Header("Cache-Control", "private, no-store")
  submit(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() input: unknown) {
    const parsed = organizationRequestSubmitSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.requests.submit(id, req.account!.userId, parsed.data.expectedRevision);
  }
  @Post(":id/cancel")
  @Header("Cache-Control", "private, no-store")
  cancel(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() input: unknown) {
    const parsed = organizationRequestRevisionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.requests.cancel(id, req.account!.userId, parsed.data.expectedRevision);
  }
  @Post(":id/files")
  @UseGuards(OrganizationRequestUploadGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 1024 } }))
  @Header("Cache-Control", "private, no-store")
  upload(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() input: unknown, @UploadedFile() file?: EvidenceUploadFile) {
    const parsed = z.object({ expectedRevision: z.coerce.number().int().positive().max(2147483646), kind: organizationDocumentKindSchema }).strict().safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.requests.upload(id, req.account!.userId, parsed.data.expectedRevision, parsed.data.kind, file);
  }
  @Get(":id/files/:documentId/download")
  async download(@Param("id", ParseUUIDPipe) id: string, @Param("documentId", ParseUUIDPipe) documentId: string,
    @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const file = await this.requests.download(id, documentId, req.account!.userId);
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(file.bytes, { type: "application/octet-stream", length: file.byteSize, disposition: 'attachment; filename="verification-document"' });
  }
}

@Controller("v1/advance/internal/verification-requests")
@UseGuards(AuthGuard)
export class OrganizationRequestReviewController {
  constructor(private readonly requests: OrganizationRequestService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  queue(@Req() req: Request, @Query("status") status?: string, @Query("offset") offset?: string) {
    return this.requests.queue(req.account!.userId, status, offset === undefined ? 0 : Number(offset));
  }
  @Post(":id/decisions")
  @Header("Cache-Control", "private, no-store")
  decide(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() input: unknown) { return this.requests.decide(id, req.account!.userId, input); }
}
