// Synthetic B accounts/drafts only. Wallets are linked by the person using the app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { guardEnvironment } = require('./guard-environment.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const { giftPlan } = require('./pilot-fixtures.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });

async function main() {
  guardEnvironment(process.env);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const { AdvanceBlockchainService } = require(path.join(root, 'backend/dist/src/advance/advance-blockchain.service'));
  const chain = new AdvanceBlockchainService(manifest); await chain.verifyDeployment();
  const file = path.join(root, '.local/workflow-b/manual-accounts.json');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { deploymentId: manifest.deploymentId, accounts: {}, receipts: [] };
  assert.equal(saved.deploymentId, manifest.deploymentId, 'Existing seed belongs to another deployment; preserve it');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  async function request(actor, method, route, body, expected = 200) {
    const response = await fetch('http://127.0.0.1:3001' + route, { method, headers: { Origin: process.env.WEB_ORIGIN,
      ...(actor?.cookie ? { Cookie: actor.cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
    return { response, data };
  }
  try {
    const health = (await request(null, 'GET', '/health')).data;
    assert.deepEqual(health.context, chain.context); assert.equal(health.status, 'ready');
    const actors = {};
    for (const name of ['resolver', 'organizer', 'donorA', 'donorB', 'staff']) {
      const credentials = saved.accounts[name] ?? { email: `manual-b-${name.toLowerCase()}@workflow-b.invalid`, password: randomBytes(24).toString('hex') };
      assert.ok(credentials.email?.endsWith('@workflow-b.invalid'), 'Seed only manages synthetic accounts');
      saved.accounts[name] = credentials; atomicWrite(file, saved);
      const [existing] = (await pool.query('select id from users where email=$1', [credentials.email.toLowerCase()])).rows;
      if (credentials.userId) assert.equal(existing?.id, credentials.userId, 'Saved fixture account changed; preserve it');
      const actor = {};
      if (credentials.password) {
        const registered = await request(null, 'POST', existing ? '/auth/login' : '/auth/register', { email: credentials.email, password: credentials.password }, existing ? 200 : 201);
        actor.cookie = registered.response.headers.get('set-cookie').split(';')[0]; actor.id = registered.data.userId;
      } else {
        // Retain historical smoke accounts without resetting their passwords or signing as them.
        assert.ok(existing && name !== 'organizer', 'Saved organizer password required to prepare drafts');
        actor.id = existing.id;
      }
      const roles = name === 'resolver' ? ['RESOLVER'] : name === 'staff' ? ['ADMIN'] : [];
      const [storedRole] = (await pool.query('select roles from platform_roles where user_id=$1', [actor.id])).rows;
      if (storedRole) assert.deepEqual(storedRole.roles, roles, 'Existing roles differ; do not overwrite');
      else await pool.query('insert into platform_roles(user_id,roles) values($1,$2)', [actor.id, JSON.stringify(roles)]);
      saved.accounts[name] = { ...saved.accounts[name], userId: actor.id, roles }; atomicWrite(file, saved);
      actors[name] = actor;
    }
    if (!saved.organizationId) {
      const org = (await request(actors.organizer, 'POST', '/organizations', { name: 'Synthetic B manual pilot organization',
        description: 'Controlled local demonstration; no real beneficiary or institution' }, 201)).data;
      saved.organizationId = org.id; atomicWrite(file, saved);
    }
    // Create editable drafts; the human verifies/freezes/submits them during acceptance.
    const drafts = (await request(actors.organizer, 'GET', `/v1/advance/organizations/${saved.organizationId}/campaigns`)).data;
    for (const [key, count] of [['G1', 1], ['G2', 3]]) {
      const title = `Synthetic manual ${key} pilot`;
      const found = drafts.find(d => d.title === title);
      const draft = found ?? (await request(actors.organizer, 'POST', `/v1/advance/organizations/${saved.organizationId}/campaigns`, { ...giftPlan(count), title }, 201)).data;
      saved[key] = draft.id;
    }
    saved.walletLinking = 'manual';
    saved.updatedAt = new Date().toISOString(); atomicWrite(file, saved);
    console.log('Workflow B seed PASS: synthetic accounts/roles and editable G1/G2 drafts. No wallets linked, organization wallet selected, or tokens minted. Link and fund the actual chosen wallets separately; credentials remain in ignored manual-accounts.json.');
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
