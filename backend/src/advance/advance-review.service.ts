import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Address, Hex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { OrganizationVerificationService } from "./organization-verification.service";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { advanceReviewSchema, validateCriterionDecision, validateCriterionDocuments } from "./advance-review.schema";
import type { AdvanceReviewInput } from "./advance-review.schema";
import { advanceEvidencePackageSchema, advancePublicManifestSchema } from "./advance-evidence.schema";
import { restoreGiftPlan, sha256 } from "./advance-plan";
import type { AdvanceActionPreparation, AdvanceCampaignSnapshot } from "./advance.types";
import { advanceStreamKey } from "./advance-indexer.service";
type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

export function reviewTransaction(s: AdvanceCampaignSnapshot, input: AdvanceReviewInput, reportHash: Hex, verificationHash: Hex | null) {
  const c = s.campaign, now = BigInt(s.checkpoint.chainTimestamp);
  const fail = () => { throw new ConflictException("Review state, version or deadline changed; reload before signing"); };
  if (c.planHash.toLowerCase() !== input.expectedPlanHash.toLowerCase() || c.refundSnapshotted) fail();
  if (input.kind === "STOP") return { functionName: "stopCampaign", args: [s.campaignId, c.planHash, reportHash] };
  if (input.kind === "APPROVE_CAMPAIGN" || input.kind === "FIRST_ELIGIBILITY") {
    if (!verificationHash || c.state !== (input.kind === "APPROVE_CAMPAIGN" ? "DRAFT" : "FIRST_REVIEW")
      || (input.kind === "FIRST_ELIGIBILITY" && now >= BigInt(c.firstReviewEnd))) fail();
    return { functionName: input.kind === "APPROVE_CAMPAIGN" ? "approveCampaign" : "confirmFirstAdvance",
      args: [s.campaignId, c.planHash, verificationHash, reportHash] };
  }
  const ref = input.evidenceRef;
  const stage = s.stages[Number(c.currentStage)];
  const version = stage?.submissions.find(v => v.version === ref?.version);
  if (!ref || ref.campaignId !== s.campaignId || ref.stage !== c.currentStage || ref.version !== stage?.latestVersion
    || !version || ref.evidenceHash.toLowerCase() !== version.evidenceHash.toLowerCase() || now >= BigInt(stage.hardStop)) fail();
  const fullChallenge = () => { if (now + 259200n >= BigInt(stage.hardStop)) fail(); };
  if (input.kind === "CASE") {
    const cs = version!.challengeCase;
    if (c.state !== "CASE_OPEN" || !cs.caseUsed || cs.resolution !== "PENDING"
      || now < BigInt(cs.responseEnd) || now >= BigInt(cs.resolutionEnd) || !input.resolution) fail();
    if (input.resolution === "CONTINUE") fullChallenge();
    return { functionName: "resolveCase", args: [ref, ["PENDING", "CONTINUE", "RESUBMIT", "STOP"].indexOf(input.resolution!), reportHash] };
  }
  if (c.state !== "EVIDENCE_REVIEW" || version!.reviewed || now >= BigInt(stage.reviewEnd) || !input.decision) fail();
  const decision = input.decision!;
  if (decision.outcome === "MET") {
    if (!input.publicHash) fail();
    fullChallenge();
    return { functionName: "approveEvidence", args: [ref, input.publicHash, reportHash, decision.campaignSpent] };
  }
  if (decision.outcome === "NOT_MET") return { functionName: "rejectEvidence", args: [ref, reportHash] };
  return { functionName: "requestSupplement", args: [ref, decision.outcome === "NEEDS_INFORMATION" ? 1 : 3, reportHash] };
}

@Injectable()
export class AdvanceReviewService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly chain: AdvanceBlockchainService, private readonly verification: OrganizationVerificationService,
    private readonly storage: EvidenceStorageService) {}

  async assertReviewer(tx: Tx, organizationId: string, userId: string, actor: string, campaignId: string, block: bigint) {
    const [role] = await tx.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).for("share");
    if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Current RESOLVER account required");
    const wallets = await tx.select().from(schema.walletLinks).where(and(eq(schema.walletLinks.userId, userId),
      eq(schema.walletLinks.chainId, String(this.chain.context.chainId)))).for("share");
    if (actor.toLowerCase() !== this.chain.context.resolver.toLowerCase() || !wallets.some(w => w.address.toLowerCase() === actor.toLowerCase()))
      throw new ForbiddenException("Configured resolver wallet must be SIWE-linked on31338");
    const [owner] = await tx.select().from(schema.organizationMembers).where(and(eq(schema.organizationMembers.organizationId, organizationId),
      eq(schema.organizationMembers.userId, userId), eq(schema.organizationMembers.role, "OWNER"))).for("share");
    if (owner) throw new ForbiddenException("Organization OWNER cannot review own campaign");
    for (const wallet of wallets) {
      if ((await this.chain.read("contributions", [BigInt(campaignId), wallet.address], block)) as bigint > 0n)
        throw new ForbiddenException("Contributor account cannot review this campaign");
    }
  }

  async queue(userId: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Current RESOLVER account required");
    return this.db.select({ id: schema.campaignMetadata.id, title: schema.campaignMetadata.title,
      organizationId: schema.campaignMetadata.organizationId, planHash: schema.advanceCampaignPlans.planHash,
      frozenAt: schema.advanceCampaignPlans.frozenAt }).from(schema.advanceCampaignPlans)
      .innerJoin(schema.campaignMetadata, eq(schema.advanceCampaignPlans.campaignMetadataId, schema.campaignMetadata.id))
      .innerJoin(schema.advanceCampaignProjection, and(eq(schema.advanceCampaignProjection.metadataId, schema.campaignMetadata.id),
        eq(schema.advanceCampaignProjection.streamId, advanceStreamKey(this.chain.deployment))))
      .where(and(eq(schema.advanceCampaignPlans.deploymentId, this.chain.context.deploymentId),
        eq(schema.advanceCampaignPlans.chainId, this.chain.context.chainId),
        eq(schema.advanceCampaignPlans.contractAddress, this.chain.context.contractAddress.toLowerCase())))
      .orderBy(desc(schema.campaignMetadata.createdAt));
  }

  private async checkedObject(id: string, hash: string, size: number, mediaType: string) {
    try {
      const object = await this.storage.get(id);
      const bytes = Buffer.from(await object.Body!.transformToByteArray());
      if (bytes.length !== size || sha256(bytes) !== hash || object.ContentType !== mediaType) throw new Error("Object changed");
      return bytes;
    } catch { throw new ServiceUnavailableException("Committed evidence object unavailable or changed"); }
  }

  async checkedPackage(tx: Tx, packageId: string, metadataId: string, s: AdvanceCampaignSnapshot, ref: NonNullable<AdvanceReviewInput["evidenceRef"]>) {
    const [row] = await tx.select().from(schema.evidencePackages).where(and(eq(schema.evidencePackages.id, packageId),
      eq(schema.evidencePackages.campaignMetadataId, metadataId))).for("share");
    if (!row || sha256(row.manifestBytes) !== row.evidenceHash) throw new ConflictException("Evidence package bytes/hash mismatch");
    const parsed = advanceEvidencePackageSchema.safeParse(JSON.parse(row.manifestBytes));
    if (!parsed.success) throw new ConflictException("Workflow B evidence package required");
    const p = parsed.data;
    if (JSON.stringify(p.context) !== JSON.stringify(this.chain.context) || p.packageId !== row.id || p.campaignMetadataId !== metadataId
      || p.campaignId !== ref.campaignId || p.milestoneIndex !== ref.stage || String(p.submissionVersion) !== ref.version
      || row.evidenceHash !== ref.evidenceHash || p.planHash !== s.campaign.planHash || p.criteriaHash !== s.stages[Number(ref.stage)]?.criteriaHash
      || p.organizerAddress.toLowerCase() !== s.campaign.organizer.toLowerCase()) throw new ConflictException("Evidence package belongs to another context or version");
    return { row, content: p };
  }

  async checkedPublic(tx: Tx, packageId: string, expectedHash: string, original: Awaited<ReturnType<AdvanceReviewService["checkedPackage"]>>) {
    await this.storage.verifyPrivateBucket();
    const [row] = await tx.select().from(schema.evidencePublications).where(and(eq(schema.evidencePublications.packageId, packageId),
      eq(schema.evidencePublications.hash, expectedHash))).for("share");
    if (!row || sha256(row.manifestBytes) !== row.hash) throw new ConflictException("Matching public bundle commitment required");
    const parsed = advancePublicManifestSchema.safeParse(JSON.parse(row.manifestBytes));
    if (!parsed.success) throw new ConflictException("Workflow B redacted manifest required");
    const p = parsed.data, o = original.content;
    if (JSON.stringify(p.context) !== JSON.stringify(this.chain.context) || p.packageId !== packageId || p.evidenceHash !== original.row.evidenceHash
      || p.planHash !== o.planHash || p.criteriaHash !== o.criteriaHash || p.campaignId !== o.campaignId
      || p.milestoneIndex !== o.milestoneIndex || p.submissionVersion !== o.submissionVersion)
      throw new ConflictException("Public bundle context/version mismatch");
    const originals = new Map(o.documents.map(d => [d.documentId, d]));
    if (new Set(p.documents.map(d => d.originalDocumentId)).size !== p.documents.length
      || p.documents.length !== originals.size) throw new ConflictException("Each original requires one public counterpart");
    for (const d of p.documents) {
      if (originals.get(d.originalDocumentId)?.sha256 !== d.originalSha256 || d.storageObjectId !== `workflow-b/public/${d.documentId}`)
        throw new ConflictException("Public document reference mismatch");
      await this.checkedObject(d.storageObjectId, d.sha256, d.byteSize, d.mediaType);
    }
    return { publicHash: row.hash, checked: true as const };
  }

  async prepareReview(id: string, userId: string, input: unknown): Promise<AdvanceActionPreparation> {
    const parsed = advanceReviewSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.chain.verifyDeployment();
    const block = await this.chain.client.getBlock();
    return this.db.transaction(async tx => {
      const [row] = await tx.select({ campaign: schema.campaignMetadata, plan: schema.advanceCampaignPlans })
        .from(schema.advanceCampaignPlans).innerJoin(schema.campaignMetadata, eq(schema.advanceCampaignPlans.campaignMetadataId, schema.campaignMetadata.id))
        .where(and(eq(schema.advanceCampaignPlans.campaignMetadataId, id), eq(schema.advanceCampaignPlans.deploymentId, this.chain.context.deploymentId),
          eq(schema.advanceCampaignPlans.chainId, this.chain.context.chainId), eq(schema.advanceCampaignPlans.contractAddress, this.chain.context.contractAddress.toLowerCase()))).for("share");
      if (!row?.campaign.organizationId || !row.plan.frozenAt) throw new NotFoundException("Frozen B campaign not found");
      const plan = restoreGiftPlan(row.plan, this.chain.deployment);
      const mapped = await this.chain.read("campaignForDraft", [plan.organizer, plan.draftKey], block.number) as bigint;
      if (mapped === 0n) throw new ConflictException("Campaign submission not confirmed on B chain");
      const s = await this.chain.snapshot(mapped - 1n, block.number);
      await this.assertReviewer(tx, row.campaign.organizationId, userId, parsed.data.actorWallet, s.campaignId, block.number);
      if (row.campaign.createdByUserId === userId || s.campaign.organizer.toLowerCase() === parsed.data.actorWallet.toLowerCase())
        throw new ForbiddenException("Campaign creator cannot review own campaign");
      if (s.campaign.planHash !== plan.planHash || s.campaign.organizer.toLowerCase() !== plan.organizer.toLowerCase()
        || s.stages.length !== plan.budgets.length || s.stages.some((stage, i) => stage.budget !== plan.budgets[i] || stage.criteriaHash !== plan.criteriaHashes[i]))
        throw new ConflictException("On-chain campaign does not match frozen plan");
      const review = parsed.data;
      let verificationHash: Hex | null = null;
      if (review.kind === "APPROVE_CAMPAIGN" || review.kind === "FIRST_ELIGIBILITY") {
        // Hold organization lock against concurrent verification/revocation until intent commits.
        await tx.select().from(schema.organizations).where(eq(schema.organizations.id, row.campaign.organizationId)).for("share");
        const result = await this.verification.latest(row.campaign.organizationId, block.timestamp);
        if (!result.verified) throw new ConflictException("Organization verification expired/revoked: resolver STOP or reverify required; chain state remains unchanged");
        verificationHash = result.record!.hash as Hex;
      }
      let availability: unknown = null, decision: unknown = null;
      if (review.kind === "EVIDENCE" || (review.kind === "CASE" && review.resolution === "CONTINUE")) {
        const packageId = review.packageId;
        if (!packageId || !review.evidenceRef) throw new BadRequestException("Exact package required");
        const original = await this.checkedPackage(tx, packageId, id, s, review.evidenceRef);
        if (review.kind === "EVIDENCE") {
          const criteria = JSON.parse(plan.planBytes).stages[Number(review.evidenceRef.stage)].acceptanceCriteria;
          const validated = validateCriterionDecision(criteria, review.decision, s.stages[Number(review.evidenceRef.stage)].budget);
          const docs = new Map(original.content.documents.map(d => [d.documentId, d]));
          validateCriterionDocuments(criteria, validated, original.content.documents);
          for (const d of docs.values()) await this.checkedObject(d.storageObjectId, d.sha256, d.byteSize, d.mediaType);
          decision = { ...validated, unused: (BigInt(s.stages[Number(review.evidenceRef.stage)].budget) - BigInt(validated.campaignSpent)).toString() };
        }
        if (review.decision?.outcome === "MET" || review.resolution === "CONTINUE") {
          const publicHash = review.kind === "CASE" ? s.stages[Number(review.evidenceRef.stage)].publicHash : review.publicHash;
          if (!publicHash) throw new BadRequestException("Public commitment required");
          availability = await this.checkedPublic(tx, packageId, publicHash, original);
        }
      }
      await this.chain.verifyDeployment();
      const canonical = await this.chain.client.getBlock({ blockNumber: block.number });
      if (canonical.hash !== block.hash) throw new ConflictException("Review checkpoint orphaned; reload");
      const latestBlock = await this.chain.client.getBlock();
      const latest = await this.chain.snapshot(BigInt(s.campaignId), latestBlock.number);
      if (verificationHash && !(await this.verification.latest(row.campaign.organizationId, latestBlock.timestamp)).verified)
        throw new ConflictException("Organization verification expired during review preparation");
      const recordBytes = JSON.stringify({ schemaVersion: "advance.decision.v1", context: this.chain.context,
        campaignMetadataId: id, campaignId: s.campaignId, checkpoint: latest.checkpoint,
        actorUserId: userId, actorWallet: review.actorWallet.toLowerCase(), verificationHash,
        review, decision, availability, authority: "INTENT_ONLY" });
      const recordHash = sha256(recordBytes);
      const action = reviewTransaction(latest, review, recordHash, verificationHash);
      await tx.insert(schema.milestoneRecords).values({ hash: recordHash, recordBytes, createdBy: userId }).onConflictDoNothing();
      return { context: this.chain.context, checkpoint: latest.checkpoint, actorWallet: review.actorWallet as Address,
        contractAddress: this.chain.context.contractAddress, ...action, recordHash, blockedReason: null };
    });
  }
}
