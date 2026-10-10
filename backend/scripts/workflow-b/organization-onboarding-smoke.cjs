// Real HTTP, PostgreSQL locks and private MinIO. Adds only clearly synthetic fixtures; never resets the chain or changes existing users.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Pool } = require('pg');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { SiweMessage } = require('siwe');
const { guardEnvironment } = require('./guard-environment.cjs');
const { profile, checks, documentBytes } = require('./organization-onboarding-fixture.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });
process.env.INDEXER_ENABLED = 'false'; process.env.LOG_LEVEL = 'silent';
async function main() {
  guardEnvironment(process.env);
  const from = name => require(path.join(root, 'backend/dist/src', name));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = await NestFactory.create(from('advance/advance-app.module').AdvanceAppModule, { logger: false, abortOnError: false });
  const original = (await pool.query('select id,password_hash from users order by id')).rows;
  const originalHash = createHash('sha256').update(JSON.stringify(original)).digest('hex');
  const results = [], check = message => { results.push(message); console.log('PASS ' + message); };
  let calls = 0;
  try {
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const storage = app.get(from('modules/evidence/evidence-storage.service').EvidenceStorageService);
    const chain = app.get(from('advance/advance-blockchain.service').AdvanceBlockchainService);
    const verification = app.get(from('advance/organization-verification.service').OrganizationVerificationService);
    const requests = app.get(from('advance/organization-request.service').OrganizationRequestService);
    const schema = from('advance/organization-request-api.schema');
    async function request(actor, method, route, body, expected = 200) {
      const multipart = body instanceof FormData;
      const response = await fetch(base + route, { method, headers: { Origin: process.env.WEB_ORIGIN, ...(actor ? { Cookie: actor.cookie } : {}),
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
      const text = await response.text(), data = text ? JSON.parse(text) : null; calls++;
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); return { data, response };
    }
    async function actor(role) {
      const result = await request(null, 'POST', '/auth/register', { email: `onboarding-${randomUUID()}@workflow-b.invalid`, password: randomBytes(24).toString('hex') }, 201);
      const value = { id: result.data.userId, cookie: result.response.headers.get('set-cookie').split(';')[0] };
      if (role) await pool.query('insert into platform_roles(user_id,roles) values($1,$2)', [value.id, JSON.stringify([role])]);
      return value;
    }
    const owner = await actor(), admin = await actor('ADMIN'), admin2 = await actor('ADMIN'), resolver = await actor('RESOLVER'), stranger = await actor();
    const org = (await request(owner, 'POST', '/organizations', { name: 'SYNTHETIC onboarding verification smoke', description: 'Local technical test only; no real organization is verified.' }, 201)).data;
    const orgRoute = `/v1/advance/organizations/${org.id}/verification-requests`;
    const route = row => `/v1/advance/verification-requests/${row.id}`;
    const decide = (row, actor, decision, expected = 201) => request(actor, 'POST', `/v1/advance/internal/verification-requests/${row.id}/decisions`, { expectedRevision: row.revision, ...decision }, expected);
    const list = async () => schema.organizationRequestListSchema.parse((await request(owner, 'GET', orgRoute)).data);
    const create = async () => schema.organizationRequestSchema.parse((await request(owner, 'POST', orgRoute, {}, 201)).data);
    const save = async (row, content, expected = 200) => (await request(owner, 'PATCH', route(row), { expectedRevision: row.revision, content }, expected)).data;
    const submit = async (row, expected = 201) => (await request(owner, 'POST', route(row) + '/submit', { expectedRevision: row.revision, declaration: true }, expected)).data;
    const block = await chain.client.getBlock();
    const report = { status: 'VERIFIED', summary: 'Controlled registry checked', reason: 'Synthetic authority only', sources: [{ description: 'Synthetic registry', reference: 'local-fixture' }],
      scope: 'Local gift pilot', limits: 'No real-world assurance', validUntil: new Date(Number(block.timestamp + 8640000n) * 1000).toISOString() };
    const approval = { decision: 'APPROVE', checks, reviewNote: 'Controlled fixture accepted', verification: report };
    const simultaneousDrafts = await Promise.all([create(), create()]);
    let row = simultaneousDrafts[0]; assert.equal(simultaneousDrafts[1].id, row.id);
    await request(null, 'GET', orgRoute, undefined, 401); await request(stranger, 'GET', route(row), undefined, 403);
    await request(admin, 'GET', route(row), undefined, 403); await request(resolver, 'GET', route(row), undefined, 403);
    assert.equal((await request(admin, 'GET', orgRoute)).data.requests.length, 0);
    await request(admin, 'POST', `/v1/advance/internal/organizations/${org.id}/verifications`, report, 409);
    await submit(row, 400);
    row = await save(row, { ...row.content, profile });
    await save({ ...row, revision: row.revision - 1 }, row.content, 409);
    const upload = async (row, content = documentBytes(), mime = 'application/pdf', expected = 201) => {
      const form = new FormData(); form.set('file', new Blob([content], { type: mime }), 'synthetic.pdf'); form.set('kind', 'IDENTITY'); form.set('expectedRevision', String(row.revision));
      return (await request(owner, 'POST', route(row) + '/files', form, expected)).data;
    };
    await upload(row, documentBytes(), 'image/png', 400); row = await upload(row);
    await submit(row, 409);
    const signer = privateKeyToAccount(generatePrivateKey()), nonce = (await request(owner, 'POST', '/auth/wallets/nonce', {})).data;
    const message = new SiweMessage({ scheme: 'http', domain: nonce.domain, uri: nonce.uri, address: signer.address, version: '1', chainId: nonce.chainId,
      nonce: nonce.nonce, issuedAt: new Date().toISOString(), statement: 'Synthetic onboarding test wallet' }).prepareMessage();
    await request(owner, 'POST', '/auth/wallets/link', { message, signature: await signer.signMessage({ message }) });
    await request(owner, 'PUT', `/organizations/${org.id}/wallet`, { address: signer.address, chainId: 31338 });
    const simultaneousSubmissions = await Promise.all([submit(row), submit(row)]);
    row = simultaneousSubmissions[0]; assert.equal(simultaneousSubmissions[1].id, row.id); assert.equal(simultaneousSubmissions[1].snapshotBytes, row.snapshotBytes);
    check('O01/O02/O07: private draft, validation, SIWE representative, exact document bytes, concurrent create/submit and retry');
    await save(row, { ...row.content, profile: { ...profile, legalName: 'Changed while pending' } }, 409);
    await upload(row, documentBytes(), 'application/pdf', 409);
    await request(admin, 'PATCH', route(row), { expectedRevision: row.revision, content: row.content }, 403);
    const downloadPath = route(row) + `/files/${row.documents[0].id}/download`;
    await request(stranger, 'GET', downloadPath, undefined, 403);
    await request(resolver, 'GET', route(row), undefined, 403); await request(resolver, 'GET', downloadPath, undefined, 403);
    const download = await fetch(base + downloadPath, { headers: { Cookie: admin.cookie } }); calls++;
    assert.equal(download.status, 200); assert.equal(download.headers.get('cache-control'), 'private, no-store'); assert.deepEqual(Buffer.from(await download.arrayBuffer()), documentBytes());
    const queue = schema.organizationRequestQueueSchema.parse((await request(admin, 'GET', '/v1/advance/internal/verification-requests?status=UNDER_REVIEW&offset=0')).data);
    assert.equal(queue.items.filter(r => r.id === row.id).length, 1); await request(resolver, 'GET', '/v1/advance/internal/verification-requests', undefined, 403);
    await decide(row, resolver, approval, 403);
    await pool.query('insert into platform_roles(user_id,roles) values($1,$2)', [owner.id, '["ADMIN"]']);
    await decide(row, owner, approval, 403);
    await pool.query('update platform_roles set roles=$2 where user_id=$1', [admin2.id, '[]']); await decide(row, admin2, approval, 403);
    await pool.query('update platform_roles set roles=$2 where user_id=$1', [admin2.id, '["ADMIN"]']);
    await decide(row, admin, { decision: 'REQUEST_CHANGES', reviewNote: 'Missing authority', missingItems: [] }, 400);
    await assert.rejects(pool.query('update organization_verification_requests set content=$2 where id=$1', [row.id, JSON.stringify({ ...row.content, profile: { ...profile, legalName: 'tamper' } })]), /immutable/);
    check('O02/O06/O07/O10: server lock, private download, actual queue, current roles, self-review and immutable snapshot');
    const originalSnapshot = row.snapshotBytes;
    row = (await decide(row, admin, { decision: 'REQUEST_CHANGES', reviewNote: 'Confirm authority basis', missingItems: ['Provide appointment evidence'] })).data;
    const firstId = row.id; row = await create(); await submit(row, 400);
    row = await save(row, { ...row.content, responseToReview: 'Appointment source added', profile: { ...profile, authorityBasis: 'Confirmed synthetic appointment' } });
    row = await submit(row);
    assert.equal((await request(admin, 'GET', `/v1/advance/verification-requests/${firstId}`)).data.snapshotBytes, originalSnapshot);
    check('O03: supplementation opens a new request and preserves submitted content and review notes');
    const otherOrg = (await request(owner, 'POST', '/organizations', { name: 'SYNTHETIC foreign document scope', description: 'Private negative test fixture.' }, 201)).data;
    const otherDraft = (await request(owner, 'POST', `/v1/advance/organizations/${otherOrg.id}/verification-requests`, {}, 201)).data;
    await save(otherDraft, { ...otherDraft.content, documentIds: [row.documents[0].id] }, 400);
    await request(owner, 'GET', route(otherDraft) + `/files/${row.documents[0].id}/download`, undefined, 404);
    const altered = Buffer.from(documentBytes()); altered[altered.length - 1] ^= 1;
    try {
      await storage.put(row.documents[0].id, altered, 'application/pdf');
      await decide(row, admin, approval, 400);
      await request(admin, 'GET', route(row) + `/files/${row.documents[0].id}/download`, undefined, 400);
      await storage.remove(row.documents[0].id); await decide(row, admin, approval, 503);
    } finally { await storage.put(row.documents[0].id, documentBytes(), 'application/pdf'); }
    check('O07: foreign organization documents and same-length tampered bytes denied; synthetic storage restored');
    const counts = async () => (await pool.query(`select (select count(*) from organization_verification_records where organization_id=$1) as records,
      (select count(*) from organization_verification_audit where organization_id=$1) as audit`, [org.id])).rows[0];
    const beforeFailure = await counts(), append = verification.append.bind(verification);
    verification.append = async (...args) => { await append(...args); throw new Error('Synthetic failure after verification insert'); };
    try { await decide(row, admin, approval, 500); } finally { verification.append = append; }
    assert.deepEqual(await counts(), beforeFailure); assert.equal((await request(owner, 'GET', route(row))).data.status, 'UNDER_REVIEW');
    const race = await Promise.allSettled([requests.decide(row.id, admin.id, { expectedRevision: row.revision, ...approval }), requests.decide(row.id, admin2.id, { expectedRevision: row.revision, ...approval })]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1); assert.equal(race.find(r => r.status === 'rejected').reason.getStatus(), 409);
    await decide(row, admin, approval, 409); row = (await request(owner, 'GET', route(row))).data;
    assert.equal(row.status, 'APPROVED'); assert.equal((await counts()).records, '1');
    assert.equal((await list()).verification.status, 'VERIFIED'); await request(resolver, 'GET', route(row));
    check('O04/O07: missing storage denies approval; injected failure rolls back decision, record and audit; two concurrent admins create one approval');
    const approvedPath = route(row) + `/files/${row.documents[0].id}/download`;
    const resolverDownload = await fetch(base + approvedPath, { headers: { Cookie: resolver.cookie } }); calls++;
    assert.equal(resolverDownload.status, 200); assert.equal(resolverDownload.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await resolverDownload.arrayBuffer()), documentBytes());
    const resolverHistory = (await request(resolver, 'GET', `/v1/advance/internal/organizations/${org.id}/verifications`)).data;
    const linkedReport = resolverHistory.find(record => record.id === row.verificationRecordId);
    assert.equal(JSON.parse(linkedReport.reportBytes).request.id, row.id); assert.equal(JSON.parse(linkedReport.reportBytes).request.snapshotHash, row.snapshotHash);
    await pool.query('update platform_roles set roles=$2 where user_id=$1', [resolver.id, '[]']);
    try {
      await request(resolver, 'GET', route(row), undefined, 403); await request(resolver, 'GET', approvedPath, undefined, 403);
      await request(resolver, 'GET', `/v1/advance/internal/organizations/${org.id}/verifications`, undefined, 403);
    } finally { await pool.query('update platform_roles set roles=$2 where user_id=$1', [resolver.id, '["RESOLVER"]']); }
    check('O06: resolver reads only approved dossier/files bound to its report; removing role denies history, dossier and download immediately');
    const firstRecord = (await verification.history(org.id, admin.id))[0];
    const renewal = await create(); assert.equal((await list()).verification.status, 'VERIFIED');
    row = await submit(renewal); row = (await decide(row, admin, { decision: 'REJECT', reviewNote: 'Synthetic renewal rejection' })).data;
    assert.equal((await list()).verification.status, 'VERIFIED'); assert.equal((await verification.history(org.id, admin.id))[0].hash, firstRecord.hash);
    row = await create(); row = await submit(row);
    const cancelRace = await Promise.allSettled([requests.cancel(row.id, owner.id, row.revision), requests.decide(row.id, admin.id, { expectedRevision: row.revision, ...approval })]);
    assert.equal(cancelRace.filter(r => r.status === 'fulfilled').length, 1); assert.equal(cancelRace.find(r => r.status === 'rejected').reason.getStatus(), 409);
    assert.ok(['CANCELLED', 'APPROVED'].includes((await request(owner, 'GET', route(row))).data.status));
    check('O04/O05/O09: cancellation/approval race has one winner; rejected renewal preserves earlier valid verification');
    row = await create(); row = await save(row, { ...row.content, profile: { ...row.content.profile, address: 'Changed synthetic address' } });
    assert.equal((await list()).verification.requiresReverification, true); assert.equal((await verification.latest(org.id, block.timestamp)).verified, false);
    const timestamp = chain.client.getBlock.bind(chain.client); chain.client.getBlock = async args => args ? timestamp(args) : ({ ...block, timestamp: BigInt(Math.floor(new Date(report.validUntil).getTime() / 1000)) });
    try { assert.equal((await requests.summary({ id: org.id, verificationStatus: 'unverified' })).status, 'EXPIRED'); } finally { chain.client.getBlock = timestamp; }
    const verify = chain.verifyDeployment.bind(chain); chain.verifyDeployment = async () => { throw new Error('Synthetic RPC unavailable'); };
    try { assert.equal((await requests.summary({ id: org.id, verificationStatus: 'unverified' })).status, null); } finally { chain.verifyDeployment = verify; }
    await verification.record(org.id, admin.id, { ...report, status: 'REVOKED', reason: 'Synthetic suspension' });
    assert.equal((await list()).verification.status, 'SUSPENDED');
    await assert.rejects(pool.query('update organization_verification_audit set action=$2 where request_id=$1', [row.id, 'SAVED']), /immutable/);
    check('O08: material edit needs reapproval; expiry and suspension remain separate; RPC failure does not overwrite business state');
    for (const [status, hash, reviewer, note, constraint] of [
      ['CANCELLED', null, null, null, 'organization_requests_submission_check'],
      ['REJECTED', '0x' + '1'.repeat(64), admin.id, null, 'organization_requests_decision_check'],
    ]) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await assert.rejects(connection.query(`insert into organization_verification_requests
          (organization_id,status,content,policy_id,snapshot_bytes,snapshot_hash,submitted_at,reviewed_by,reviewed_at,review_note,created_by)
          values($1,$2,$3,'constraint-probe','{}',$4,now(),$5,case when $5::uuid is null then null else now() end,$6,$7)`,
        [org.id, status, JSON.stringify(row.content), hash, reviewer, note, owner.id]), new RegExp(constraint));
      } finally { await connection.query('ROLLBACK'); connection.release(); }
    }
    check('O01: PostgreSQL rejects NULL submitted hashes and NULL review notes; constraint probes rolled back');
    const preserved = (await pool.query('select id,password_hash from users where id=ANY($1::uuid[]) order by id', [original.map(u => u.id)])).rows;
    assert.equal(createHash('sha256').update(JSON.stringify(preserved)).digest('hex'), originalHash);
    fs.writeFileSync(path.join(root, '.local/workflow-b/organization-onboarding-report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), protocol: 'ADVANCE', chainId: 31338,
      deploymentId: chain.context.deploymentId, status: 'PASS', kind: 'HTTP-PostgreSQL-private-storage-onboarding',
      organizationId: org.id, httpCalls: calls, checks: results, originalAccountsPreserved: true, sourceChainWrites: 0,
      limitations: ['Synthetic actors and documents retained in private B DB/storage', 'No manual Brave/MetaMask or substantive human review claimed', 'Expiry/RPC failures injected without changing chain clock'] }, null, 2));
    console.log(`Onboarding smoke PASS: ${calls} HTTP checks; ${results.length} behavior groups.`);
  } finally { await app.close(); await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
