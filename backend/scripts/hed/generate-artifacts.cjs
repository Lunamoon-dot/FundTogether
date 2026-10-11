const fs = require('node:fs');
const path = require('node:path');
const { keccak256, toFunctionSignature, toHex } = require('viem');

const bytes = value => JSON.stringify(value, null, 2) + '\n';
const hashJson = value => keccak256(toHex(bytes(value)));

function validateManifest(manifest) {
  const fail = () => { throw new Error('HED manifest identity/configuration invalid'); };
  let url;
  try { url = new URL(manifest.rpcUrl); } catch { fail(); }
  if (manifest.protocolKind !== 'HED' || manifest.chainId !== 31339 || manifest.tokenDecimals !== 6
    || manifest.confirmations !== 1 || manifest.abiVersion !== '1' || url.protocol !== 'http:'
    || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '9548' || url.username
    || url.password || url.pathname !== '/' || url.search || url.hash || !/^\d+$/.test(manifest.deploymentBlockNumber)
    || BigInt(manifest.deploymentBlockNumber) === 0n) fail();
  for (const key of ['contractAddress', 'tokenAddress', 'resolver', 'backupResolver']) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(manifest[key]) || /^0x0+$/.test(manifest[key])) fail();
  }
  if (manifest.contractAddress.toLowerCase() === manifest.tokenAddress.toLowerCase()
    || manifest.resolver.toLowerCase() === manifest.backupResolver.toLowerCase()) fail();
  for (const key of ['genesisHash', 'contractCodeHash', 'tokenCodeHash', 'deploymentBlockHash', 'abiHash', 'policyHash']) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(manifest[key]) || /^0x0+$/.test(manifest[key])) fail();
  }
}

async function verifyDeployment(client, manifest, abi, tokenAbi) {
  validateManifest(manifest);
  if (manifest.abiHash !== hashJson(abi)) throw new Error('HED ABI hash changed');
  if (await client.getChainId() !== manifest.chainId) throw new Error('HED chain mismatch');
  if ((await client.getBlock({ blockNumber: 0n })).hash !== manifest.genesisHash) throw new Error('HED genesis mismatch');
  if ((await client.getBlock({ blockNumber: BigInt(manifest.deploymentBlockNumber) })).hash !== manifest.deploymentBlockHash)
    throw new Error('HED deployment anchor mismatch');
  for (const [addressKey, codeKey] of [['contractAddress', 'contractCodeHash'], ['tokenAddress', 'tokenCodeHash']]) {
    const code = await client.getCode({ address: manifest[addressKey] });
    if (!code || code === '0x' || keccak256(code) !== manifest[codeKey]) throw new Error(`HED ${codeKey} mismatch`);
  }
  const read = functionName => client.readContract({ address: manifest.contractAddress, abi, functionName });
  for (const [functionName, expected] of Object.entries({ supportedToken: manifest.tokenAddress, resolver: manifest.resolver,
    backupResolver: manifest.backupResolver, policyHash: manifest.policyHash })) {
    if (String(await read(functionName)).toLowerCase() !== expected.toLowerCase()) throw new Error(`HED ${functionName} mismatch`);
  }
  if (await client.readContract({ address: manifest.tokenAddress, abi: tokenAbi || abi, functionName: 'decimals' }) !== 6)
    throw new Error('HED token decimals mismatch');
}

function artifacts(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', `${name}.sol`, `${name}.json`), 'utf8'));
  const disbursement = read('FundTogetherDisbursement');
  const token = read('MockUSDC');
  for (const artifact of [disbursement, token]) {
    for (const field of ['bytecode', 'deployedBytecode']) {
      if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(artifact[field]?.object || '')) throw new Error('HED artifact missing bytecode');
    }
    if (!Array.isArray(artifact.abi)) throw new Error('HED artifact missing ABI');
  }
  const signatures = disbursement.abi.filter(item => item.type === 'function').map(toFunctionSignature);
  const expected = [
    'createCampaign(bytes32,uint256,uint256)', 'donate(uint256,uint256)', 'activateCampaign(uint256,bytes32)',
    'finalizeFundingFailure(uint256)', 'claimRefund(uint256)', 'createActivity(uint256,bytes32,uint256)',
    'submitRequest(uint256,uint256,bytes32,address,uint256,uint256)', 'approveRequest(uint256,uint256,bytes32)',
    'acknowledgeVendor(uint256,uint256,bytes32)', 'payDeposit(uint256,uint256)',
    'candidateDelivery(uint256,uint256,uint256,bytes32)', 'openDeliveryCase(uint256,uint256,bytes32)',
    'upholdDeliveryCase(uint256,uint256,bytes32)', 'executeFinal(uint256,uint256)',
    'releaseResidual(uint256,uint256,bytes32)', 'returnFunds(uint256,uint256,uint256)',
    'cancelUncommittedRequest(uint256,uint256,bytes32)', 'candidateOutcome(uint256,uint256,bytes32)',
    'verifyOutcome(uint256,uint256,bytes32)', 'openOutcomeCase(uint256,uint256,bytes32)',
    'upholdOutcomeCase(uint256,uint256,bytes32)', 'campaign(uint256)', 'request(uint256,uint256)', 'activity(uint256,uint256)',
  ];
  for (const signature of expected) if (!signatures.includes(signature)) throw new Error(`HED ABI drift: ${signature}`);
  const runtimeBytes = (disbursement.deployedBytecode.object.length - 2) / 2;
  if (runtimeBytes > 24576) throw new Error('HED runtime exceeds EVM limit');
  return { disbursement, token, runtimeBytes };
}

function atomicWrite(file, value) {
  const content = JSON.stringify(value, null, 2) + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  const pending = `${file}.${process.pid}.pending`;
  fs.writeFileSync(pending, content, { flag: 'wx' });
  fs.renameSync(pending, file);
}

function generate(root = path.resolve(__dirname, '../../..'), out = path.join(root, 'backend/src/blockchain/generated/hed')) {
  const result = artifacts(root);
  atomicWrite(path.join(out, 'fund-together-disbursement.abi.json'), result.disbursement.abi);
  atomicWrite(path.join(out, 'mock-usdc.abi.json'), result.token.abi);
  return result;
}

if (require.main === module) {
  const result = generate();
  console.log(JSON.stringify({ runtimeBytes: result.runtimeBytes }));
}

module.exports = { artifacts, generate, atomicWrite, validateManifest, hashJson, verifyDeployment };
