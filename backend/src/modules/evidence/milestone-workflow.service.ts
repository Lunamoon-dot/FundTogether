import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash, randomUUID } from 'node:crypto';
import { zeroHash } from 'viem';
import { z } from 'zod';
import { BlockchainService, criteriaReady } from '../../blockchain/blockchain.service';
import { deploymentAnchorMatches, MVP_MILESTONE_POLICY } from '../../blockchain/blockchain.constants';
import { DRIZZLE_DB } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { campaignMetadata, campaignSubmissions, chainEvents, evidenceAccessLog, evidencePackages, evidencePublications, milestoneRecords, organizationMembers, platformRoles, walletLinks } from '../../database/schema';
import { IndexerService } from '../../indexer/indexer.service';
import { EvidenceAccessService } from './evidence-access.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { evidencePackageSchema } from './evidence.schema';
import { EvidenceUploadFile, MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES } from './evidence-files.service';
import { milestoneActionReason, MilestoneAction, recordInputSchema } from './milestone-policy';

const { fileTypeFromBuffer } = require('file-type') as { fileTypeFromBuffer: (bytes: Uint8Array) => Promise<{ mime: string } | undefined> };
export const publicationInputSchema = z.object({
  packageId: z.uuid(), confirmedRedacted: z.literal(true), summary: z.string().trim().min(10).max(8000),
  outcomes: z.array(z.object({ criterionId: z.string().min(1).max(128), description: z.string().trim().min(10).max(4000),
    documentIndexes: z.array(z.number().int().nonnegative()).min(1).max(20) }).strict()).min(1).max(100),
}).strict();
type PublicationManifest = {
  schemaVersion: '1'; streamId: string; campaignId: string; milestoneIndex: string; version: number; privateCommitment: string;
  summary: string; outcomes: z.infer<typeof publicationInputSchema>['outcomes'];
  documents: { id: string; mediaType: string; byteSize: number; sha256: string; name: string }[];
};
const digest = (bytes: Buffer | string) => `0x${createHash('sha256').update(bytes).digest('hex')}`;
function checkedJson<T>(bytes: string, hash: string): T {
  if (digest(Buffer.from(bytes, 'utf8')) !== hash) throw new ServiceUnavailableException('Immutable record hash check failed');
  return JSON.parse(bytes) as T;
}

@Injectable()
export class MilestoneWorkflowService {
  constructor(@Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>,
    private readonly chain: BlockchainService, private readonly indexer: IndexerService,
    private readonly access: EvidenceAccessService, private readonly storage: EvidenceStorageService) {}

  private async checkpoint(campaignId: string, index: string) {
    if (!/^(0|[1-9]\d*)$/.test(index) || !Number.isSafeInteger(Number(index))) throw new BadRequestException('Invalid milestone index');
    await this.chain.verifyDeployment();
    const [submission] = await this.database.select().from(campaignSubmissions).where(eq(campaignSubmissions.campaignMetadataId, campaignId));
    const plan = submission?.plan;
    const d = this.chain.deployment;
    if (!plan || Number(index) >= plan.budgetUnits.length || plan.chainId !== d.chainId || plan.contractAddress.toLowerCase() !== d.contractAddress.toLowerCase()
      || plan.tokenAddress.toLowerCase() !== d.tokenAddress.toLowerCase() || plan.genesisHash !== d.genesisHash || plan.contractCodeHash !== d.contractCodeHash
      || plan.tokenCodeHash !== d.tokenCodeHash || !deploymentAnchorMatches(plan, d)) throw new ConflictException('Campaign deployment or milestone changed');
    const sync = await this.indexer.status();
    if (sync.status !== 'ready' || sync.lastIndexedBlock === null) throw new ServiceUnavailableException('Wait for the canonical indexer checkpoint');
    const block = await this.chain.client.getBlock({ blockNumber: BigInt(sync.lastIndexedBlock) });
    const keyed = await this.chain.read('campaignForDraft', [plan.organizer, plan.draftKey], block.number) as bigint;
    if (keyed === 0n) throw new ConflictException('Campaign has not been created on chain');
    const id = keyed - 1n;
    const snapshot = await this.chain.snapshot(id, block.number);
    if (!criteriaReady(plan, snapshot)) throw new ConflictException('Campaign does not match its locked plan');
    // verifyDeployment checks these markers against the actual contract. A
    // capability flag alone cannot enable signing, and RPC errors remain errors.
    const supported = d.milestonePolicy === MVP_MILESTONE_POLICY;
    if ((await this.chain.client.getBlock({ blockNumber: block.number })).hash !== sync.lastIndexedBlockHash)
      throw new ServiceUnavailableException('Canonical checkpoint changed');
    return { plan, sync, block, id, snapshot, supported };
  }

  private async roles(campaignId: string, userId: string, id: bigint, organizer: string, block: bigint) {
    const [campaign] = await this.database.select().from(campaignMetadata).where(eq(campaignMetadata.id, campaignId));
    if (!campaign || campaign.status === 'deleted') throw new NotFoundException('Campaign not found');
    const [staff] = await this.database.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    const [membership] = campaign.organizationId ? await this.database.select().from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, campaign.organizationId), eq(organizationMembers.userId, userId))) : [];
    const resolver = String(await this.chain.read('resolver', [], block)).toLowerCase();
    const links = await this.database.select().from(walletLinks).where(and(eq(walletLinks.userId, userId), eq(walletLinks.chainId, String(this.chain.deployment.chainId))));
    const contributions = await Promise.all(links.map(link => this.chain.read('contributions', [id, link.address], block) as Promise<bigint>));
    const conflict = Boolean(membership || campaign.createdByUserId === userId || campaign.organizerUserId === userId ||
      organizer.toLowerCase() === resolver || contributions.some(value => value > 0n));
    const owner = campaign.organizationId ? membership?.role === 'OWNER' : campaign.organizerUserId === userId;
    return { resolver, conflict, organizerAccount: Boolean(owner), resolverAccount: Boolean(staff?.roles.includes('RESOLVER')),
      reviewer: Boolean(staff?.roles.includes('RESOLVER') && !conflict),
      wallets: links.map((link, i) => ({ address: link.address, donor: contributions[i] > 0n,
        organizer: Boolean(owner && link.address.toLowerCase() === organizer.toLowerCase()),
        reviewer: Boolean(staff?.roles.includes('RESOLVER') && !conflict && link.address.toLowerCase() === resolver) })) };
  }

  private async assertStable(c: Awaited<ReturnType<MilestoneWorkflowService['checkpoint']>>) {
    await this.chain.verifyDeployment();
    if ((await this.chain.client.getBlock({ blockNumber: c.block.number })).hash !== c.block.hash)
      throw new ServiceUnavailableException('Checkpoint changed while reading milestone data');
    const next = await this.indexer.status();
    // A newer checkpoint is harmless: every read in this response is pinned to
    // the still-canonical old block. Do not restart uploads for unrelated blocks.
    if (next.status !== 'ready' || next.lastIndexedBlock === null || BigInt(next.lastIndexedBlock) < c.block.number)
      throw new ServiceUnavailableException('Indexer checkpoint is being reconciled; retry');
  }

  async detail(campaignId: string, index: string, userId: string) {
    const c = await this.checkpoint(campaignId, index);
    if (!c.supported) return { supported: false as const, reason: 'Campaign này dùng phiên bản hợp đồng chưa hỗ trợ xử lý phản đối. Luồng nộp bằng chứng và giải ngân MVP mới chưa mở cho campaign này.' };
    const at = c.block.number, i = BigInt(index);
    const [current, v, evidence, deadline, bond] = await Promise.all([
      this.chain.read('currentMilestoneIndex', [c.id], at), this.chain.read('submissionVersion', [c.id, i], at),
      this.chain.read('milestoneEvidence', [c.id, i], at), this.chain.read('evidenceDeadlines', [c.id, i], at), this.chain.read('claimableBond', [c.id], at),
    ]);
    const version = Number(v), evidenceHash = String((evidence as unknown[])[0]);
    const admission = version ? await this.chain.read('admissionDeadlines', [c.id, i, v], at) as bigint : 0n;
    const dispute = await this.chain.read('challengeCases', [c.id, i, v], at) as [string, string, string, string, bigint, bigint, number, string];
    const roles = await this.roles(campaignId, userId, c.id, c.plan.organizer, at);
    const publications = await this.database.select({ publication: evidencePublications, package: evidencePackages }).from(evidencePublications)
      .innerJoin(evidencePackages, eq(evidencePublications.packageId, evidencePackages.id)).where(and(
        eq(evidencePackages.campaignMetadataId, campaignId), eq(evidencePackages.milestoneIndex, index)))
      .orderBy(desc(evidencePublications.createdAt), asc(evidencePublications.hash));
    const publication = publications.find(row => row.publication.hash === evidenceHash && row.package.submissionVersion === version);
    const events = await this.database.select().from(chainEvents).where(and(eq(chainEvents.streamId, this.indexer.streamKey), eq(chainEvents.canonical, true),
      sql`${chainEvents.args}->>'campaignId' = ${c.id.toString()}`, sql`(${chainEvents.args}->>'milestoneIndex' = ${index} or ${chainEvents.eventName} = 'BondReturned')`,
      sql`${chainEvents.blockNumber} <= ${at.toString()}`));
    const recordHashes = new Set(events.flatMap(e => ['reasonHash', 'responseHash', 'materialHash'].map(key => String(e.args[key] ?? zeroHash))).filter(h => h !== zeroHash));
    const history = publications.filter(row => events.some(e => e.eventName === 'EvidenceSubmissionCreated'
      && e.args.evidenceHash === row.publication.hash && Number(e.args.version) === row.package.submissionVersion))
      .map(row => ({ hash: row.publication.hash, version: row.package.submissionVersion,
        manifest: checkedJson<PublicationManifest>(row.publication.manifestBytes, row.publication.hash) }));
    const records = [];
    for (const hash of recordHashes) {
      const [record] = await this.database.select().from(milestoneRecords).where(eq(milestoneRecords.hash, hash));
      if (record) {
        const data = checkedJson<{ streamId: string; campaignId: string; milestoneIndex: string; reason: string; action: string; version: number; wallet: string }>(record.recordBytes, hash);
        if (data.streamId === this.indexer.streamKey && data.campaignId === c.id.toString() && data.milestoneIndex === index) records.push({ hash, ...data });
      } else records.push({ hash, unavailable: true });
    }
    const response = { challenger: dispute[0], evidenceHash: dispute[1], reasonHash: dispute[2], responseHash: dispute[3],
      responseDeadline: String(dispute[4]), resolutionDeadline: String(dispute[5]), resolution: Number(dispute[6]), resolutionReasonHash: dispute[7] };
    await this.assertStable(c);
    return { supported: true as const, plan: c.plan, tokenDecimals: this.chain.deployment.tokenDecimals, onchainCampaignId: c.id.toString(), state: c.snapshot.chainState,
      currentMilestoneIndex: String(current), milestoneIndex: index, version, evidenceHash, evidenceDeadline: String(deadline), admissionDeadline: String(admission),
      reviewEnd: String((evidence as unknown[])[1]), bondUnits: String(bond), dispute: response,
      checkedBlock: String(at), checkedBlockHash: c.block.hash, chainTimestamp: String(c.block.timestamp), roles,
      publication: publication ? { hash: evidenceHash, manifest: checkedJson<PublicationManifest>(publication.publication.manifestBytes, evidenceHash) } : null,
      prepared: roles.wallets.some(w => w.organizer) ? publications.filter(row => row.package.submissionVersion === version + 1)
        .map(row => ({ hash: row.publication.hash, packageId: row.package.id, version: row.package.submissionVersion,
          manifest: checkedJson<PublicationManifest>(row.publication.manifestBytes, row.publication.hash) })) : [],
      history, records, events: events.map(e => ({ name: e.eventName, hash: e.transactionHash, block: e.blockNumber, args: e.args })) };
  }

  async publish(campaignId: string, index: string, userId: string, input: z.infer<typeof publicationInputSchema>, files: EvidenceUploadFile[]) {
    await this.access.assertCampaignOrganizer(campaignId, userId);
    const c = await this.checkpoint(campaignId, index);
    if (!c.supported) throw new ConflictException('MVP milestone deployment required');
    const [frozen] = await this.database.select().from(evidencePackages).where(and(eq(evidencePackages.id, input.packageId),
      eq(evidencePackages.campaignMetadataId, campaignId), eq(evidencePackages.milestoneIndex, index)));
    if (!frozen) throw new NotFoundException('Frozen original package not found');
    const original = evidencePackageSchema.parse(checkedJson(frozen.manifestBytes, frozen.evidenceHash));
    const version = Number(await this.chain.read('submissionVersion', [c.id, BigInt(index)], c.block.number)) + 1;
    if (frozen.submissionVersion !== version || original.campaignId !== c.id.toString() || original.contractAddress.toLowerCase() !== c.plan.contractAddress.toLowerCase()
      || original.organizerAddress.toLowerCase() !== c.plan.organizer.toLowerCase() || original.criteriaHash !== c.plan.criteriaHashes[Number(index)])
      throw new ConflictException('Frozen package identity or version changed');
    if (!files.length || files.length > MAX_EVIDENCE_FILES) throw new BadRequestException('Select 1–20 redacted PDF/JPEG/PNG files');
    const criteria = original.report.outcomes.map(o => o.criterionId);
    if (input.outcomes.length !== criteria.length || new Set(input.outcomes.map(o => o.criterionId)).size !== criteria.length
      || input.outcomes.some(o => !criteria.includes(o.criterionId) || o.documentIndexes.some(n => n >= files.length)))
      throw new BadRequestException('Public outcomes must cover every locked criterion with uploaded public documents');
    const documents: PublicationManifest['documents'] = [];
    for (const file of files) {
      if (!file.buffer.length || file.buffer.length > MAX_EVIDENCE_FILE_BYTES) throw new BadRequestException('File size exceeds 10 MiB');
      let type; try { type = await fileTypeFromBuffer(file.buffer); } catch { /* Malformed file. */ }
      if (!type || !['application/pdf', 'image/jpeg', 'image/png'].includes(type.mime) || type.mime !== file.mimetype)
        throw new BadRequestException('File content must match PDF/JPEG/PNG');
      documents.push({ id: randomUUID(), mediaType: type.mime, byteSize: file.buffer.length, sha256: digest(file.buffer),
        name: `document-${documents.length + 1}.${type.mime === 'application/pdf' ? 'pdf' : type.mime === 'image/png' ? 'png' : 'jpg'}` });
    }
    // Repeat requests return the already immutable publication; never replace it.
    const [existing] = await this.database.select().from(evidencePublications).where(eq(evidencePublications.packageId, frozen.id));
    if (existing) return { hash: existing.hash, manifest: checkedJson<PublicationManifest>(existing.manifestBytes, existing.hash) };
    const manifest: PublicationManifest = { schemaVersion: '1', streamId: this.indexer.streamKey, campaignId: c.id.toString(), milestoneIndex: index,
      version, privateCommitment: frozen.evidenceHash, summary: input.summary, outcomes: input.outcomes, documents };
    const bytes = JSON.stringify(manifest), hash = digest(bytes);
    const uploaded: string[] = [];
    try {
      for (let n = 0; n < documents.length; n++) { uploaded.push(documents[n].id); await this.storage.put(documents[n].id, files[n].buffer, documents[n].mediaType); }
      await this.access.assertCampaignOrganizer(campaignId, userId);
      await this.assertStable(c);
      if (Number(await this.chain.read('submissionVersion', [c.id, BigInt(index)])) + 1 !== version)
        throw new ConflictException('Evidence version advanced during publication; freeze the next version');
      const [saved] = await this.database.insert(evidencePublications).values({ hash, packageId: frozen.id, manifestBytes: bytes, createdBy: userId })
        .onConflictDoNothing({ target: evidencePublications.packageId }).returning();
      if (saved) return { hash, manifest };
      const [winner] = await this.database.select().from(evidencePublications).where(eq(evidencePublications.packageId, frozen.id));
      if (!winner) throw new ServiceUnavailableException('Publication was not saved');
      return { hash: winner.hash, manifest: checkedJson<PublicationManifest>(winner.manifestBytes, winner.hash) };
    } finally {
      const [retained] = await this.database.select().from(evidencePublications).where(eq(evidencePublications.hash, hash));
      if (!retained) for (const objectId of uploaded) await this.storage.remove(objectId);
    }
  }

  private async verifyFiles(manifest: PublicationManifest) {
    for (const doc of manifest.documents) await this.fileBytes(doc);
  }
  private async fileBytes(doc: PublicationManifest['documents'][number]) {
    try {
      const object = await this.storage.get(doc.id);
      if (!object.Body) throw new ServiceUnavailableException('Evidence document unavailable');
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      if (bytes.length !== doc.byteSize || digest(bytes) !== doc.sha256) throw new ServiceUnavailableException('Evidence document hash mismatch');
      return bytes;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Evidence storage is unavailable; no signing authorization issued');
    }
  }

  async publicDocument(campaignId: string, index: string, userId: string, hash: string, documentId: string) {
    const detail = await this.detail(campaignId, index, userId);
    if (!detail.supported) throw new ConflictException(detail.reason);
    const publication = detail.history.find(p => p.hash === hash) ?? detail.prepared.find(p => p.hash === hash);
    const doc = publication?.manifest.documents.find(d => d.id === documentId);
    if (!doc) throw new NotFoundException('Matching public document not found');
    return { bytes: await this.fileBytes(doc), name: doc.name };
  }

  async publicManifest(campaignId: string, index: string, userId: string, hash: string) {
    const d = await this.detail(campaignId, index, userId);
    if (!d.supported || ![...d.history, ...d.prepared].some(p => p.hash === hash)) throw new NotFoundException('Canonical public evidence manifest not found');
    const [row] = await this.database.select().from(evidencePublications).where(eq(evidencePublications.hash, hash));
    checkedJson(row.manifestBytes, hash);
    return Buffer.from(row.manifestBytes, 'utf8');
  }

  async original(campaignId: string, index: string, userId: string, documentId?: string) {
    const detail = await this.detail(campaignId, index, userId);
    if (!detail.supported || !detail.roles.wallets.some(w => w.reviewer) || !detail.publication)
      throw new ForbiddenException('Linked independent resolver and submitted matching publication required');
    const [publication] = await this.database.select().from(evidencePublications).where(eq(evidencePublications.hash, detail.evidenceHash));
    const [frozen] = await this.database.select().from(evidencePackages).where(eq(evidencePackages.id, publication.packageId));
    const original = evidencePackageSchema.parse(checkedJson(frozen.manifestBytes, frozen.evidenceHash));
    await this.database.insert(evidenceAccessLog).values({ packageId: frozen.id, userId, documentId: documentId ?? null });
    if (!documentId) return { manifest: original };
    const doc = original.documents.find(d => d.documentId === documentId && d.visibility === 'RESTRICTED_ORIGINAL' && d.storageObjectId === documentId);
    if (!doc) throw new NotFoundException('Frozen original document not found');
    return { bytes: await this.fileBytes({ id: doc.storageObjectId, byteSize: doc.byteSize, sha256: doc.sha256, mediaType: doc.mediaType, name: 'original' }) };
  }

  async prepare(campaignId: string, index: string, userId: string, input: z.infer<typeof recordInputSchema>, publicationHash?: string) {
    const d = await this.detail(campaignId, index, userId);
    if (!d.supported) throw new ConflictException(d.reason);
    if (d.version !== input.expectedVersion || d.evidenceHash !== input.expectedEvidenceHash || d.currentMilestoneIndex !== index && input.action !== 'bond')
      throw new ConflictException('Milestone version, evidence or current index changed');
    const actor = d.roles.wallets.find(w => w.address.toLowerCase() === input.wallet.toLowerCase());
    const reason = milestoneActionReason(input.action, { state: d.state, timestamp: BigInt(d.chainTimestamp), version: d.version,
      evidenceDeadline: BigInt(d.evidenceDeadline), admissionDeadline: BigInt(d.admissionDeadline), reviewEnd: BigInt(d.reviewEnd),
      ...d.dispute, responseDeadline: BigInt(d.dispute.responseDeadline), resolutionDeadline: BigInt(d.dispute.resolutionDeadline),
      bond: BigInt(d.bondUnits), linked: Boolean(actor), organizer: Boolean(actor?.organizer), donor: Boolean(actor?.donor),
      reviewer: Boolean(actor?.reviewer), readable: Boolean(d.publication) });
    if (reason) throw new ForbiddenException(reason);
    const id = d.onchainCampaignId, version = String(d.version), a = input.action;
    if (a === 'admit') {
      await this.verifyFiles(d.publication!.manifest);
      const original = await this.original(campaignId, index, userId);
      for (const doc of original.manifest!.documents) await this.fileBytes({ id: doc.storageObjectId, byteSize: doc.byteSize,
        sha256: doc.sha256, mediaType: doc.mediaType, name: 'original' });
    }
    let committed = d.evidenceHash;
    if (a === 'submit') {
      const publication = d.prepared.find(p => p.hash === publicationHash && p.version === d.version + 1);
      if (!publication) throw new ConflictException('Confirmed public publication for the next version required');
      await this.verifyFiles(publication.manifest); committed = publication.hash;
    }
    const recordBytes = JSON.stringify({ schemaVersion: '1', streamId: this.indexer.streamKey, campaignId: id, milestoneIndex: index,
      version: d.version, evidenceHash: committed, action: a, wallet: input.wallet.toLowerCase(), reason: input.reason, acknowledged: true });
    const hash = digest(recordBytes);
    await this.database.insert(milestoneRecords).values({ hash, recordBytes, createdBy: userId }).onConflictDoNothing();
    const verdict = a === 'continue' ? 1 : a === 'resubmit' ? 2 : 3;
    const calls: Record<MilestoneAction, { functionName: string; args: unknown[]; event: string; expected: Record<string, string>;
      proof?: { event: string; expected: Record<string, string> } }> = {
      submit: { functionName: 'submitEvidenceForVersion', args: [id, index, String(d.version + 1), committed], event: 'EvidenceSubmissionCreated', expected: { version: String(d.version + 1), evidenceHash: committed } },
      admit: { functionName: 'admitEvidence', args: [id, index, version, committed, hash], event: 'EvidenceAdmitted', expected: { version, evidenceHash: committed, reasonHash: hash, reviewer: input.wallet } },
      reject: { functionName: 'rejectEvidence', args: [id, index, version, committed, hash], event: 'SubmissionRejected', expected: { version, reasonHash: hash } },
      challenge: { functionName: 'challengeEvidenceForVersion', args: [id, index, version, committed, hash], event: 'ChallengeCaseOpened', expected: { version, evidenceHash: committed },
        proof: { event: 'ChallengeOpened', expected: { campaignId: id, milestoneIndex: index, donor: input.wallet, reasonHash: hash } } },
      material: { functionName: 'addChallengeMaterial', args: [id, index, version, hash], event: 'ChallengeMaterialAdded', expected: { version, donor: input.wallet, materialHash: hash } },
      respond: { functionName: 'submitChallengeResponse', args: [id, index, version, hash], event: 'ChallengeResponseSubmitted', expected: { version, responseHash: hash } },
      continue: { functionName: 'resolveChallenge', args: [id, index, version, committed, verdict, hash], event: 'ChallengeResolved', expected: { version, evidenceHash: committed, resolution: String(verdict), reasonHash: hash } },
      resubmit: { functionName: 'resolveChallenge', args: [id, index, version, committed, verdict, hash], event: 'ChallengeResolved', expected: { version, evidenceHash: committed, resolution: String(verdict), reasonHash: hash } },
      stop: { functionName: 'resolveChallenge', args: [id, index, version, committed, verdict, hash], event: 'ChallengeResolved', expected: { version, evidenceHash: committed, resolution: String(verdict), reasonHash: hash } },
      expire: { functionName: 'expireSubmission', args: [id, index, version], event: 'EvidenceSubmissionExpired', expected: { version } },
      timeout: { functionName: 'finalizeChallengeTimeout', args: [id, index, version], event: 'ChallengeResolved', expected: { version, resolution: '4' } },
      settle: { functionName: 'settleMilestoneForVersion', args: [id, index, version, committed], event: 'MilestoneSettled', expected: { amount: d.plan.budgetUnits[Number(index)] } },
      bond: { functionName: 'claimBond', args: [id], event: 'BondReturned', expected: { organizer: d.plan.organizer, amount: d.bondUnits } },
    };
    return { ...calls[a], expected: { campaignId: id, ...(a === 'bond' ? {} : { milestoneIndex: index }), ...calls[a].expected },
      recordHash: hash, checkedBlock: d.checkedBlock, checkedBlockHash: d.checkedBlockHash, contractAddress: d.plan.contractAddress, wallet: input.wallet };
  }

  async reviewQueue(userId: string) {
    const [staff] = await this.database.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    if (!staff?.roles.includes('RESOLVER')) throw new ForbiddenException('RESOLVER application role required');
    const submissions = await this.database.select().from(campaignSubmissions);
    const items = [];
    for (const s of submissions) {
      const d = this.chain.deployment;
      if (s.plan.chainId !== d.chainId || s.plan.contractAddress.toLowerCase() !== d.contractAddress.toLowerCase()
        || s.plan.tokenAddress.toLowerCase() !== d.tokenAddress.toLowerCase() || s.plan.genesisHash !== d.genesisHash
        || s.plan.contractCodeHash !== d.contractCodeHash || s.plan.tokenCodeHash !== d.tokenCodeHash || !deploymentAnchorMatches(s.plan, d)) continue;
      const keyed = await this.chain.read('campaignForDraft', [s.plan.organizer, s.plan.draftKey]) as bigint;
      if (!keyed) continue;
      const index = String(await this.chain.read('currentMilestoneIndex', [keyed - 1n]));
      if (Number(index) >= s.plan.budgetUnits.length) continue;
      const detail = await this.detail(s.campaignMetadataId, index, userId);
      if (detail.supported && [11, 7, 8].includes(detail.state)) items.push({ campaignId: s.campaignMetadataId, title: s.plan.title, index, state: detail.state });
    }
    return { items };
  }
}
