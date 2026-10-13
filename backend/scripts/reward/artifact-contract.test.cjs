const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { artifacts, generate, hashJson, policy, validateManifest, verifyDeployment } = require('./generate-artifacts.cjs');

const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const manifest = () => ({ protocolKind: 'REWARD', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548',
  contractAddress: address(1), tokenAddress: address(2), resolver: address(3), backupResolver: address(4),
  genesisHash: hash(5), contractCodeHash: hash(6), tokenCodeHash: hash(7), deploymentBlockNumber: '2',
  deploymentBlockHash: hash(8), tokenDecimals: 6, confirmations: 1, abiVersion: '1', abiHash: hashJson([]), policyHash: hashJson(policy) });

test('Reward artifacts reject incomplete Foundry output and export deterministically', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-reward-artifacts-'));
  try {
    assert.throws(() => artifacts(tmp), /artifact|ENOENT/);
    const root = path.resolve(__dirname, '../../..');
    const one = artifacts(root);
    assert.ok(one.runtimeBytes > 0 && one.runtimeBytes <= 24576);
    const output = path.join(tmp, 'generated');
    generate(root, output);
    assert.ok(fs.existsSync(path.join(output, 'fund-together-reward.abi.json')));
    assert.ok(fs.existsSync(path.join(output, 'mock-usdc.abi.json')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Reward manifest rejects a wrong protocol, endpoint, or deployment identity', () => {
  validateManifest(manifest());
  for (const delta of [{ protocolKind: 'HED' }, { chainId: 31338 }, { rpcUrl: 'http://127.0.0.1:9547' },
    { contractAddress: address(0) }, { backupResolver: address(3) }, { deploymentBlockNumber: '0' }, { tokenDecimals: 18 }]) {
    assert.throws(() => validateManifest({ ...manifest(), ...delta }), /Reward manifest/);
  }
});

test('Reward runtime verification binds chain, bytecode, ABI, token, and resolvers', async () => {
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
  await assert.rejects(verifyDeployment(client, current, []), /Reward/);
});
