import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as s from "../database/schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { validateEvidenceFile, type EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { OrganizationVerificationService } from "./organization-verification.service";
import { sha256 } from "./advance-plan";
import { changedOrganizationFields, emptyOrganizationRequest, ORGANIZATION_VERIFICATION_POLICY, organizationDecisionSchema,
  organizationDocumentKindSchema, organizationRequestContentSchema, organizationRequestSaveSchema, submissionIssues } from "./organization-request.schema";

type Tx = Parameters<Parameters<NodePgDatabase<typeof s>["transaction"]>[0]>[0];
type RequestRow = typeof s.organizationVerificationRequests.$inferSelect;
type Org = typeof s.organizations.$inferSelect;
const requests = s.organizationVerificationRequests, documents = s.organizationVerificationDocuments, audit = s.organizationVerificationAudit;

@Injectable()
export class OrganizationRequestService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof s>, private readonly chain: AdvanceBlockchainService,
    private readonly storage: EvidenceStorageService, private readonly verification: OrganizationVerificationService) {}

  private async organization(tx: Tx, id: string) {
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, id)).for("update");
    if (!org) throw new NotFoundException("Organization not found");
    return org;
  }
  private async access(tx: Tx, organizationId: string, userId: string) {
    const [owner] = await tx.select().from(s.organizationMembers).where(and(eq(s.organizationMembers.organizationId, organizationId),
      eq(s.organizationMembers.userId, userId), eq(s.organizationMembers.role, "OWNER"))).for("share");
    const [role] = await tx.select().from(s.platformRoles).where(eq(s.platformRoles.userId, userId)).for("share");
    return { owner: Boolean(owner), admin: Boolean(role?.roles.includes("ADMIN")), resolver: Boolean(role?.roles.includes("RESOLVER")) };
  }
  private owner(access: { owner: boolean }) {
    if (!access.owner) throw new ForbiddenException("Current organization OWNER required");
  }
  private async target(tx: Tx, id: string, userId: string) {
    const [hint] = await tx.select({ organizationId: requests.organizationId }).from(requests).where(eq(requests.id, id));
    if (!hint) throw new NotFoundException("Verification request not found");
    const org = await this.organization(tx, hint.organizationId);
    const [request] = await tx.select().from(requests).where(eq(requests.id, id)).for("update");
    const access = await this.access(tx, org.id, userId);
    if (!access.owner && !(access.admin && request.status !== "DRAFT") && !(access.resolver && request.status === "APPROVED"))
      throw new ForbiddenException("Verification request is private");
    return { org, request, access };
  }
  private editable(request: RequestRow, revision: number) {
    if (request.status !== "DRAFT") throw new ConflictException("Hồ sơ đã gửi đang bị khóa. Hủy yêu cầu hoặc chờ kết luận để sửa và gửi lại.");
    if (request.revision !== revision) throw new ConflictException("Hồ sơ đã thay đổi; tải lại trước khi lưu.");
  }
  private async log(tx: Tx, request: RequestRow, userId: string, action: string, changedFields: string[] = []) {
    await tx.insert(audit).values({ organizationId: request.organizationId, requestId: request.id, actorId: userId, action, changedFields, happenedAt: new Date() });
  }
  private async invalidateChangedProfile(tx: Tx, org: Org, fields: string[]) {
    if (org.verificationStatus === "verified" && fields.some(f => f !== "responseToReview"))
      await tx.update(s.organizations).set({ verificationStatus: "unverified", updatedAt: new Date() }).where(eq(s.organizations.id, org.id));
  }
  private async files(tx: Tx, orgId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await tx.select().from(documents).where(and(eq(documents.organizationId, orgId), inArray(documents.id, ids)));
    if (rows.length !== ids.length) throw new BadRequestException("Documents must belong to this organization");
    return ids.map(id => rows.find(r => r.id === id)!);
  }
  private async bytes(file: typeof documents.$inferSelect) {
    try {
      const stored = await this.storage.get(file.id);
      const data = Buffer.from(await stored.Body!.transformToByteArray());
      if (data.length !== file.byteSize || sha256(data) !== file.hash) throw new BadRequestException("Verification document bytes/hash mismatch");
      return data;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException("Private verification document is unavailable");
    }
  }
  private restore(request: RequestRow) {
    if (!request.snapshotBytes || sha256(request.snapshotBytes) !== request.snapshotHash)
      throw new BadRequestException("Verification request snapshot mismatch");
    const snapshot = JSON.parse(request.snapshotBytes);
    if (snapshot.requestId !== request.id || snapshot.organizationId !== request.organizationId || snapshot.policyId !== request.policyId
      || !isDeepStrictEqual(snapshot.content, request.content)) throw new BadRequestException("Verification request fields changed after submission");
    return snapshot as { content: RequestRow["content"]; documents: (typeof documents.$inferSelect)[]; wallet: { address: string; chainId: string } };
  }
  private async view(tx: Tx, request: RequestRow) {
    const files = await this.files(tx, request.organizationId, request.content.documentIds);
    if (request.status !== "DRAFT") {
      const snapshot = this.restore(request);
      for (const file of files) {
        const frozen = snapshot.documents.find(d => d.id === file.id);
        if (!frozen || !isDeepStrictEqual(frozen, JSON.parse(JSON.stringify(file)))) throw new BadRequestException("Verification file reference changed");
      }
    }
    return { ...request, documents: files };
  }

  async create(organizationId: string, userId: string) {
    return this.db.transaction(async tx => {
      const org = await this.organization(tx, organizationId); this.owner(await this.access(tx, org.id, userId));
      const [previous] = await tx.select().from(requests).where(eq(requests.organizationId, org.id)).orderBy(desc(requests.createdAt), desc(requests.id)).limit(1);
      if (previous && ["DRAFT", "UNDER_REVIEW"].includes(previous.status)) return this.view(tx, previous);
      const createdAt = new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
      const [request] = await tx.insert(requests).values({ organizationId, createdBy: userId,
        content: previous ? { ...previous.content, responseToReview: "" } : emptyOrganizationRequest(org.name),
        policyId: ORGANIZATION_VERIFICATION_POLICY, createdAt, updatedAt: createdAt }).returning();
      await this.log(tx, request, userId, "CREATED");
      return this.view(tx, request);
    });
  }
  async get(id: string, userId: string) {
    return this.db.transaction(async tx => { const { request } = await this.target(tx, id, userId); return this.view(tx, request); });
  }
  async save(id: string, userId: string, input: unknown) {
    const parsed = organizationRequestSaveSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.db.transaction(async tx => {
      const { request, org, access } = await this.target(tx, id, userId); this.owner(access); this.editable(request, parsed.data.expectedRevision);
      await this.files(tx, org.id, parsed.data.content.documentIds);
      const fields = changedOrganizationFields(request.content, parsed.data.content);
      if (!fields.length) return this.view(tx, request);
      const [saved] = await tx.update(requests).set({ content: parsed.data.content, revision: request.revision + 1, updatedAt: new Date() }).where(eq(requests.id, id)).returning();
      await this.invalidateChangedProfile(tx, org, fields); await this.log(tx, saved, userId, "SAVED", fields);
      return this.view(tx, saved);
    });
  }
  async assertUploadOwner(id: string, userId: string) {
    await this.db.transaction(async tx => {
      const { request, access } = await this.target(tx, id, userId); this.owner(access); this.editable(request, request.revision);
    });
  }
  async upload(id: string, userId: string, revision: number, kind: string, file?: EvidenceUploadFile) {
    if (!organizationDocumentKindSchema.safeParse(kind).success) throw new BadRequestException("Invalid verification document kind");
    const objectId = randomUUID(); let stored = false;
    try {
      return await this.db.transaction(async tx => {
        const { request, org, access } = await this.target(tx, id, userId); this.owner(access); this.editable(request, revision);
        if (request.content.documentIds.length >= 20) throw new BadRequestException("At most 20 verification documents");
        const mediaType = await validateEvidenceFile(file);
        await this.storage.verifyPrivateBucket();
        await this.storage.put(objectId, file!.buffer, mediaType); stored = true;
        await tx.insert(documents).values({ id: objectId, organizationId: org.id, requestId: id, uploadedBy: userId, kind,
          originalName: file!.originalname.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "document", mediaType,
          byteSize: file!.buffer.length, hash: sha256(file!.buffer) });
        const [saved] = await tx.update(requests).set({ content: { ...request.content, documentIds: [...request.content.documentIds, objectId] },
          revision: request.revision + 1, updatedAt: new Date() }).where(eq(requests.id, id)).returning();
        await this.invalidateChangedProfile(tx, org, ["documents"]); await this.log(tx, saved, userId, "DOCUMENT_ADDED", ["documents"]);
        return this.view(tx, saved);
      });
    } catch (error) { if (stored) await this.storage.remove(objectId).catch(() => undefined); throw error; }
  }
  async download(id: string, documentId: string, userId: string) {
    return this.db.transaction(async tx => {
      const { request } = await this.target(tx, id, userId);
      const view = await this.view(tx, request), file = view.documents.find(d => d.id === documentId);
      if (!file) throw new NotFoundException("Document is not part of this request");
      await this.storage.verifyPrivateBucket();
      return { bytes: await this.bytes(file), byteSize: file.byteSize };
    });
  }
  async submit(id: string, userId: string, revision: number) {
    return this.db.transaction(async tx => {
      const { request, org, access } = await this.target(tx, id, userId); this.owner(access);
      if (request.status === "UNDER_REVIEW" && request.revision === revision + 1) return this.view(tx, request);
      this.editable(request, revision);
      const content = organizationRequestContentSchema.parse(request.content), missing = submissionIssues(content);
      if (missing.length) throw new BadRequestException({ message: "Hồ sơ còn thiếu thông tin hoặc tài liệu.", fields: missing });
      const [previous] = await tx.select().from(requests).where(and(eq(requests.organizationId, org.id), ne(requests.id, id)))
        .orderBy(desc(requests.createdAt), desc(requests.id)).limit(1);
      if (previous?.status === "CHANGES_REQUESTED" && !content.responseToReview) throw new BadRequestException("Nhập phần trả lời yêu cầu bổ sung.");
      const [wallet] = org.representativeWalletLinkId ? await tx.select().from(s.walletLinks).where(and(eq(s.walletLinks.id, org.representativeWalletLinkId),
        eq(s.walletLinks.userId, org.createdByUserId), eq(s.walletLinks.chainId, this.chain.context.chainId.toString()))).for("share") : [];
      if (!wallet) throw new ConflictException("Chọn ví đại diện đã liên kết trước khi gửi xác thực.");
      const files = await this.files(tx, org.id, content.documentIds); await this.storage.verifyPrivateBucket();
      for (const file of files) await this.bytes(file);
      const submittedAt = new Date();
      const snapshotBytes = JSON.stringify({ schema: "organization-request.v1", requestId: id, organizationId: org.id,
        policyId: request.policyId, submittedAt: submittedAt.toISOString(), submittedBy: userId, declaration: true, content,
        wallet: { address: wallet.address, chainId: wallet.chainId }, documents: files });
      const [saved] = await tx.update(requests).set({ status: "UNDER_REVIEW", submittedAt, snapshotBytes, snapshotHash: sha256(snapshotBytes),
        revision: revision + 1, updatedAt: submittedAt }).where(eq(requests.id, id)).returning();
      await this.log(tx, saved, userId, "SUBMITTED"); return this.view(tx, saved);
    });
  }
  async cancel(id: string, userId: string, revision: number) {
    return this.db.transaction(async tx => {
      const { request, access } = await this.target(tx, id, userId); this.owner(access);
      if (request.status === "CANCELLED" && request.revision === revision + 1) return this.view(tx, request);
      if (request.status !== "UNDER_REVIEW" || request.revision !== revision) throw new ConflictException("Request is no longer awaiting review; reload");
      const [saved] = await tx.update(requests).set({ status: "CANCELLED", revision: revision + 1, updatedAt: new Date() }).where(eq(requests.id, id)).returning();
      await this.log(tx, saved, userId, "CANCELLED"); return this.view(tx, saved);
    });
  }
  async decide(id: string, userId: string, input: unknown) {
    const parsed = organizationDecisionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const decision = parsed.data;
    return this.db.transaction(async tx => {
      const { request, org, access } = await this.target(tx, id, userId);
      if (!access.admin || access.owner) throw new ForbiddenException("Current non-owner ADMIN required");
      if (request.status !== "UNDER_REVIEW" || request.revision !== decision.expectedRevision)
        throw new ConflictException("Request has changed or was already reviewed; reload its result");
      const snapshot = this.restore(request);
      let recordId: string | null = null;
      if (decision.decision === "APPROVE") {
        const [wallet] = org.representativeWalletLinkId ? await tx.select().from(s.walletLinks).where(eq(s.walletLinks.id, org.representativeWalletLinkId)).for("share") : [];
        if (!wallet || wallet.address !== snapshot.wallet.address || wallet.chainId !== snapshot.wallet.chainId) throw new ConflictException("Representative wallet changed");
        const view = await this.view(tx, request); await this.storage.verifyPrivateBucket();
        for (const file of view.documents) await this.bytes(file);
        recordId = (await this.verification.append(tx, org.id, userId, decision.verification, { id, snapshotHash: request.snapshotHash!, checks: decision.checks })).id;
      }
      const status = decision.decision === "APPROVE" ? "APPROVED" : decision.decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
      const [saved] = await tx.update(requests).set({ status, reviewNote: decision.reviewNote, reviewedBy: userId, reviewedAt: new Date(),
        missingItems: decision.decision === "REQUEST_CHANGES" ? decision.missingItems : [], verificationRecordId: recordId,
        revision: request.revision + 1, updatedAt: new Date() }).where(eq(requests.id, id)).returning();
      await this.log(tx, saved, userId, status); return this.view(tx, saved);
    });
  }
  async summary(org: Pick<Org, "id" | "verificationStatus">) {
    try {
      await this.chain.verifyDeployment(); const block = await this.chain.client.getBlock();
      const value = await this.verification.latest(org.id, block.timestamp), record = value.record;
      const status = !record ? "UNVERIFIED" : record.status === "REVOKED" ? "SUSPENDED" : value.verified ? "VERIFIED"
        : BigInt(Math.floor(record.validUntil.getTime() / 1000)) <= block.timestamp ? "EXPIRED" : "UNVERIFIED";
      return { status, verifiedAt: record?.status === "VERIFIED" ? record.createdAt.toISOString() : null,
        verificationExpiresAt: record?.status === "VERIFIED" ? record.validUntil.toISOString() : null,
        recordId: record?.id ?? null, requiresReverification: value.requiredAction === "REVERIFY_CHANGED_ORGANIZATION",
        checkedBlock: block.number!.toString(), chainTimestamp: block.timestamp.toString(), error: null as string | null };
    } catch {
      return { status: null, verifiedAt: null, verificationExpiresAt: null, recordId: null, requiresReverification: false,
        checkedBlock: null, chainTimestamp: null, error: "Chưa kiểm tra được hiệu lực xác minh. Hãy thử lại." };
    }
  }
  async list(organizationId: string, userId: string) {
    const result = await this.db.transaction(async tx => {
      const org = await this.organization(tx, organizationId), access = await this.access(tx, org.id, userId);
      if (!access.owner && !access.admin) throw new ForbiddenException("Current OWNER or ADMIN required");
      const rows = await tx.select().from(requests).where(and(eq(requests.organizationId, org.id), access.owner ? undefined : ne(requests.status, "DRAFT")))
        .orderBy(desc(requests.createdAt), desc(requests.id));
      const history = rows.length ? await tx.select().from(audit).where(inArray(audit.requestId, rows.map(r => r.id)))
        .orderBy(desc(audit.happenedAt), desc(audit.id)) : [];
      const views = []; for (const request of rows) views.push(await this.view(tx, request));
      return { organization: { id: org.id, name: org.name, verificationStatus: org.verificationStatus }, requests: views, audit: history, isOwner: access.owner };
    });
    return { ...result, verification: await this.summary(result.organization) };
  }
  async queue(userId: string, status = "UNDER_REVIEW", offset = 0) {
    if (!["UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "CANCELLED"].includes(status)
      || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new BadRequestException("Invalid request queue filter");
    return this.db.transaction(async tx => {
      const [role] = await tx.select().from(s.platformRoles).where(eq(s.platformRoles.userId, userId)).for("share");
      if (!role?.roles.includes("ADMIN")) throw new ForbiddenException("Current ADMIN required");
      const rows = await tx.select({ id: requests.id, organizationId: requests.organizationId, name: s.organizations.name,
        status: requests.status, submittedAt: requests.submittedAt, reviewedAt: requests.reviewedAt })
        .from(requests).innerJoin(s.organizations, eq(s.organizations.id, requests.organizationId))
        .where(eq(requests.status, status)).orderBy(desc(requests.submittedAt), desc(requests.id)).offset(offset).limit(51);
      return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null };
    });
  }
}
