import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { validateDeploymentContext, validateVNextDeploymentContext } = await server.ssrLoadModule('/src/lib/web3/deployment-policy.ts');
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

test('the VNext app context accepts only local deployment identity and shared wallet fields', () => {
  const vnext = validateVNextDeploymentContext({
    protocolKind: 'FUNDTOGETHER_VNEXT',
    chainId: 31339,
    rpcUrl: 'http://127.0.0.1:9548',
    campaignEscrow: '0x1111111111111111111111111111111111111111',
    juryRegistry: '0x2222222222222222222222222222222222222222',
    juryReview: '0x3333333333333333333333333333333333333333',
    tokenAddress: '0x4444444444444444444444444444444444444444',
    tokenDecimals: 6,
    policyHash: `0x${'5'.repeat(64)}`,
  });
  assert.equal(vnext.protocolKind, 'FUNDTOGETHER_VNEXT');
  assert.equal(vnext.tokenAddress, '0x4444444444444444444444444444444444444444');
  assert.equal(vnext.deploymentId, `0x${'5'.repeat(64)}`);
  assert.throws(() => validateVNextDeploymentContext({
    protocolKind: 'FUNDTOGETHER_VNEXT', chainId: 31339, rpcUrl: 'http://127.0.0.1:9549', tokenDecimals: 6,
  }), /RPC/);
});
