const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('reflect-metadata');

test('compiled B module uses shared auth/storage but never mounts A chain/controllers/indexer', async () => {
  const { AdvanceAppModule } = require(path.resolve(__dirname, '../../dist/src/advance/advance-app.module.js'));
  const names = new Set(), seen = new Set();
  async function walk(value) {
    const resolved = await value;
    const module = resolved?.module || resolved;
    if (typeof module !== 'function' || seen.has(module)) return;
    seen.add(module);
    names.add(module.name);
    for (const key of ['providers', 'controllers']) {
      for (const entry of [...(Reflect.getMetadata(key, module) || []), ...(resolved?.[key] || [])]) {
        names.add((entry.useClass || entry).name || String(entry.provide));
      }
    }
    for (const child of [...(Reflect.getMetadata('imports', module) || []), ...(resolved?.imports || [])]) await walk(child);
  }
  await walk(AdvanceAppModule);
  for (const name of ['AuthModule', 'AuthGuard', 'BrowserOriginGuard', 'AuthController', 'OrganizationsModule',
    'DatabaseModule', 'EvidenceStorageService', 'EvidenceAccessService', 'AdvanceBlockchainService']) {
    assert.ok(names.has(name), `B dependency missing:${name}`);
  }
  for (const name of ['BlockchainModule', 'BlockchainService', 'IndexerModule', 'IndexerService',
    'CampaignsModule', 'CampaignsController', 'EvidenceModule', 'MilestoneWorkflowService']) {
    assert.ok(!names.has(name), `A dependency mounted:${name}`);
  }
});
