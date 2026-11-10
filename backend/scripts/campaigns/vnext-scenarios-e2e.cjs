const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { migrateVNextDemoDatabase } = require('./migrate-isolated.cjs');
const { main: runAcceptance } = require('./vnext-acceptance.cjs');

const root = path.resolve(__dirname, '../../..');
const environmentPath = process.env.FUNDTOGETHER_VNEXT_ENV_PATH
  || path.join(root, '.local/fundtogether/vnext-demo.env');
const environment = require('dotenv').parse(fs.readFileSync(environmentPath));
const databaseName = `fundtogether_vnext_accept_${crypto.randomUUID().replaceAll('-', '')}`;
let admin;
let databaseCreated = false;

async function main() {
  const database = new URL(environment.DATABASE_URL);
  database.pathname = '/postgres';
  admin = new Client({ connectionString: database.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  database.pathname = `/${databaseName}`;
  const databaseUrl = database.toString();
  await migrateVNextDemoDatabase(root, {
    databaseUrl,
    expectedDatabaseName: databaseName,
    expectedPort: database.port,
  });
  Object.assign(process.env, environment, {
    DATABASE_URL: databaseUrl,
    FUNDTOGETHER_VNEXT_DATABASE_URL: databaseUrl,
    FUNDTOGETHER_VNEXT_ENV_PATH: environmentPath,
  });
  await runAcceptance();
}

async function cleanup() {
  if (admin && databaseCreated) {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`).catch(() => undefined);
  }
  await admin?.end().catch(() => undefined);
}

if (require.main === module) {
  main()
    .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; })
    .finally(cleanup);
}

module.exports = { main };
