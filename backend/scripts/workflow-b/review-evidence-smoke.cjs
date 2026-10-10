const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { createWalletClient, getAddress, http, parseEther } = require('viem');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { SiweMessage } = require('siwe');
const { ConfigService } = require('@nestjs/config');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { S3Client, PutBucketPolicyCommand, DeleteBucketPolicyCommand } = require('@aws-sdk/client-s3');
const { guardEnvironment } = require('./guard-environment.cjs');
const { giftPlan } = require('./pilot-fixtures.cjs');
const { pdf, png } = require('./format-fixtures.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const { chain: network } = require('./deploy-isolated.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });

async function main() {
  guardEnvironment(process.env);
  const from = file => require(path.join(root, 'backend/dist/src', file));
  const schema = from('database/schema');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const chain = new (from('advance/advance-blockchain.service').AdvanceBlockchainService)(manifest);
  await chain.verifyDeployment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  const db = drizzle(pool, { schema });
  const config = new ConfigService(from('config/env.config').configuration());
  const auth = new (from('modules/auth/auth.service').AuthService)(config, db);
  const storage = new (from('modules/evidence/evidence-storage.service').EvidenceStorageService)(config);
  const campaigns = new (from('advance/advance-campaign.service').AdvanceCampaignService)(db, chain);
  const verification = new (from('advance/organization-verification.service').OrganizationVerificationService)(db, chain);
  const organizationRequests = new (from('advance/organization-request.service').OrganizationRequestService)(db, chain, storage, verification);
  const { approveService } = require('./organization-onboarding-fixture.cjs');
  const reviews = new (from('advance/advance-review.service').AdvanceReviewService)(db, chain, verification, storage);
  const evidence = new (from('advance/advance-evidence.service').AdvanceEvidenceService)(db, chain, storage, reviews);
  const accounts = await chain.client.request({ method: 'eth_accounts' });
  const local = createWalletClient({ account: accounts[0], chain: network, transport: http(manifest.rpcUrl) });
  const tokenAbi = from('blockchain/generated/advance/mock-usdc.abi.json');
  const suffix = randomUUID();
  const receipts = [];
  async function send(wallet, functionName, args, token = false) {
    await chain.verifyDeployment();
    const hash = await wallet.writeContract({ address: token ? manifest.tokenAddress : manifest.contractAddress,
      abi: token ? tokenAbi : chain.abi, functionName, args });
    const receipt = await chain.client.waitForTransactionReceipt({ hash, confirmations: 1 });
    assert.equal(receipt.status, 'success');
    receipts.push({ functionName, hash, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString() });
    return receipt;
  }
  async function account(signer) {
    const wallet = createWalletClient({ account: signer, chain: network, transport: http(manifest.rpcUrl) });
    const address = getAddress(typeof signer === 'string' ? signer : signer.address);
    const existing = (await pool.query('select user_id from wallet_links where chain_id=$1 and address=$2', ['31338', address.toLowerCase()])).rows[0];
    if (existing) return { id: existing.user_id, address, wallet, reusedLinkedAccount: true };
    const session = await auth.register(`review-${randomUUID()}@workflow-b.invalid`, randomBytes(24).toString('hex'));
    const nonce = await auth.createNonce(session.token);
    const message = new SiweMessage({ scheme: 'http', domain: nonce.domain, uri: nonce.uri, address, version: '1', chainId: nonce.chainId,
      nonce: nonce.nonce, issuedAt: new Date().toISOString(), statement: 'Link a synthetic B smoke-test wallet' }).prepareMessage();
    await auth.linkWallet(session.account.userId, session.token, message, await wallet.signMessage({ message }));
    return { id: session.account.userId, address, wallet, reusedLinkedAccount: false };
  }
  let s3;
  try {
    // Ephemeral test signer keys exist only in this process; extension/human signing is not claimed.
    const organizer = await account(privateKeyToAccount(generatePrivateKey()));
    const donor = await account(privateKeyToAccount(generatePrivateKey()));
    const resolver = await account(accounts[0]);
    for (const a of [organizer, donor]) {
      const hash = await local.sendTransaction({ to: a.address, value: parseEther('1') });
      assert.equal((await chain.client.waitForTransactionReceipt({ hash })).status, 'success');
    }
    const [staff] = (await pool.query('insert into users(email) values($1) returning id', [`staff-${suffix}@workflow-b.invalid`])).rows;
    await pool.query(`insert into platform_roles(user_id,roles) values($1,'["ADMIN"]'),($2,'["RESOLVER"]')
      on conflict(user_id) do update set roles=excluded.roles`, [staff.id, resolver.id]);
    const [org] = (await pool.query('insert into organizations(name,description,created_by_user_id) values($1,$2,$3) returning id',
      [`B review/evidence smoke${suffix}`, 'Synthetic B transport and review fixture', organizer.id])).rows;
    await pool.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'OWNER')`, [org.id, organizer.id]);
    await pool.query(`update organizations set representative_wallet_link_id=(select id from wallet_links where user_id=$1 and chain_id='31338') where id=$2`, [organizer.id, org.id]);
    const block = await chain.client.getBlock();
    const check = { status: 'VERIFIED', summary: 'Controlled synthetic authority', reason: 'Test registry and representative checked',
      sources: [{ description: 'Synthetic registry', reference: `local-${suffix}` }], scope: 'Gift pilot authority', limits: 'Does not prove execution',
      validUntil: new Date(Number(block.timestamp + 8640000n) * 1000).toISOString() };
    await assert.rejects(verification.record(org.id, resolver.id, check), e => e.getStatus() === 403);
    await pool.query(`insert into platform_roles(user_id,roles) values($1,'["ADMIN"]')`, [organizer.id]);
    await assert.rejects(verification.record(org.id, organizer.id, check), e => e.getStatus() === 403);
    await pool.query('delete from platform_roles where user_id=$1', [organizer.id]);
    const verified = await approveService(organizationRequests, verification, org.id, organizer.id, staff.id, check);
    const campaign = await campaigns.create(org.id, organizer.id, giftPlan());
    const plan = await campaigns.prepareSubmission(campaign.id, organizer.id, campaign.revision);
    await send(organizer.wallet, 'submitCampaignForDraft', [plan.draftKey, plan.planHash, BigInt(plan.fundingDuration), plan.budgets.map(BigInt), plan.criteriaHashes]);
    const id = (await chain.read('campaignForDraft', [plan.organizer, plan.draftKey])) - 1n;
    const review = { kind: 'APPROVE_CAMPAIGN', actorWallet: resolver.address, expectedPlanHash: plan.planHash, reason: 'Plan checked',
      sources: check.sources, scope: 'Controlled pilot', limits: 'Synthetic test', conflictOfInterest: false, publicDisclosureConfirmed: true };
    await assert.rejects(reviews.prepareReview(campaign.id, organizer.id, review), e => e.getStatus() === 403);
    await assert.rejects(reviews.prepareReview(campaign.id, resolver.id, { ...review, actorWallet: donor.address }), e => e.getStatus() === 403);
    await pool.query(`update platform_roles set roles='[]' where user_id=$1`, [resolver.id]);
    await assert.rejects(reviews.prepareReview(campaign.id, resolver.id, review), e => e.getStatus() === 403);
    await pool.query(`update platform_roles set roles='["RESOLVER"]' where user_id=$1`, [resolver.id]);
    const approval = await reviews.prepareReview(campaign.id, resolver.id, review);
    assert.equal((await chain.snapshot(id, (await chain.client.getBlock()).number)).campaign.state, 'DRAFT');
    await send(local, approval.functionName, [id, plan.planHash, verified.hash, approval.recordHash]);
    await send(organizer.wallet, 'publishCampaign', [id, plan.planHash]);
    await send(local, 'mint', [donor.address, 2200000000n], true);
    await send(donor.wallet, 'approve', [manifest.contractAddress, 2200000000n], true);
    await send(donor.wallet, 'donate', [id, 2200000000n]);
    const first = { ...review, kind: 'FIRST_ELIGIBILITY' };
    const revocation = await verification.record(org.id, staff.id, { ...check, status: 'REVOKED', reason: 'Controlled revocation test' });
    await assert.rejects(reviews.prepareReview(campaign.id, resolver.id, first), e => e.getStatus() === 409);
    assert.equal((await chain.snapshot(id, (await chain.client.getBlock()).number)).campaign.state, 'FIRST_REVIEW');
    const renewal = await approveService(organizationRequests, verification, org.id, organizer.id, staff.id, check);
    assert.equal((await pool.query('select count(*) from organization_verification_records where organization_id=$1', [org.id])).rows[0].count, '3');
    assert.equal((await verification.latest(org.id, BigInt(Math.floor(renewal.validUntil.getTime() / 1000)))).verified, false);
    const eligibility = await reviews.prepareReview(campaign.id, resolver.id, first);
    await send(local, eligibility.functionName, [id, plan.planHash, renewal.hash, eligibility.recordHash]);
    await send(organizer.wallet, 'claimAdvance', [id, 0n, plan.planHash]);
    const content = { report: { summary: 'SYNTHETIC - transport test', performedFrom: '2026-10-01', performedTo: '2026-10-02', outcomes: [] },
      expenses: [], documents: [], giftReport: { deliveredPackages: 100, recipientScope: 'Synthetic recipients', distributionFrom: '2026-10-01',
        distributionTo: '2026-10-02', handoverSummary: 'Synthetic registry only', limitations: 'No actual delivery claimed' } };
    let draft = await evidence.save(campaign.id, '0', organizer.id, 0, content);
    await assert.rejects(evidence.upload(campaign.id, '0', donor.id, draft.revision, 'REPORT', { buffer: pdf('SYNTHETIC'), mimetype: 'application/pdf', originalname: 'probe.pdf' }), e => e.getStatus() === 403);
    await assert.rejects(evidence.upload(campaign.id, '0', organizer.id, draft.revision, 'PHOTO', { buffer: pdf('SYNTHETIC'), mimetype: 'image/png', originalname: 'spoof.png' }), e => e.getStatus() === 400);
    draft = await evidence.upload(campaign.id, '0', organizer.id, draft.revision, 'REPORT', { buffer: pdf('SYNTHETIC ORIGINAL - private account reference'), mimetype: 'application/pdf', originalname: 'private-probe.pdf' });
    draft = await evidence.upload(campaign.id, '0', organizer.id, draft.revision, 'PHOTO', { buffer: png(), mimetype: 'image/png', originalname: 'format-probe.png' });
    for (const kind of ['INVOICE', 'PAYMENT_PROOF', 'DELIVERY_RECORD']) draft = await evidence.upload(campaign.id, '0', organizer.id, draft.revision, kind,
      { buffer: pdf(`SYNTHETIC ${kind} - format probe only`), mimetype: 'application/pdf', originalname: `${kind}.pdf` });
    const criteria = giftPlan().stages[0].acceptanceCriteria;
    const linked = { ...draft.content, documents: draft.content.documents.map(d => ({ ...d, relatesToCriterionIds: criteria.map(c => c.criterionId) })),
      report: { ...draft.content.report, outcomes: criteria.map(c => ({ criterionId: c.criterionId, description: 'Declared synthetic format test', documentIds: draft.content.documents.map(d => d.documentId) })) } };
    draft = await evidence.save(campaign.id, '0', organizer.id, draft.revision, linked);
    const raced = await Promise.allSettled([evidence.save(campaign.id, '0', organizer.id, draft.revision, linked), evidence.save(campaign.id, '0', organizer.id, draft.revision, linked)]);
    assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(raced.find(r => r.status === 'rejected').reason.getStatus(), 409);
    draft = raced.find(r => r.status === 'fulfilled').value;
    await storage.put(draft.content.documents[0].storageObjectId, pdf('SYNTHETIC TAMPER'), 'application/pdf');
    await assert.rejects(evidence.freeze(campaign.id, '0', organizer.id, draft.revision), e => e.getStatus() === 409);
    await storage.put(draft.content.documents[0].storageObjectId, pdf('SYNTHETIC ORIGINAL - private account reference'), 'application/pdf');
    const packages = await Promise.all([evidence.freeze(campaign.id, '0', organizer.id, draft.revision), evidence.freeze(campaign.id, '0', organizer.id, draft.revision)]);
    assert.equal(packages[0].id, packages[1].id);
    const frozen = packages[0];
    await assert.rejects(evidence.save(campaign.id, '0', organizer.id, draft.revision, linked), e => e.getStatus() === 409);
    await assert.rejects(evidence.original(frozen.id, donor.id), e => e.getStatus() === 403);
    assert.equal((await evidence.original(frozen.id, resolver.id)).evidenceHash, frozen.evidenceHash);
    const publicFiles = draft.content.documents.map((_, i) => ({ buffer: pdf(`SYNTHETIC PUBLIC - redacted document${i + 1}`), mimetype: 'application/pdf', originalname: 'public.pdf' }));
    const publicInput = { summary: 'SYNTHETIC redacted transport package', redactionConfirmed: true, originalDocumentIds: draft.content.documents.map(d => d.documentId) };
    const copied = [...publicFiles]; copied[0] = { ...copied[0], buffer: pdf('SYNTHETIC ORIGINAL - private account reference') };
    await assert.rejects(evidence.publishRedacted(frozen.id, organizer.id, publicInput, copied), e => e.getStatus() === 400);
    const published = await evidence.publishRedacted(frozen.id, organizer.id, publicInput, publicFiles);
    assert.equal(published.manifestBytes.includes('private-probe'), false);
    await assert.rejects(evidence.publicBundle(published.hash), e => e.getStatus() === 409);
    await send(organizer.wallet, 'submitEvidence', [id, 0n, 1n, frozen.evidenceHash]);
    const publicManifest = JSON.parse((await evidence.publicBundle(published.hash)).manifestBytes);
    assert.equal((await evidence.publicBundle(published.hash, publicManifest.documents[0].documentId)).bytes.equals(publicFiles[0].buffer), true);
    await assert.rejects(evidence.publicBundle(published.hash, draft.content.documents[0].documentId), e => e.getStatus() === 404);
    const ref = { campaignId: id.toString(), stage: '0', version: '1', evidenceHash: frozen.evidenceHash };
    const met = { ...review, kind: 'EVIDENCE', evidenceRef: ref, packageId: frozen.id, publicHash: published.hash,
      decision: { outcome: 'MET', conflictOfInterest: false, campaignSpent: '2200000000', criteria: criteria.map(c => ({ criterionId: c.criterionId,
        outcome: 'MET', reason: 'Synthetic transport assertion, no truth verification', sources: ['synthetic-format-probe'], limits: 'No activity evidence verified', documentIds: draft.content.documents.map(d => d.documentId) })) } };
    await assert.rejects(reviews.prepareReview(campaign.id, resolver.id, { ...met, evidenceRef: { ...ref, version: '2' } }), e => e.getStatus() === 409);
    const count = async () => (await pool.query('select count(*) from milestone_records')).rows[0].count;
    const beforeCount = await count();
    const unavailable = new (from('advance/advance-review.service').AdvanceReviewService)(db, chain, verification, {
      verifyPrivateBucket: async () => { throw new Error('offline'); }, get: async () => { throw new Error('offline'); } });
    await assert.rejects(unavailable.prepareReview(campaign.id, resolver.id, met));
    assert.equal(await count(), beforeCount);
    s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
    await s3.send(new PutBucketPolicyCommand({ Bucket: process.env.S3_BUCKET, Policy: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*',
      Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${process.env.S3_BUCKET}/workflow-b-public-policy-probe/*`] }] }) }));
    await assert.rejects(reviews.prepareReview(campaign.id, resolver.id, met), e => e.getStatus() === 503);
    assert.equal(await count(), beforeCount);
    await s3.send(new DeleteBucketPolicyCommand({ Bucket: process.env.S3_BUCKET }));
    const prepared = await reviews.prepareReview(campaign.id, resolver.id, met);
    assert.equal(prepared.functionName, 'approveEvidence');
    assert.equal((await chain.snapshot(id, (await chain.client.getBlock()).number)).campaign.state, 'EVIDENCE_REVIEW');
    await send(local, 'approveEvidence', [{ campaignId: id, stage: 0n, version: 1n, evidenceHash: frozen.evidenceHash }, published.hash, prepared.recordHash, 2200000000n]);
    const final = await chain.snapshot(id, (await chain.client.getBlock()).number);
    assert.equal(final.campaign.state, 'CHALLENGE_WINDOW');
    assert.equal(final.campaign.advanced, '2200000000');
    assert.equal(final.campaign.custody, '0');
    atomicWrite(path.join(root, '.local/workflow-b/review-evidence-report.json'), { testedAt: new Date().toISOString(), context: chain.context,
      metadataId: campaign.id, campaignId: id.toString(), organizationId: org.id, verifiedHash: verified.hash, revokedHash: revocation.hash,
      renewedHash: renewal.hash, packageId: frozen.id, evidenceHash: frozen.evidenceHash, publicHash: published.hash,
      decisionHash: prepared.recordHash, state: final.campaign.state, checkpoint: final.checkpoint, receipts,
      mode: 'AUTOMATED_SYNTHETIC_TRANSPORT_ONLY', manualExtension: false, labelledReviewerEvidence: false });
    console.log('Workflow B real SIWE/DB/storage/chain review smoke PASS:', JSON.stringify({ campaignId: id.toString(), state: final.campaign.state,
      checks: 'fresh roles/wallet/OWNER/revocation/expiry/revision+freeze races/MIME/tamper/private policy/public ACL/storage outage/immutable intents', manualExtension: false }));
  } finally {
    if (s3) { await s3.send(new DeleteBucketPolicyCommand({ Bucket: process.env.S3_BUCKET })).catch(() => undefined); s3.destroy(); }
    storage.onModuleDestroy(); await pool.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Workflow B smoke failed'); process.exitCode = 1; });
