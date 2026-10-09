const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate: migrateOrm } = require('drizzle-orm/node-postgres/migrator');
const { migrate } = require('./migrate-isolated.cjs');
const { guardEnvironment } = require('./guard-environment.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });

async function main() {
  guardEnvironment(process.env);
  const baseline = path.join(root, '.local/workflow-b/migration-baseline');
  const source = path.join(root, 'backend/drizzle');
  const journal = JSON.parse(fs.readFileSync(path.join(source, 'meta/_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter(x => x.idx < 13);
  atomicWrite(path.join(baseline, 'meta/_journal.json'), journal);
  for (const entry of journal.entries) fs.copyFileSync(path.join(source, `${entry.tag}.sql`), path.join(baseline, `${entry.tag}.sql`));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    assert.equal((await pool.query('select current_database() as name')).rows[0].name, 'fundtogether_workflow_b');
    await migrateOrm(drizzle(pool), { migrationsFolder: baseline });
    const [user] = (await pool.query(`insert into users(email,password_hash) values('migration-fixture@workflow-b.invalid','synthetic migration fixture')
      on conflict(email) do update set email=excluded.email returning id`)).rows;
    let [org] = (await pool.query('select id from organizations where created_by_user_id=$1 and name=$2', [user.id, 'B migration fixture'])).rows;
    if (!org) [org] = (await pool.query('insert into organizations(name,description,created_by_user_id) values($1,$2,$3) returning id',
      ['B migration fixture', 'Synthetic migration preservation check', user.id])).rows;
    await pool.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'OWNER') on conflict do nothing`, [org.id, user.id]);
    const preserved = async () => {
      const users = (await pool.query('select * from users order by id')).rows;
      const members = (await pool.query('select * from organization_members order by organization_id,user_id')).rows;
      return createHash('sha256').update(JSON.stringify({ users, members })).digest('hex');
    };
    const before = await preserved();
    migrate();
    const after = await preserved();
    assert.equal(after, before);
    assert.equal(Number((await pool.query('select count(*) as count from drizzle.__drizzle_migrations')).rows[0].count), 14);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
    const h = n => `0x${n.toString(16).padStart(64, '0')}`;
    const gift = { activityType: 'GIFT_DISTRIBUTION', channel: 'INSTITUTION', checklistVersion: 'gift.v1', stages: [{}] };
    let checks = 0;
    const invalid = async (delta, expectedCode = '23514', noMetadata = false) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const metadataId = randomUUID();
        if (!noMetadata) await client.query(`insert into campaign_metadata(id,organization_id,title) values($1,$2,'Synthetic constraint check')`, [metadataId, org.id]);
        const row = { deployment_id: manifest.deploymentId, chain_id: 31338, contract_address: manifest.contractAddress,
          gift_config: gift, funding_duration: '604800', ...delta };
        const fields = Object.keys(row);
        await assert.rejects(client.query(`insert into advance_campaign_plans(campaign_metadata_id,${fields.join(',')})
          values($1,${fields.map((_, i) => `$${i + 2}`).join(',')})`, [metadataId, ...Object.values(row)]), e => e.code === expectedCode);
        checks++;
      } finally { await client.query('rollback'); client.release(); }
    };
    await invalid({ chain_id: 31337 });
    await invalid({ deployment_id: h(0) });
    await invalid({ contract_address: `0x${'0'.repeat(40)}` });
    await invalid({ funding_duration: '86399' });
    await invalid({ gift_config: {} });
    await invalid({ gift_config: { ...gift, channel: 'OTHER' } });
    await invalid({ frozen_at: new Date(), plan_hash: h(1) });
    await invalid({}, '23503', true);
    const client = await pool.connect();
    try {
      await client.query('begin');
      const ids = [randomUUID(), randomUUID()];
      for (const id of ids) await client.query(`insert into campaign_metadata(id,organization_id,title) values($1,$2,'Synthetic unique-key check')`, [id, org.id]);
      const values = [manifest.deploymentId, manifest.contractAddress, gift, `0x${'b'.repeat(40)}`, h(2), '{}', h(3)];
      const insert = `insert into advance_campaign_plans(campaign_metadata_id,deployment_id,chain_id,contract_address,gift_config,funding_duration,
        organizer_wallet,draft_key,frozen_plan_bytes,plan_hash,frozen_at) values($1,$2,31338,$3,$4,604800,$5,$6,$7,$8,now())`;
      await client.query(insert, [ids[0], ...values]);
      await assert.rejects(client.query(insert, [ids[1], ...values]), e => e.code === '23505');
      checks++;
    } finally { await client.query('rollback'); client.release(); }
    migrate(); // Restart/reapply must not mutate schema/data or duplicate journal rows.
    assert.equal(await preserved(), before);
    assert.equal(Number((await pool.query('select count(*) as count from drizzle.__drizzle_migrations')).rows[0].count), 14);
    const report = { database: 'fundtogether_workflow_b', port: 5434, migrations: 14, preservationHash: before,
      userAndMembershipUnchanged: true, constraintsRejected: checks, repeatMigration: 'PASS' };
    atomicWrite(path.join(root, '.local/workflow-b/migration-report.json'), report);
    console.log('Workflow B real migration/preservation/constraints PASS:', JSON.stringify(report));
  } finally { await pool.end(); }
}
main().catch(error => { console.error('Workflow B migration verification failed:', error.code || error.message); process.exitCode = 1; });
