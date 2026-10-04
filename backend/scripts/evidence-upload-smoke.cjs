// Real HTTP/PostgreSQL/MinIO checks; every fixture and object is scoped to this run.
require('dotenv').config({ quiet: true });
process.env.LOG_LEVEL = 'silent';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Pool } = require('pg');
const { AppModule } = require('../dist/src/app.module');
const { DRIZZLE_DB } = require('../dist/src/database/database.constants');
const { EvidenceStorageService } = require('../dist/src/modules/evidence/evidence-storage.service');

async function main() {
  const emails = [1, 2].map((n) => `evidence-${randomUUID()}-${n}@example.invalid`);
  const password = randomBytes(24).toString('base64url');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = await NestFactory.create(AppModule, { logger: false });
  const storage = app.get(EvidenceStorageService);
  const objects = new Set();
  const originalPut = storage.put.bind(storage);
  let uploadBarrier;
  storage.put = async (id, ...args) => {
    objects.add(id);
    if (uploadBarrier) await uploadBarrier();
    return originalPut(id, ...args);
  };
  let checks = 0;
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    async function raw(path, cookie, method = 'GET', body) {
      const multipart = body instanceof FormData;
      return fetch(`${base}${path}`, {
        method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
          ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      });
    }
    async function request(path, cookie, expected = 200, method = 'GET', body) {
      const response = await raw(path, cookie, method, body);
      assert.equal(response.status, expected, `${method} ${path}: unexpected status`);
      checks++;
      return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    const owner = await request('/auth/register', null, 201, 'POST', { email: emails[0], password });
    const outsider = await request('/auth/register', null, 201, 'POST', { email: emails[1], password });
    const org = (await request('/organizations', owner.cookie, 201, 'POST', { name: 'Evidence smoke', description: 'Temporary fixtures.' })).data;
    const campaign = (await request(`/organizations/${org.id}/campaigns`, owner.cookie, 201, 'POST', {
      title: 'Evidence smoke', description: 'Temporary campaign.',
      milestones: [1, 2].map((n) => ({ title: `Stage ${n}`, description: `Work ${n}`,
        acceptanceCriteria: [{ criterionId: `c${n}`, description: `Result ${n}` }] })),
    })).data;
    const content = { report: { summary: 'Completed work', performedFrom: '2026-10-01', performedTo: '2026-10-02', outcomes: [] }, expenses: [], documents: [] };
    const campaignRoute = `/campaigns/${campaign.id}`;
    const firstRoute = `${campaignRoute}/milestones/0/evidence-draft`;
    const firstId = campaign.milestones[0].id;
    const secondId = campaign.milestones[1].id;
    const other = (await request(`/organizations/${org.id}/campaigns`, owner.cookie, 201, 'POST', {
      title: 'Another temporary campaign', description: 'Foreign milestone fixture.',
      milestones: [{ title: 'Other milestone', description: 'Other work', acceptanceCriteria: [{ criterionId: 'other', description: 'Other result' }] }],
    })).data;
    await request(firstRoute, owner.cookie, 409, 'POST', { milestoneId: other.milestones[0].id, content });
    // Regression: an ID from a different milestone must not bind to index 0.
    await request(firstRoute, owner.cookie, 409, 'POST', { milestoneId: secondId, content });
    await request(`${campaignRoute}/milestones/999/evidence-draft`, owner.cookie, 404, 'POST', { milestoneId: firstId, content });
    await request(firstRoute, owner.cookie, 400, 'POST', { content });
    await request(firstRoute, outsider.cookie, 403, 'POST', { milestoneId: firstId, content });
    await request(firstRoute, owner.cookie, 409, 'POST', { milestoneId: randomUUID(), content });
    const reordered = (await request(campaignRoute, owner.cookie, 200, 'PATCH', {
      title: campaign.title, description: campaign.description, expectedRevision: campaign.revision,
      milestones: [...campaign.milestones].reverse().map((m) => ({ id: m.id, title: m.title, description: m.description, acceptanceCriteria: m.acceptanceCriteria })),
    })).data;
    assert.equal(reordered.milestones[1].id, firstId);
    await request(firstRoute, owner.cookie, 409, 'POST', { milestoneId: firstId, content });
    const concurrent = (await request(`/organizations/${org.id}/campaigns`, owner.cookie, 201, 'POST', {
      title: 'Concurrent planning fixture', description: 'Race draft creation against reordering.',
      milestones: campaign.milestones.map((m) => ({ title: m.title, description: m.description, acceptanceCriteria: m.acceptanceCriteria })),
    })).data;
    const concurrentRoute = `/campaigns/${concurrent.id}`;
    const concurrentEvidence = `${concurrentRoute}/milestones/0/evidence-draft`;
    const planRace = await Promise.all([
      raw(concurrentEvidence, owner.cookie, 'POST', { milestoneId: concurrent.milestones[0].id, content }),
      raw(concurrentRoute, owner.cookie, 'PATCH', {
        title: concurrent.title, description: concurrent.description, expectedRevision: concurrent.revision,
        milestones: [...concurrent.milestones].reverse().map((m) => ({ id: m.id, title: m.title, description: m.description, acceptanceCriteria: m.acceptanceCriteria })),
      }),
    ]);
    checks += 2;
    assert.ok((planRace[0].status === 201 && planRace[1].status === 409) ||
      (planRace[0].status === 409 && planRace[1].status === 200), 'Plan edits and evidence creation must serialize');
    const currentPlan = (await request(concurrentRoute, owner.cookie)).data;
    await request(concurrentEvidence, owner.cookie, planRace[0].status === 201 ? 200 : 404);
    if (planRace[0].status === 201) assert.equal(currentPlan.milestones[0].id, concurrent.milestones[0].id);
    const route = `${campaignRoute}/milestones/1/evidence-draft`;
    let draft = (await request(route, owner.cookie, 201, 'POST', { milestoneId: firstId, content })).data;
    assert.equal(draft.milestoneIndex, '1');
    await request(route, owner.cookie, 409, 'POST', { milestoneId: firstId, content });
    const documentsRoute = `${route}/documents`;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=', 'base64');
    function form(bytes = png, type = 'image/png', revision = draft.revision, name = 'evidence.png') {
      const data = new FormData();
      data.append('expectedRevision', String(revision)); data.append('kind', 'PHOTO');
      data.append('file', new Blob([bytes], { type }), name);
      return data;
    }
    await request(documentsRoute, null, 401, 'POST', form());
    await request(documentsRoute, outsider.cookie, 403, 'POST', form());
    await request(documentsRoute, owner.cookie, 400, 'POST', form(Buffer.from('fake image'), 'image/png'));
    await request(documentsRoute, owner.cookie, 400, 'POST', form(png, 'application/pdf'));
    await request(documentsRoute, owner.cookie, 400, 'POST', form(Buffer.from('unsupported'), 'text/plain'));
    await request(documentsRoute, owner.cookie, 400, 'POST', form(Buffer.alloc(0), 'image/png'));
    await request(documentsRoute, owner.cookie, 413, 'POST', form(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png'));
    draft = (await request(documentsRoute, owner.cookie, 201, 'POST', form())).data;
    const document = draft.content.documents[0];
    assert.equal(document.byteSize, png.length);
    assert.equal(document.sha256, `0x${createHash('sha256').update(png).digest('hex')}`);
    assert.equal(document.visibility, 'RESTRICTED_ORIGINAL');
    const download = `${documentsRoute}/${document.documentId}`;
    const response = await raw(download, owner.cookie);
    assert.equal(response.status, 200); checks++;
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    await request(download, outsider.cookie, 403);
    await request(download, null, 401);
    const anonymousObject = await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/originals/${document.storageObjectId}`);
    assert.equal(anonymousObject.status, 403); checks++;
    const tampered = structuredClone(draft.content);
    tampered.documents[0].sha256 = `0x${'0'.repeat(64)}`;
    await request(route, owner.cookie, 409, 'PATCH', { expectedRevision: draft.revision, content: tampered });
    const edited = structuredClone(draft.content); edited.report.summary = 'Updated work report';
    const saves = await Promise.all([1, 2].map(() => raw(route, owner.cookie, 'PATCH', { expectedRevision: draft.revision, content: edited })));
    assert.deepEqual(saves.map((r) => r.status).sort(), [200, 409]); checks += 2;
    draft = (await request(route, owner.cookie)).data;
    assert.equal(draft.content.report.summary, edited.report.summary);
    assert.deepEqual(draft.content.documents, edited.documents);
    // Force both uploads to reach storage before either appends to PostgreSQL.
    const before = new Set(objects);
    let arrivals = 0; let release;
    const gate = new Promise((resolve) => { release = resolve; });
    uploadBarrier = async () => { if (++arrivals === 2) release(); await gate; };
    const uploads = await Promise.all([1, 2].map(() => raw(documentsRoute, owner.cookie, 'POST', form())));
    uploadBarrier = undefined;
    assert.deepEqual(uploads.map((r) => r.status).sort(), [201, 409]); checks += 2;
    draft = (await request(route, owner.cookie)).data;
    assert.equal(draft.content.documents.length, 2);
    const winningIds = new Set(draft.content.documents.map((d) => d.storageObjectId));
    for (const id of [...objects].filter((id) => !before.has(id) && !winningIds.has(id))) {
      await assert.rejects(storage.get(id), (error) => error.name === 'NoSuchKey');
    }
    while (draft.content.documents.length < 20) draft = (await request(documentsRoute, owner.cookie, 201, 'POST', form())).data;
    await request(documentsRoute, owner.cookie, 400, 'POST', form());
    const relogin = await request('/auth/login', null, 200, 'POST', { email: emails[0], password });
    assert.deepEqual((await request(route, relogin.cookie)).data, draft);
    await pool.query('DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2', [org.id, owner.data.userId]);
    await request(route, relogin.cookie, 403);
    await request(download, relogin.cookie, 403);
    await request(documentsRoute, relogin.cookie, 403, 'POST', form());
    console.log(`Evidence smoke passed: ${checks} HTTP checks; bytes/hash, permissions, milestone identity, persistence and revision races verified.`);
  } finally {
    for (const id of objects) await storage.remove(id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM campaign_evidence_drafts WHERE campaign_metadata_id IN (SELECT id FROM campaign_metadata WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))', [emails]);
      await client.query('DELETE FROM campaign_milestone_drafts WHERE campaign_metadata_id IN (SELECT id FROM campaign_metadata WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))', [emails]);
      await client.query('DELETE FROM campaign_metadata WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
      await client.query('DELETE FROM organization_members WHERE organization_id IN (SELECT id FROM organizations WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))', [emails]);
      await client.query('DELETE FROM organizations WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
      await client.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
      await client.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
      await client.query('COMMIT');
      console.log('Temporary evidence objects/accounts/organization/campaign removed.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); await pool.end(); await app.close(); await app.get(DRIZZLE_DB).$client.end(); }
  }
}
main().catch((error) => { console.error(error.name, error.message); process.exitCode = 1; });
