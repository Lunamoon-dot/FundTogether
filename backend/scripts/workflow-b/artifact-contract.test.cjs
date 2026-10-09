const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { artifacts, policy, hashJson, validateManifest, verifyDeployment } = require('./generate-artifacts.cjs');
const { keccak256, toHex } = require('viem');

const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const manifest = () => ({ protocolKind: 'ADVANCE', chainId: 31338, rpcUrl: 'http://127.0.0.1:9547',
  contractAddress: address(1), tokenAddress: address(2), resolver: address(3), deploymentId: hash(4),
  genesisHash: hash(5), contractCodeHash: keccak256('0x6000'), tokenCodeHash: keccak256('0x6001'),
  deploymentBlockNumber: '2', deploymentBlockHash: hash(6), tokenDecimals: 6, confirmations: 1,
  abiVersion: '1', abiHash: hash(7), workflowPolicy: keccak256(toHex('FundTogether.advance.no-bond.v1')),
  policyHash: hashJson(policy) });

function client(m = manifest()) {
  return {
    getChainId: async () => 31338,
    getBlock: async ({ blockNumber }) => ({ hash: blockNumber === 0n ? m.genesisHash : m.deploymentBlockHash }),
    getCode: async ({ address: a }) => a === m.contractAddress ? '0x6000' : '0x6001',
    readContract: async ({ functionName }) => {
      if (functionName === 'deploymentId') return m.deploymentId;
      if (functionName === 'WORKFLOW_POLICY') return m.workflowPolicy;
      if (functionName === 'resolver') return m.resolver;
      if (functionName === 'supportedToken') return m.tokenAddress;
      if (functionName === 'decimals') return 6;
      return BigInt(policy[functionName]);
    },
  };
}

test('artifact generator rejects missing bytecode, ABI drift and oversized EVM runtime', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-b-artifacts-'));
  try {
    assert.throws(() => artifacts(tmp), /artifact|ENOENT/);
    for (const name of ['FundTogetherAdvance', 'MockUSDC']) {
      fs.mkdirSync(path.join(tmp, 'contracts/out', `${name}.sol`), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'contracts/out', `${name}.sol`, `${name}.json`),
        JSON.stringify({ abi: [], bytecode: { object: '0x6000' }, deployedBytecode: { object: '0x6000' } }));
    }
    assert.throws(() => artifacts(tmp), /ABI/);
    const valid = artifacts(path.resolve(__dirname, '../../..'));
    const file = path.join(tmp, 'contracts/out/FundTogetherAdvance.sol/FundTogetherAdvance.json');
    const tokenFile = path.join(tmp, 'contracts/out/MockUSDC.sol/MockUSDC.json');
    fs.writeFileSync(tokenFile, JSON.stringify(valid.token));
    fs.writeFileSync(file, JSON.stringify({ ...valid.advance, bytecode: { object: '0x' } }));
    assert.throws(() => artifacts(tmp), /bytecode/);
    fs.writeFileSync(file, JSON.stringify({ ...valid.advance, deployedBytecode: { object: `0x${'60'.repeat(24577)}` } }));
    assert.throws(() => artifacts(tmp), /EVM limit/);
  } finally { fs.rmSync(tmp, { recursive: true }); }
});

test('real Foundry artifacts export deterministically and fit EVM limit', () => {
  const one = artifacts(path.resolve(__dirname, '../../..'));
  const two = artifacts(path.resolve(__dirname, '../../..'));
  assert.deepEqual(one, two);
  assert.ok(one.runtimeBytes > 0 && one.runtimeBytes <= 24576);
  assert.equal(one.advance.abi.find(x => x.type === 'function' && x.name === 'claimAdvance').inputs.length, 3);
});

test('B manifest rejects A endpoint/chain, zero instance, malformed anchor and policy', () => {
  validateManifest(manifest());
  for (const delta of [{ chainId: 31337 }, { rpcUrl: 'http://localhost:8545' }, { protocolKind: 'MVP' },
    { deploymentId: hash(0) }, { deploymentBlockNumber: '-1' }, { workflowPolicy: hash(9) },
    { contractAddress: address(0) }, { confirmations: 0 }, { tokenDecimals: 18 }]) {
    assert.throws(() => validateManifest({ ...manifest(), ...delta }), /Workflow B/);
  }
});

test('reuse verifies genesis/code/anchor/instance/policy/token/resolver and every timer', async () => {
  await verifyDeployment(client(), manifest(), []);
  for (const method of ['getChainId', 'getBlock', 'getCode', 'readContract']) {
    const altered = client();
    altered[method] = async () => method === 'getChainId' ? 31337 : method === 'getBlock'
      ? { hash: hash(99) } : method === 'getCode' ? '0x' : hash(99);
    await assert.rejects(verifyDeployment(altered, manifest(), []), /Workflow B/);
  }
  const wrongTimer = client();
  const original = wrongTimer.readContract;
  wrongTimer.readContract = async args => args.functionName === 'CASE_RESPONSE_WINDOW' ? 1n : original(args);
  await assert.rejects(verifyDeployment(wrongTimer, manifest(), []), /CASE_RESPONSE_WINDOW/);
});
