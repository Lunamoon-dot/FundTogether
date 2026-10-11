const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../../..');
const apiUrl = process.env.HED_API_URL || 'http://127.0.0.1:3002';

test('isolated HED runtime is ready and matches its immutable manifest', async () => {
  const manifest = JSON.parse(readFileSync(path.join(root, '.local/hed/generated/deployment.local.json'), 'utf8'));
  const response = await fetch(`${apiUrl}/health`);
  assert.equal(response.ok, true, 'HED health endpoint must be available');
  const health = await response.json();
  assert.equal(health.status, 'ready');
  assert.equal(health.indexer?.status, 'ready');
  for (const key of ['protocolKind', 'chainId', 'contractAddress', 'tokenAddress', 'policyHash', 'abiVersion', 'resolver', 'backupResolver'])
    assert.equal(String(health.context?.[key]).toLowerCase(), String(manifest[key]).toLowerCase(), `health ${key}`);
});

test('isolated HED runtime exposes the organization API', async () => {
  const response = await fetch(`${apiUrl}/organizations`);
  assert.equal(response.status, 401, 'organization API must be registered and require a session');
});
