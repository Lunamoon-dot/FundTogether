import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { validateDeploymentContext } = await server.ssrLoadModule('/src/lib/web3/deployment-policy.ts');
const fixture = JSON.parse(await readFile(new URL('../test/fixtures/campaign-deployment.test.json', import.meta.url), 'utf8'));

after(async () => server.close());

test('the deterministic test deployment satisfies the unchanged runtime policy', () => {
  assert.equal(validateDeploymentContext(fixture).policyHash, fixture.policyHash);
});

test('deployment policy still rejects zero identity sentinels', () => {
  assert.throws(
    () => validateDeploymentContext({ ...fixture, policyHash: `0x${'0'.repeat(64)}` }),
    /policyHash/,
  );
});

test('deployment policy still rejects malformed or non-local identities', () => {
  assert.throws(() => validateDeploymentContext({ ...fixture, rpcUrl: 'https://rpc.example' }), /RPC/);
  assert.throws(() => validateDeploymentContext({ ...fixture, judges: [fixture.judges[0], fixture.judges[0], fixture.judges[2]] }), /Judge pool/);
});
