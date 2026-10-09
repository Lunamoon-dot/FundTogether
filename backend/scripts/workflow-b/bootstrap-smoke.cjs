const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

async function main() {
  // Separate verification process: no server listener and no DB/storage I/O.
  Object.assign(process.env, require('dotenv').parse(fs.readFileSync(path.join(root, 'backend/environments/workflow-b/.env.example'))),
    { LOG_LEVEL: 'silent', INDEXER_ENABLED: 'false' });
  require('./guard-environment.cjs').guardEnvironment(process.env);
  const { Pool } = require('pg');
  let databaseConnections = 0;
  Pool.prototype.connect = function () {
    databaseConnections++;
    throw new Error('Workflow B bootstrap must not connect to a database during this check');
  };
  const { NestFactory } = require('@nestjs/core');
  const { AdvanceAppModule } = require(path.join(root, 'backend/dist/src/advance/advance-app.module.js'));
  const { AdvanceBlockchainService } = require(path.join(root, 'backend/dist/src/advance/advance-blockchain.service.js'));
  const app = await NestFactory.create(AdvanceAppModule, { logger: false, abortOnError: false });
  try {
    await app.init();
    const blockchain = app.get(AdvanceBlockchainService);
    assert.equal(blockchain.context.chainId, 31338);
    const nextCampaignId = await blockchain.read('nextCampaignId', []);
    assert.equal(typeof nextCampaignId, 'bigint');
    assert.equal(databaseConnections, 0);
    console.log(`Workflow B DI/bootstrap + live deployment identity PASS; nextCampaignId${nextCampaignId}, DB connections0, no listener`);
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
