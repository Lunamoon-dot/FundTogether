const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { SiweMessage } = require('siwe');
const { ConfigService } = require('@nestjs/config');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { guardEnvironment } = require('./guard-environment.cjs');
const { giftPlan } = require('./pilot-fixtures.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });

async function main() {
  guardEnvironment(process.env);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const schema = require(path.join(root, 'backend/dist/src/database/schema'));
  const { AdvanceBlockchainService } = require(path.join(root, 'backend/dist/src/advance/advance-blockchain.service.js'));
  const { AdvanceCampaignService } = require(path.join(root, 'backend/dist/src/advance/advance-campaign.service.js'));
  const { AuthService } = require(path.join(root, 'backend/dist/src/modules/auth/auth.service.js'));
  const chain = new AdvanceBlockchainService(manifest);
  await chain.verifyDeployment();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  const db = drizzle(pool, { schema });
  const auth = new AuthService(new ConfigService({ authChainId: 31338, authDomain: 'localhost:5174', webOrigin: 'http://localhost:5174' }), db);
  const suffix = randomUUID();
  const session = await auth.register(`draft-owner-${suffix}@workflow-b.invalid`, randomBytes(24).toString('hex'));
  const owner = { id: session.account.userId };
  const [outsider] = (await pool.query('insert into users(email) values($1) returning id', [`draft-outsider-${suffix}@workflow-b.invalid`])).rows;
  const [org] = (await pool.query('insert into organizations(name,description,created_by_user_id) values($1,$2,$3) returning id',
    [`B draft smoke${suffix}`, 'Synthetic B plan/freeze fixture', owner.id])).rows;
  await pool.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'OWNER')`, [org.id, owner.id]);
  const service = new AdvanceCampaignService(db, chain);
  try {
    await assert.rejects(service.create(org.id, outsider.id, giftPlan()), e => e.getStatus() === 403);
    const first = await service.create(org.id, owner.id, giftPlan());
    const second = await service.create(org.id, owner.id, giftPlan(3));
    assert.equal(first.goalUnits, '2200000000');
    assert.equal(second.goalUnits, '3300000000');
    assert.equal((await service.get(first.id, owner.id)).content.stages.length, 1);
    await assert.rejects(service.get(first.id, outsider.id), e => e.getStatus() === 403);
    await assert.rejects(service.update(first.id, owner.id, { ...giftPlan(), expectedRevision: 2 }), e => e.getStatus() === 409);
    await assert.rejects(service.update(first.id, owner.id, { ...giftPlan(), expectedRevision: 1,
      stages: [{ ...giftPlan().stages[0], id: second.content.stages[0].id }] }), e => e.getStatus() === 400);
    const updated = await service.update(first.id, owner.id, { ...giftPlan(), expectedRevision: 1,
      title: 'Updated synthetic G1', stages: first.content.stages });
    assert.equal(updated.revision, 2);
    assert.equal(updated.content.stages[0].id, first.content.stages[0].id);
    await assert.rejects(service.prepareSubmission(first.id, owner.id, 1), e => e.getStatus() === 409);
    await assert.rejects(service.prepareSubmission(first.id, owner.id, 2), e => e.getStatus() === 403);
    // Ephemeral synthetic signer in memory; no key/log/persistent secret, and no wallet-extension claim.
    const signer = privateKeyToAccount(generatePrivateKey());
    const wallet = signer.address.toLowerCase();
    const nonce = await auth.createNonce(session.token);
    const message = new SiweMessage({ scheme: 'http', domain: nonce.domain, uri: nonce.uri,
      address: signer.address, statement: 'Link this synthetic local B test wallet', version: '1',
      chainId: nonce.chainId, nonce: nonce.nonce, issuedAt: new Date().toISOString() }).prepareMessage();
    await auth.linkWallet(owner.id, session.token, message, await signer.signMessage({ message }));
    const [link] = (await pool.query('select id from wallet_links where user_id=$1 and chain_id=$2 and address=$3', [owner.id, '31338', wallet])).rows;
    await pool.query('update organizations set representative_wallet_link_id=$1 where id=$2', [link.id, org.id]);
    const frozen = await service.prepareSubmission(first.id, owner.id, 2);
    assert.equal(frozen.budgets[0], '2200000000');
    assert.equal(frozen.organizer, wallet);
    assert.equal(JSON.parse(frozen.planBytes).stages[0].milestoneId, first.content.stages[0].id);
    assert.deepEqual(await service.prepareSubmission(first.id, owner.id, 2), frozen);
    assert.deepEqual((await service.get(first.id, owner.id)).submissionPlan, frozen);
    await assert.rejects(service.update(first.id, owner.id, { ...giftPlan(), expectedRevision: 2 }), e => e.getStatus() === 409);
    const beforeHash = frozen.planHash;
    const reload = new AdvanceCampaignService(drizzle(pool, { schema }), new AdvanceBlockchainService(manifest));
    assert.equal((await reload.get(first.id, owner.id)).submissionPlan.planHash, beforeHash);
    await pool.query('update advance_campaign_plans set frozen_plan_bytes=$1 where campaign_metadata_id=$2', ['{}', first.id]);
    await assert.rejects(service.get(first.id, owner.id), e => e.getStatus() === 409);
    await pool.query('update advance_campaign_plans set frozen_plan_bytes=$1 where campaign_metadata_id=$2', [frozen.planBytes, first.id]);
    const report = { database: 'fundtogether_workflow_b', protocolKind: 'ADVANCE', deploymentId: manifest.deploymentId,
      G1: { metadataId: first.id, goalUnits: first.goalUnits, planHash: frozen.planHash, stages: 1 },
      G2: { metadataId: second.id, goalUnits: second.goalUnits, stages: 3 },
      ownerAccess: 'PASS', staleRevision: 'PASS', foreignMilestone: 'PASS',
      missingWallet: 'PASS', freezeIdempotent: 'PASS', frozenEditRejects: 'PASS', reloadHash: 'PASS', tamperRejects: 'PASS',
      onchainSubmission: false, syntheticSiweSignatureVerified: true };
    atomicWrite(path.join(root, '.local/workflow-b/draft-report.json'), report);
    console.log('Workflow B real DB draft/freeze/access PASS:', JSON.stringify(report));
  } finally { await pool.end(); }
}
main().catch(error => { console.error('Workflow B draft verification failed:', error.code || error.message); process.exitCode = 1; });
