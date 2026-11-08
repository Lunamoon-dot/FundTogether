const path = require('node:path');
const { parse } = require('dotenv');
const fs = require('node:fs');
const { migrateVNextDemoDatabase } = require('./migrate-isolated.cjs');

const root = path.resolve(__dirname, '../../..');
const environmentPath = process.argv[2] || process.env.FUNDTOGETHER_VNEXT_ENV_PATH || path.join(root, '.local/fundtogether/vnext-demo.env');

async function main() {
  const environment = parse(fs.readFileSync(environmentPath, 'utf8'));
  const databaseUrl = environment.FUNDTOGETHER_VNEXT_DATABASE_URL || environment.DATABASE_URL;
  const target = new URL(databaseUrl);
  const expectedDatabaseName = decodeURIComponent(target.pathname.slice(1));
  await migrateVNextDemoDatabase(root, {
    databaseUrl,
    expectedDatabaseName,
    expectedPort: environment.POSTGRES_PORT,
  });
  console.log(`Migrated isolated VNext demo database ${expectedDatabaseName}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
