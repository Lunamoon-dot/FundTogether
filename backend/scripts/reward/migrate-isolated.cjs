const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { guardEnvironment } = require('./guard-environment.cjs');

const migrationId = '0000_reward_baseline';

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

async function migrateRewardDatabase(root, options = {}) {
  const environment = readEnvironment(path.join(root, '.local', 'reward', 'backend.env'));
  const { databaseName } = guardEnvironment(environment);
  const databaseUrl = options.databaseUrl || environment.DATABASE_URL;
  const expectedDatabaseName = options.expectedDatabaseName || databaseName;
  const target = new URL(databaseUrl);

  if (target.pathname !== `/${expectedDatabaseName}`) {
    throw new Error(`Reward migration must target ${expectedDatabaseName}`);
  }

  const sql = fs.readFileSync(
    path.join(root, 'backend', 'drizzle', 'reward', '0000_reward_baseline.sql'),
    'utf8',
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reward_schema_migrations (
        id text PRIMARY KEY NOT NULL,
        applied_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    const { rowCount } = await client.query(
      'SELECT 1 FROM reward_schema_migrations WHERE id = $1',
      [migrationId],
    );
    if (!rowCount) {
      await client.query(sql);
      await client.query('INSERT INTO reward_schema_migrations (id) VALUES ($1)', [migrationId]);
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
  migrateRewardDatabase(root)
    .then(() => console.log('Reward database migration complete'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { migrateRewardDatabase };
