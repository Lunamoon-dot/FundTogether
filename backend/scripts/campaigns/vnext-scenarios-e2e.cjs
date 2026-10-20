const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { migrateCampaignDatabase } = require('./migrate-isolated.cjs');
const { main: runAcceptance } = require('./vnext-acceptance.cjs');

const root = path.resolve(__dirname, '../../..');
const environment = require('dotenv').parse(fs.readFileSync(path.join(root, '.local/fundtogether/backend.env')));
const databaseName = `fundtogether_vnext_accept_${process.pid}`;
let admin;

async function main() {
  const source = new URL(environment.DATABASE_URL);
  source.pathname = '/postgres';
  admin = new Client({ connectionString: source.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const target = new URL(environment.DATABASE_URL);
  target.pathname = `/${databaseName}`;
  await migrateCampaignDatabase(root, { databaseUrl: target.toString(), expectedDatabaseName: databaseName });
  process.env.FUNDTOGETHER_VNEXT_DATABASE_URL = target.toString();
  try {
    await runAcceptance();
  } finally {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`).catch(() => undefined);
    await admin.end();
    admin = undefined;
  }
}

if (require.main === module) {
  main().catch(async error => {
    console.error(error.stack || error.message);
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
    process.exitCode = 1;
  });
}

module.exports = { main };
