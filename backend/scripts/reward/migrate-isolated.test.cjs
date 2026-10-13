const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..', '..', '..');
const { migrateRewardDatabase } = require('./migrate-isolated.cjs');

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

async function main() {
  const environment = readEnvironment(path.join(root, '.local', 'reward', 'backend.env'));
  const adminUrl = new URL(environment.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const databaseName = `fundtogether_reward_test_${process.pid}`;
  const testUrl = new URL(environment.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const baseline = new Client({ connectionString: testUrl.toString() });
    await baseline.connect();
    let legacyCampaignId;
    let legacyEntitlementId;
    try {
      await baseline.query(fs.readFileSync(path.join(root, 'backend/drizzle/reward/0000_reward_baseline.sql'), 'utf8'));
      await baseline.query('CREATE TABLE reward_schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      await baseline.query("INSERT INTO reward_schema_migrations (id) VALUES ('0000_reward_baseline')");
      const { rows: [user] } = await baseline.query("INSERT INTO users (email) VALUES ('legacy@migration.test') RETURNING id");
      const { rows: [campaign] } = await baseline.query(`INSERT INTO reward_campaigns
        (creator_user_id, title, pitch, story, goal, policy_hash) VALUES ($1, 'Existing book', 'Existing pitch', 'Existing story', 100, $2) RETURNING id`,
        [user.id, `0x${'1'.repeat(64)}`]);
      legacyCampaignId = campaign.id;
      const { rows: [tier] } = await baseline.query(`INSERT INTO reward_tiers
        (campaign_id, tier_index, title, description, price, max_quantity, is_digital, reward_items)
        VALUES ($1, 0, 'Physical book', 'Existing obligation', 10, 50, false, '["Book"]') RETURNING id`, [campaign.id]);
      const { rows: [entitlement] } = await baseline.query(`INSERT INTO reward_entitlements
        (campaign_id,tier_id,backer_user_id,backer_wallet,amount_paid,status,shipping_encrypted,shipping_iv,shipping_tag,carrier_tracking_code)
        VALUES($1,$2,$3,$4,10,'REFUND_ELIGIBLE','TEST_CIPHERTEXT','TEST_IV','TEST_TAG','TEST_TRACKING') RETURNING id`, [campaign.id,tier.id,user.id,`0x${'2'.repeat(40)}`]);
      legacyEntitlementId = entitlement.id;
      const { rows: [batch] } = await baseline.query(`INSERT INTO reward_fulfillment_batches(campaign_id,batch_number,title,carrier,manifest_hash,shipped_item_count)
        VALUES($1,1,'Test archive batch','Test carrier',$2,1) RETURNING id`, [campaign.id,`0x${'3'.repeat(64)}`]);
      await baseline.query(`INSERT INTO reward_batch_entitlements(batch_id,entitlement_id,carrier_tracking_code) VALUES($1,$2,'TEST_TRACKING')`, [batch.id,entitlement.id]);
    } finally {
      await baseline.end();
    }
    const options = { databaseUrl: testUrl.toString(), expectedDatabaseName: databaseName };
    await assert.rejects(migrateRewardDatabase(root, options), /Physical obligations require/);
    const approval = new Client({ connectionString: testUrl.toString() });
    await approval.connect();
    try {
      // Test-only approval marker; real local approval is produced by the canonical RPC audit.
      await approval.query(`CREATE TABLE reward_physical_retirement_approvals(entitlement_id uuid PRIMARY KEY,row_hash text NOT NULL,evidence jsonb NOT NULL,approved_at timestamptz NOT NULL DEFAULT now())`);
      await approval.query(`INSERT INTO reward_physical_retirement_approvals SELECT id,md5(row_to_json(e)::text),'${JSON.stringify({ fixtureVerified: true })}'::jsonb,now() FROM reward_entitlements e`);
      await approval.query("UPDATE reward_entitlements SET shipping_encrypted='CHANGED_CIPHERTEXT'");
      await assert.rejects(migrateRewardDatabase(root, options), /Physical obligations require/);
      await approval.query(`UPDATE reward_physical_retirement_approvals a SET row_hash=md5(row_to_json(e)::text) FROM reward_entitlements e WHERE a.entitlement_id=e.id`);
    } finally { await approval.end(); }
    await migrateRewardDatabase(root, {
      databaseUrl: testUrl.toString(),
      expectedDatabaseName: databaseName,
    });
    await migrateRewardDatabase(root, {
      databaseUrl: testUrl.toString(),
      expectedDatabaseName: databaseName,
    });

    const database = new Client({ connectionString: testUrl.toString() });
    await database.connect();
    try {
      const { rows: tables } = await database.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      const names = new Set(tables.map((row) => row.table_name));
      const { rows: [archived] } = await database.query('SELECT original_entitlement FROM reward_archive.entitlement_delivery WHERE entitlement_id=$1', [legacyEntitlementId]);
      assert.equal(archived.original_entitlement.shipping_encrypted, 'CHANGED_CIPHERTEXT');
      assert.equal(archived.original_entitlement.carrier_tracking_code, 'TEST_TRACKING');
      assert.equal(archived.original_entitlement.status, 'REFUND_ELIGIBLE');
      assert.equal((await database.query('SELECT status,amount_paid FROM reward_entitlements WHERE id=$1', [legacyEntitlementId])).rows[0].status, 'REFUND_ELIGIBLE');
      assert.equal((await database.query('SELECT count(*) FROM reward_archive.reward_batch_entitlements')).rows[0].count, '1');
      assert.equal((await database.query(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='reward_entitlements' AND column_name ~ 'shipping|tracking|delivered_at|confirmed_at'`)).rows[0].count, '0');
      assert.ok(!names.has('reward_fulfillment_batches') && !names.has('reward_batch_entitlements'));
      await assert.rejects(database.query('DELETE FROM reward_archive.entitlement_delivery'), /Retained history is immutable/);
      await assert.rejects(database.query('TRUNCATE reward_archive.reward_batch_entitlements'), /Retained history is immutable/);
      // Canonical rollback may remove a live entitlement without deleting its archived snapshot.
      await database.query('DELETE FROM reward_entitlements WHERE id=$1', [legacyEntitlementId]);
      assert.equal((await database.query('SELECT count(*) FROM reward_archive.entitlement_delivery')).rows[0].count, '1');
      const { rows: [legacy] } = await database.query('SELECT category, draft_config, policy_hash FROM reward_campaigns WHERE id = $1', [legacyCampaignId]);
      assert.deepEqual(legacy, { category: 'COMICS', draft_config: null, policy_hash: `0x${'1'.repeat(64)}` });
      const { rows: [tier] } = await database.query('SELECT max_quantity, is_digital, reward_items FROM reward_tiers WHERE campaign_id = $1', [legacyCampaignId]);
      assert.deepEqual(tier, { max_quantity: 50, is_digital: false, reward_items: ['Book'] });
      const { rows: editionColumns } = await database.query(`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'reward_campaigns' AND column_name IN ('draft_config', 'policy_hash')
        ORDER BY column_name
      `);
      assert.deepEqual(editionColumns, [
        { column_name: 'draft_config', is_nullable: 'YES' },
        { column_name: 'policy_hash', is_nullable: 'YES' },
      ]);
      const { rows: migrations } = await database.query('SELECT id FROM reward_schema_migrations ORDER BY id');
      assert.deepEqual(migrations.map(row => row.id), ['0000_reward_baseline', '0001_reward_editions_drafts', '0002_reward_editions_review', '0003_reward_editions_chain', '0004_reward_editions_delivery', '0005_reward_physical_retirement']);
      const required = [
        'users', 'wallet_links', 'auth_sessions', 'auth_challenges',
        'organizations', 'organization_members', 'platform_roles',
        'indexer_streams', 'chain_events', 'reward_schema_migrations',
        'reward_creator_profiles', 'reward_campaigns', 'reward_reviews',
        'reward_tiers', 'reward_entitlements',
         'reward_disputes', 'reward_campaign_projection', 'reward_editions_samples', 'editions_chain_campaigns', 'editions_entitlements', 'editions_evidence', 'editions_feedback', 'editions_download_tickets',
      ];
      for (const name of required) assert.ok(names.has(name), `missing table ${name}`);

      const foreignKey = async (table, column) => {
        const { rows } = await database.query(`
          SELECT ccu.table_name AS referenced_table
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = $1
            AND kcu.column_name = $2
        `, [table, column]);
        return rows.map((row) => row.referenced_table);
      };

      assert.deepEqual(await foreignKey('reward_campaigns', 'creator_user_id'), ['users']);
      assert.deepEqual(await foreignKey('reward_campaign_projection', 'stream_id'), ['indexer_streams']);
      assert.equal([...names].some((name) => /^(campaigns|milestones|campaign_chain_projection)$|disbursement|^hed_/i.test(name)), false);
    } finally {
      await database.end();
    }
  } finally {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
}

main()
  .then(() => console.log('reward isolated migration audit passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
