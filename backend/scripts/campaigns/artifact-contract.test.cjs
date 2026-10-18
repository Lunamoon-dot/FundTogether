const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { artifacts, generate, hashJson, policy, validateManifest, verifyDeployment } = require('./generate-historical-artifacts.cjs');
const { generateCampaign } = require('./generate-campaign-artifacts.cjs');
const { deploymentRoles, verifyFixtureRoleMapping } = require('./deploy-campaign.cjs');
const { ACCOUNT_DEFINITIONS, assertDeploymentRoles } = require('./seed-local-accounts.cjs');

const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const manifest = () => ({ protocolKind: 'CAMPAIGNS', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548',
  contractAddress: address(1), tokenAddress: address(2), resolver: address(3), backupResolver: address(4),
  genesisHash: hash(5), contractCodeHash: hash(6), tokenCodeHash: hash(7), deploymentBlockNumber: '2',
  deploymentBlockHash: hash(8), tokenDecimals: 6, confirmations: 1, abiVersion: '1', abiHash: hashJson([]), policyHash: hashJson(policy) });

test('FundTogether artifacts reject incomplete Foundry output and export deterministically', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-campaign-artifacts-'));
  try {
    assert.throws(() => artifacts(tmp), /artifact|ENOENT/);
    const root = path.resolve(__dirname, '../../..');
    const one = artifacts(root);
    assert.ok(one.runtimeBytes > 0 && one.runtimeBytes <= 24576);
    const output = path.join(tmp, 'generated');
    generate(root, output);
    assert.ok(fs.existsSync(path.join(output, 'fund-together-historical-campaign.abi.json')));
    assert.ok(fs.existsSync(path.join(output, 'mock-usdc.abi.json')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Campaign artifact rejects stale Foundry source metadata before exporting ABI', () => {
  const root = path.resolve(__dirname, '../../..');
  const generated = generateCampaign(root);
  assert.ok(generated.abiHash.startsWith('0x'));
  assert.ok(generated.policyHash.startsWith('0x'));
});

test('Campaign deployment keeps the Creator fixture separate from resolver wallets', () => {
  const accounts = [address(1), address(2), address(3), address(4)];
  const roles = deploymentRoles(accounts);
  assert.equal(roles.deployer, accounts[0]);
  assert.equal(roles.resolver, accounts[1]);
  assert.equal(roles.backupResolver, accounts[2]);
  assert.notEqual(accounts[3], roles.resolver);
  assert.notEqual(accounts[3], roles.backupResolver);
});

test('Local fixture keeps Admin separate from Resolver accounts', () => {
  assert.deepEqual(ACCOUNT_DEFINITIONS.map(({ accountIndex, email, platformRoles }) => ({ accountIndex, email, platformRoles })), [
    { accountIndex: 0, email: 'admin@fundtogether.com', platformRoles: ['ADMIN'] },
    { accountIndex: 1, email: 'resolver@fundtogether.com', platformRoles: ['RESOLVER'] },
    { accountIndex: 2, email: 'backup-resolver@fundtogether.com', platformRoles: ['RESOLVER'] },
    { accountIndex: 3, email: 'creator@fundtogether.com', platformRoles: [] },
    { accountIndex: 4, email: 'backer1@fundtogether.com', platformRoles: [] },
    { accountIndex: 5, email: 'backer2@fundtogether.com', platformRoles: [] },
  ]);
});

test('Local seeding rejects a manifest deployed with a different resolver mapping', () => {
  const accounts = [address(1), address(2), address(3), address(4), address(5), address(6)];
  assert.doesNotThrow(() => assertDeploymentRoles({ resolver: accounts[1], backupResolver: accounts[2] }, accounts));
  assert.throws(() => assertDeploymentRoles({ resolver: accounts[0], backupResolver: accounts[1] }, accounts), /does not match/);
});

test('Deployment verification rejects an outdated local account mapping', async () => {
  const accounts = [address(1), address(2), address(3)];
  const client = { request: async () => accounts };
  await assert.doesNotReject(verifyFixtureRoleMapping(client, { resolver: accounts[1], backupResolver: accounts[2] }));
  await assert.rejects(verifyFixtureRoleMapping(client, { resolver: accounts[0], backupResolver: accounts[1] }), /outdated local account mapping/);
});

test('FundTogether manifest rejects a wrong protocol, endpoint, or deployment identity', () => {
  validateManifest(manifest());
  for (const delta of [{ protocolKind: 'INVALID' }, { chainId: 31338 }, { rpcUrl: 'http://127.0.0.1:9547' },
    { contractAddress: address(0) }, { backupResolver: address(3) }, { deploymentBlockNumber: '0' }, { tokenDecimals: 18 }]) {
    assert.throws(() => validateManifest({ ...manifest(), ...delta }), /FundTogether manifest/);
  }
});

test('FundTogether runtime verification binds chain, bytecode, ABI, token, and resolvers', async () => {
  const current = manifest();
  const { keccak256 } = require('viem');
  current.contractCodeHash = keccak256('0x6000');
  current.tokenCodeHash = keccak256('0x6001');
  const client = {
    getChainId: async () => 31339,
    getBlock: async ({ blockNumber }) => ({ hash: blockNumber === 0n ? current.genesisHash : current.deploymentBlockHash }),
    getCode: async ({ address: value }) => value === current.contractAddress ? '0x6000' : '0x6001',
    readContract: async ({ functionName }) => ({ supportedToken: current.tokenAddress, resolver: current.resolver,
      backupResolver: current.backupResolver, policyHash: current.policyHash, decimals: 6 })[functionName],
  };
  await verifyDeployment(client, current, []);
  client.readContract = async () => address(99);
  await assert.rejects(verifyDeployment(client, current, []), /FundTogether/);
});
