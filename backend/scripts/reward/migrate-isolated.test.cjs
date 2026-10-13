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
      const required = [
        'users', 'wallet_links', 'auth_sessions', 'auth_challenges',
        'organizations', 'organization_members', 'platform_roles',
        'indexer_streams', 'chain_events', 'reward_schema_migrations',
        'reward_creator_profiles', 'reward_campaigns', 'reward_reviews',
        'reward_tiers', 'reward_entitlements', 'reward_fulfillment_batches',
        'reward_batch_entitlements', 'reward_disputes', 'reward_campaign_projection',
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
