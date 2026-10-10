// Private disposable browser sessions for synthetic OWNER/ADMIN only; no real passwords or extension keys.
const fs = require('node:fs'), path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg'), { drizzle } = require('drizzle-orm/node-postgres');
const { ConfigService } = require('@nestjs/config'), { SiweMessage } = require('siwe');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const root = path.resolve(__dirname, '../../..'), from = name => require(path.join(root, 'backend/dist/src', name));
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });
async function main() {
  require('./guard-environment.cjs').guardEnvironment(process.env);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool, { schema: from('database/schema') });
    const auth = new (from('modules/auth/auth.service').AuthService)(new ConfigService(from('config/env.config').configuration()), db);
    const orgs = new (from('modules/organizations/organizations.service').OrganizationsService)(db);
    const output = path.join(root, '.local/workflow-b/onboarding-ui'); fs.mkdirSync(output, { recursive: true });
    const owner = await auth.register(`ui-owner-${randomUUID()}@workflow-b.invalid`, randomBytes(24).toString('hex'));
    const admin = await auth.register(`ui-admin-${randomUUID()}@workflow-b.invalid`, randomBytes(24).toString('hex'));
    await pool.query('insert into platform_roles(user_id,roles) values($1,$2)', [admin.account.userId, '["ADMIN"]']);
    const signer = privateKeyToAccount(generatePrivateKey()), nonce = await auth.createNonce(owner.token);
    const message = new SiweMessage({ scheme: 'http', domain: nonce.domain, uri: nonce.uri, address: signer.address, version: '1',
      chainId: nonce.chainId, nonce: nonce.nonce, issuedAt: new Date().toISOString(), statement: 'Synthetic onboarding browser test' }).prepareMessage();
    await auth.linkWallet(owner.account.userId, owner.token, message, await signer.signMessage({ message }));
    const org = await orgs.create(owner.account.userId, { name: 'SYNTHETIC UI verification group', description: 'Local automated UI check only' });
    await orgs.bindWallet(org.id, owner.account.userId, { address: signer.address, chainId: 31338 });
    for (const [name, session] of [['owner', owner], ['admin', admin]]) fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify({ cookies: [{
      name: 'ft_workflow_b_session', value: session.token, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600,
    }], origins: [] }));
    fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify({ organizationId: org.id, ownerId: owner.account.userId, adminId: admin.account.userId }));
    fs.writeFileSync(path.join(output, 'synthetic.pdf'), require('./organization-onboarding-fixture.cjs').documentBytes());
    console.log(JSON.stringify({ organizationId: org.id, storageStates: 'ignored onboarding-ui/owner.json and admin.json', sourceChainWrites: 0 }));
  } finally { await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
