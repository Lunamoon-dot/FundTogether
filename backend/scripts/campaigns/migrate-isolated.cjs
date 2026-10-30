const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { guardEnvironment } = require('./guard-environment.cjs');

const migrationIds = ['0000_fundtogether_baseline', '0001_campaigns_namespace_cleanup', '0002_remove_delivery_estimate', '0003_campaign_pledge_quantities', '0004_creator_studio_wallet', '0005_review_conversation_limits', '0006_historical_dispute_integrity', '0007_campaign_payout_requests', '0008_campaign_completion_surplus', '0009_surplus_claim_reorg_history', '0010_campaign_payout_file_purposes', '0011_vnext_projections', '0012_vnext_case_evidence', '0013_vnext_financial_read_models', '0014_vnext_evidence_access_tickets', '0015_vnext_court_dashboard'];

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

async function migrateCampaignDatabase(root, options = {}) {
  const environment = readEnvironment(path.join(root, '.local', 'fundtogether', 'backend.env'));
  const { databaseName } = guardEnvironment(environment);
  const databaseUrl = options.databaseUrl || environment.DATABASE_URL;
  const expectedDatabaseName = options.expectedDatabaseName || databaseName;
  const target = new URL(databaseUrl);

  if (target.pathname !== `/${expectedDatabaseName}`) {
    throw new Error(`Campaign migration must target ${expectedDatabaseName}`);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS fundtogether_schema_migrations (
        id text PRIMARY KEY NOT NULL,
        applied_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    for (const migrationId of migrationIds) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM fundtogether_schema_migrations WHERE id = $1', [migrationId],
      );
      if (!rowCount) {
        const sql = fs.readFileSync(path.join(root, 'backend', 'drizzle', 'fundtogether', `${migrationId}.sql`), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO fundtogether_schema_migrations (id) VALUES ($1)', [migrationId]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..', '..');
  migrateCampaignDatabase(root)
    .then(() => console.log('FundTogether database migration complete'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { migrateCampaignDatabase };
