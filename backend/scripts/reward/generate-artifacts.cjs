const fs = require('node:fs');
const path = require('node:path');
const { keccak256, toFunctionSignature, toHex } = require('viem');

const bytes = value => JSON.stringify(value, null, 2) + '\n';
const hashJson = value => keccak256(toHex(bytes(value)));
const policy = Object.freeze({
  PRIMARY_REVIEW_WINDOW: 259_200,
  CHALLENGE_WINDOW: 259_200,
  EXECUTION_HORIZON: 15_552_000,
  MAX_PRINT_DEPOSIT_BPS: 5000,
});

function artifacts(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', `${name}.sol`, `${name}.json`), 'utf8'));
  const reward = read('FundTogetherReward');
  const token = read('MockUSDC');
  for (const artifact of [reward, token]) {
    for (const field of ['bytecode', 'deployedBytecode']) {
      if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(artifact[field]?.object || '')) throw new Error('Reward artifact missing bytecode');
    }
    if (!Array.isArray(artifact.abi)) throw new Error('Reward artifact missing ABI');
  }
  const signatures = reward.abi.filter(item => item.type === 'function').map(toFunctionSignature);
  const expected = [
    'createCampaign(bytes32,uint256,uint256,(uint256,uint256,uint256,bool)[])',
    'pledge(uint256,uint256,uint256)',
    'activateCampaign(uint256,bytes32)',
    'finalizeFundingFailure(uint256)',
    'submitDisbursementRequest(uint256,bytes32,address,uint256)',
    'approveAndDisburse(uint256,uint256,bytes32)',
    'candidateExpenditure(uint256,uint256,uint256,bytes32)',
    'finalizeExpenditure(uint256,uint256)',
    'returnFunds(uint256,uint256,uint256)',
    'recordProductionVerified(uint256,bytes32)',
    'recordFulfillmentComplete(uint256,bytes32)',
    'completeCampaign(uint256)',
    'startWindDown(uint256)',
    'claimRefund(uint256)',
    'openDisputeCase(uint256,uint256,bytes32)',
    'upholdDisputeCase(uint256,uint256,bytes32)',
    'campaign(uint256)',
    'tier(uint256,uint256)',
    'request(uint256,uint256)',
  ];
  for (const signature of expected) {
    if (!signatures.includes(signature)) throw new Error(`Reward ABI drift: ${signature}`);
  }
  const runtimeBytes = (reward.deployedBytecode.object.length - 2) / 2;
  if (runtimeBytes > 24576) throw new Error('Reward runtime exceeds EVM limit');
  return { reward, token, runtimeBytes };
}

function atomicWrite(file, value) {
  const content = JSON.stringify(value, null, 2) + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  const pending = `${file}.${process.pid}.pending`;
  fs.writeFileSync(pending, content, { flag: 'wx' });
  fs.renameSync(pending, file);
}

function validateManifest(manifest) {
  const address = /^0x[a-fA-F0-9]{40}$/;
  const hash = /^0x[a-fA-F0-9]{64}$/;
  const validUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        && url.port === '9548' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  };
  if (!manifest || manifest.protocolKind !== 'REWARD' || manifest.chainId !== 31339 || !validUrl(manifest.rpcUrl)
    || !address.test(manifest.contractAddress || '') || !address.test(manifest.tokenAddress || '')
    || !address.test(manifest.resolver || '') || !address.test(manifest.backupResolver || '')
    || manifest.contractAddress === `0x${'0'.repeat(40)}` || manifest.tokenAddress === `0x${'0'.repeat(40)}`
    || manifest.resolver.toLowerCase() === manifest.backupResolver.toLowerCase() || manifest.tokenDecimals !== 6
    || manifest.confirmations !== 1 || manifest.abiVersion !== '1' || !/^\d+$/.test(manifest.deploymentBlockNumber || '')
    || BigInt(manifest.deploymentBlockNumber || '0') === 0n) throw new Error('Reward manifest identity/configuration invalid');
  for (const key of ['genesisHash', 'contractCodeHash', 'tokenCodeHash', 'deploymentBlockHash', 'abiHash', 'policyHash']) {
    if (!hash.test(manifest[key] || '')) throw new Error('Reward manifest identity/configuration invalid');
  }
}

async function verifyDeployment(client, manifest, rewardAbi, tokenAbi) {
  validateManifest(manifest);
  if (await client.getChainId() !== manifest.chainId) throw new Error('Reward chain mismatch');
  if ((await client.getBlock({ blockNumber: 0n })).hash !== manifest.genesisHash) throw new Error('Reward genesis mismatch');
  if ((await client.getBlock({ blockNumber: BigInt(manifest.deploymentBlockNumber) })).hash !== manifest.deploymentBlockHash)
    throw new Error('Reward deployment anchor mismatch');
  const contractCode = await client.getCode({ address: manifest.contractAddress });
  const tokenCode = await client.getCode({ address: manifest.tokenAddress });
  if (!contractCode || contractCode === '0x' || keccak256(contractCode) !== manifest.contractCodeHash) throw new Error('Reward contract code mismatch');
  if (!tokenCode || tokenCode === '0x' || keccak256(tokenCode) !== manifest.tokenCodeHash) throw new Error('Reward token code mismatch');
  const read = functionName => client.readContract({ address: manifest.contractAddress, abi: rewardAbi, functionName });
  for (const [functionName, expected] of Object.entries({ supportedToken: manifest.tokenAddress, resolver: manifest.resolver, backupResolver: manifest.backupResolver, policyHash: manifest.policyHash })) {
    if (String(await read(functionName)).toLowerCase() !== expected.toLowerCase()) throw new Error(`Reward ${functionName} mismatch`);
  }
  const decimals = await client.readContract({ address: manifest.tokenAddress, abi: tokenAbi, functionName: 'decimals' });
  if (Number(decimals) !== manifest.tokenDecimals) throw new Error('Reward token decimals mismatch');
}

function generate(root = path.resolve(__dirname, '../../..'), out = path.join(root, 'backend/src/blockchain/generated/reward')) {
  const result = artifacts(root);
  atomicWrite(path.join(out, 'fund-together-reward.abi.json'), result.reward.abi);
  atomicWrite(path.join(out, 'mock-usdc.abi.json'), result.token.abi);
  atomicWrite(path.join(out, 'reward-policy.json'), policy);
  return { ...result, policyHash: hashJson(policy) };
}

if (require.main === module) {
  const result = generate();
  console.log(JSON.stringify({ runtimeBytes: result.runtimeBytes, policyHash: result.policyHash }, null, 2));
}

module.exports = { generate, artifacts, policy, hashJson, atomicWrite, validateManifest, verifyDeployment };
