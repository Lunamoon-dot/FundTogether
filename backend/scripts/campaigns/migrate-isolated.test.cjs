const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..', '..', '..');
const { migrateCampaignDatabase } = require('./migrate-isolated.cjs');

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
  const environment = readEnvironment(path.join(root, '.local', 'fundtogether', 'backend.env'));
  const adminUrl = new URL(environment.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const databaseName = `fundtogether_baseline_${process.pid}`;
  const testUrl = new URL(environment.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const options = { databaseUrl: testUrl.toString(), expectedDatabaseName: databaseName };

    await migrateCampaignDatabase(root, options);
    await migrateCampaignDatabase(root, options);

    const database = new Client({ connectionString: testUrl.toString() });
    await database.connect();
    try {
      const { rows: publicTables } = await database.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      const publicNames = new Set(publicTables.map((row) => row.table_name));
      const required = [
        'users', 'wallet_links', 'auth_sessions', 'auth_challenges',
        'platform_roles', 'indexer_streams', 'chain_events',
        'fundtogether_schema_migrations', 'campaigns_creator_profiles', 'campaigns',
        'campaigns_reviews', 'campaigns_tiers', 'historical_entitlements', 'historical_disputes',
        'historical_campaign_projection', 'campaigns_samples', 'campaigns_chain_campaigns',
        'campaigns_entitlements', 'campaigns_evidence', 'campaigns_feedback',
        'campaigns_download_tickets', 'campaigns_creator_responses',
        'campaigns_creator_response_feedback', 'campaigns_review_threads',
        'campaigns_review_messages', 'campaigns_review_escalations',
        'vnext_chain_events', 'vnext_campaign_projections',
        'vnext_milestone_projections', 'vnext_review_projections',
        'vnext_judge_assignments',
      ];
      for (const name of required) assert.ok(publicNames.has(name), `missing table ${name}`);
      const { rows: milestoneColumns } = await database.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vnext_milestone_projections'
          AND column_name IN ('submission_deadline', 'correction_deadline')
      `);
      assert.deepEqual(
        milestoneColumns.map((row) => row.column_name).sort(),
        ['correction_deadline', 'submission_deadline'],
      );
      assert.equal(publicNames.has('campaign_fulfillment_batches'), false);
      assert.equal(publicNames.has('campaign_batch_entitlements'), false);
      assert.equal(publicNames.has('organizations'), false);
      assert.equal(publicNames.has('organization_members'), false);

      const { rows: archiveTables } = await database.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'campaign_archive' AND table_type = 'BASE TABLE'
      `);
      const archiveNames = new Set(archiveTables.map((row) => row.table_name));
      for (const name of [
        'entitlement_delivery', 'campaign_history', 'campaign_fulfillment_batches',
        'campaign_batch_entitlements', 'campaign_physical_retirement_approvals',
      ]) assert.ok(archiveNames.has(name), `missing archive table ${name}`);

      const { rows: migrations } = await database.query('SELECT id FROM fundtogether_schema_migrations ORDER BY id');
      assert.deepEqual(migrations.map((row) => row.id), [
        '0000_fundtogether_baseline', '0001_campaigns_namespace_cleanup',
        '0002_remove_delivery_estimate', '0003_campaign_pledge_quantities',
        '0004_creator_studio_wallet', '0005_review_conversation_limits',
        '0006_historical_dispute_integrity', '0007_campaign_payout_requests',
        '0008_campaign_completion_surplus', '0009_surplus_claim_reorg_history',
        '0010_campaign_payout_file_purposes', '0011_vnext_projections',
        '0012_vnext_milestone_state',
      ]);

      assert.equal(
        (await database.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='historical_entitlements' AND column_name ~ 'shipping|tracking|delivered_at|confirmed_at'")).rows[0].count,
        '0',
      );
      assert.equal(
        (await database.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='review_deadline_at'")).rows[0].count,
        '0',
      );
      assert.equal(
        (await database.query("SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns_creator_profiles' AND column_name='original_work_pledge'")).rows[0].column_default,
        null,
      );

      const counts = await database.query(`
        SELECT
          (SELECT count(*) FROM campaigns) AS campaigns,
          (SELECT count(*) FROM campaigns_feedback) AS feedback,
          (SELECT count(*) FROM campaigns_entitlements) AS entitlements
      `);
      assert.deepEqual(counts.rows[0], { campaigns: '0', feedback: '0', entitlements: '0' });
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
  .then(() => console.log('FundTogether baseline migration audit passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
