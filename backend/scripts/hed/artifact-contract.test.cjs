const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { artifacts, policy, generate, validateManifest, hashJson, verifyDeployment } = require('./generate-artifacts.cjs');

const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const manifest = () => ({ protocolKind: 'HED', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548',
  contractAddress: address(1), tokenAddress: address(2), resolver: address(3), backupResolver: address(4),
  genesisHash: hash(5), contractCodeHash: hash(6), tokenCodeHash: hash(7), deploymentBlockNumber: '2',
  deploymentBlockHash: hash(8), tokenDecimals: 6, confirmations: 1, abiVersion: '1', abiHash: hashJson([]), policyHash: hashJson(policy) });

test('HED artifact generator rejects incomplete or oversized Foundry artifacts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-hed-artifacts-'));
  try {
    assert.throws(() => artifacts(tmp), /artifact|ENOENT/);
    for (const name of ['FundTogetherDisbursement', 'MockUSDC']) {
      fs.mkdirSync(path.join(tmp, 'contracts/out', `${name}.sol`), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'contracts/out', `${name}.sol`, `${name}.json`),
        JSON.stringify({ abi: [], bytecode: { object: '0x6000' }, deployedBytecode: { object: '0x6000' } }));
    }
    assert.throws(() => artifacts(tmp), /ABI/);
    const real = artifacts(path.resolve(__dirname, '../../..'));
    const contractFile = path.join(tmp, 'contracts/out/FundTogetherDisbursement.sol/FundTogetherDisbursement.json');
    const tokenFile = path.join(tmp, 'contracts/out/MockUSDC.sol/MockUSDC.json');
    fs.writeFileSync(contractFile, JSON.stringify({ ...real.disbursement, deployedBytecode: { object: `0x${'60'.repeat(24577)}` } }));
    fs.writeFileSync(tokenFile, JSON.stringify(real.token));
    assert.throws(() => artifacts(tmp), /EVM limit/);
  } finally { fs.rmSync(tmp, { recursive: true }); }
});

test('HED artifacts export deterministically with the required escrow functions', () => {
  const root = path.resolve(__dirname, '../../..');
  const one = artifacts(root);
  const two = artifacts(root);
  assert.deepEqual(one, two);
  assert.ok(one.runtimeBytes > 0 && one.runtimeBytes <= 24576);
  const names = new Set(one.disbursement.abi.filter(item => item.type === 'function').map(item => item.name));
  for (const name of ['donate', 'approveAndDisburse', 'candidateExpenditure', 'openExpenditureCase', 'claimRefund']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-hed-export-'));
  try {
    const result = generate(root, out);
    assert.equal(result.runtimeBytes, one.runtimeBytes);
    assert.ok(fs.existsSync(path.join(out, 'fund-together-disbursement.abi.json')));
    assert.ok(fs.existsSync(path.join(out, 'mock-usdc.abi.json')));
  } finally { fs.rmSync(out, { recursive: true }); }
});

test('HED manifest rejects Workflow B endpoint and malformed deployment identity', () => {
  validateManifest(manifest());
  for (const delta of [{ protocolKind: 'ADVANCE' }, { chainId: 31338 }, { rpcUrl: 'http://127.0.0.1:9547' },
    { contractAddress: address(0) }, { backupResolver: address(3) }, { deploymentBlockNumber: '0' }, { tokenDecimals: 18 }]) {
    assert.throws(() => validateManifest({ ...manifest(), ...delta }), /HED manifest/);
  }
});

function client(manifestValue = manifest()) {
  return {
    getChainId: async () => 31339,
    getBlock: async ({ blockNumber }) => ({ hash: blockNumber === 0n ? manifestValue.genesisHash : manifestValue.deploymentBlockHash }),
    getCode: async ({ address: value }) => value === manifestValue.contractAddress ? '0x6000' : '0x6001',
    readContract: async ({ functionName }) => {
      if (functionName === 'supportedToken') return manifestValue.tokenAddress;
      if (functionName === 'resolver') return manifestValue.resolver;
      if (functionName === 'backupResolver') return manifestValue.backupResolver;
      if (functionName === 'policyHash') return manifestValue.policyHash;
      if (functionName === 'decimals') return 6;
      throw new Error('unexpected read');
    },
  };
}

test('HED runtime verification binds endpoint, code, ABI, token and both resolvers', async () => {
  const current = manifest();
  current.contractCodeHash = require('viem').keccak256('0x6000');
  current.tokenCodeHash = require('viem').keccak256('0x6001');
  await verifyDeployment(client(current), current, []);
  const wrong = client(current);
  wrong.readContract = async () => address(99);
  await assert.rejects(verifyDeployment(wrong, current, []), /HED/);
});
