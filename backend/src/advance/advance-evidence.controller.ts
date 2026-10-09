import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Header, Injectable, Param, ParseUUIDPipe,
  Patch, Post, Req, Res, StreamableFile, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { Request, Response } from "express";
import { z } from "zod";
import { AuthGuard } from "../modules/auth/auth.guard";
import { MAX_EVIDENCE_FILE_BYTES } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { AdvanceEvidenceService } from "./advance-evidence.service";

const revision = z.number().int().min(0).max(2147483646);
const upload = z.object({ expectedRevision: z.coerce.number().int().positive().max(2147483646),
  kind: z.enum(["REPORT", "INVOICE", "RECEIPT", "PAYMENT_PROOF", "DELIVERY_RECORD", "PHOTO", "OTHER"]) }).strict();
@Injectable()
export class AdvanceEvidenceUploadGuard implements CanActivate {
  constructor(private readonly evidence: AdvanceEvidenceService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const id = z.uuid().safeParse(request.params.id);
    if (!id.success) throw new BadRequestException("Invalid campaign ID");
    await this.evidence.assertUploadOwner(id.data, String(request.params.stage), request.account!.userId);
    return true;
  }
}
@Injectable()
export class AdvancePublicationUploadGuard implements CanActivate {
  constructor(private readonly evidence: AdvanceEvidenceService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const id = z.uuid().safeParse(request.params.packageId);
    if (!id.success) throw new BadRequestException("Invalid package ID");
    await this.evidence.assertPublicationOwner(id.data, request.account!.userId);
    return true;
  }
}

@Controller("v1/advance/campaigns/:id/stages/:stage/evidence")
@UseGuards(AuthGuard)
export class AdvanceEvidenceController {
  constructor(private readonly evidence: AdvanceEvidenceService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  get(@Param("id", ParseUUIDPipe) id: string, @Param("stage") stage: string, @Req() request: Request) {
    return this.evidence.get(id, stage, request.account!.userId);
  }
  @Patch()
  @Header("Cache-Control", "private, no-store")
  save(@Param("id", ParseUUIDPipe) id: string, @Param("stage") stage: string, @Req() request: Request, @Body() body: unknown) {
    const parsed = z.object({ expectedRevision: revision, content: z.unknown() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.evidence.save(id, stage, request.account!.userId, parsed.data.expectedRevision, parsed.data.content);
  }
  @Post("documents")
  @UseGuards(AdvanceEvidenceUploadGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 1024 } }))
  @Header("Cache-Control", "private, no-store")
  upload(@Param("id", ParseUUIDPipe) id: string, @Param("stage") stage: string, @Req() request: Request,
    @Body() body: unknown, @UploadedFile() file?: EvidenceUploadFile) {
    const parsed = upload.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.evidence.upload(id, stage, request.account!.userId, parsed.data.expectedRevision, parsed.data.kind, file);
  }
  @Post("freeze")
  @Header("Cache-Control", "private, no-store")
  freeze(@Param("id", ParseUUIDPipe) id: string, @Param("stage") stage: string, @Req() request: Request, @Body() body: unknown) {
    const parsed = z.object({ expectedRevision: revision.refine(v => v > 0) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.evidence.freeze(id, stage, request.account!.userId, parsed.data.expectedRevision);
  }
}

function download(result: { document?: { byteSize: number }; bytes?: Buffer }, response: Response) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return new StreamableFile(result.bytes!, { type: "application/octet-stream", length: result.document!.byteSize,
    disposition: 'attachment; filename="evidence-document"' });
}
@Controller("v1/advance/evidence-packages")
@UseGuards(AuthGuard)
export class AdvanceEvidencePackageController {
  constructor(private readonly evidence: AdvanceEvidenceService) {}
  @Get(":packageId/original")
  @Header("Cache-Control", "private, no-store")
  original(@Param("packageId", ParseUUIDPipe) packageId: string, @Req() request: Request) {
    return this.evidence.original(packageId, request.account!.userId);
  }
  @Get(":packageId/original/:documentId")
  async file(@Param("packageId", ParseUUIDPipe) packageId: string, @Param("documentId", ParseUUIDPipe) documentId: string,
    @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return download(await this.evidence.original(packageId, request.account!.userId, documentId), response);
  }
  @Post(":packageId/redacted")
  @UseGuards(AdvancePublicationUploadGuard)
  @UseInterceptors(FilesInterceptor("files", 20, { limits: { fileSize: MAX_EVIDENCE_FILE_BYTES, files: 20, fields: 3,
    parts: 23, fieldSize: 10000 } }))
  @Header("Cache-Control", "private, no-store")
  publish(@Param("packageId", ParseUUIDPipe) packageId: string, @Req() request: Request,
    @Body() body: unknown, @UploadedFiles() files: EvidenceUploadFile[]) {
    const parsed = z.object({ summary: z.string().trim().min(1).max(10000), redactionConfirmed: z.literal("true"),
      originalDocumentIds: z.string().transform((v, ctx) => {
        try { return z.array(z.uuid()).min(1).max(20).parse(JSON.parse(v)); }
        catch { ctx.addIssue({ code: "custom", message: "originalDocumentIds must be a JSON UUID array" }); return z.NEVER; }
      }) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.evidence.publishRedacted(packageId, request.account!.userId,
      { ...parsed.data, redactionConfirmed: true }, files ?? []);
  }
  @Get(":packageId/redacted")
  @Header("Cache-Control", "private, no-store")
  publication(@Param("packageId", ParseUUIDPipe) packageId: string, @Req() request: Request) {
    return this.evidence.publication(packageId, request.account!.userId);
  }
}
@Controller("v1/advance/public/evidence")
export class AdvancePublicEvidenceController {
  constructor(private readonly evidence: AdvanceEvidenceService) {}
  private hash(value: string) {
    if (!/^0x[0-9a-f]{64}$/.test(value)) throw new BadRequestException("Invalid public hash");
    return value;
  }
  @Get(":hash")
  @Header("Cache-Control", "no-store")
  manifest(@Param("hash") hash: string) { return this.evidence.publicBundle(this.hash(hash)); }
  @Get(":hash/:documentId")
  async file(@Param("hash") hash: string, @Param("documentId", ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) response: Response) {
    return download(await this.evidence.publicBundle(this.hash(hash), documentId), response);
  }
}
