const fs = require('node:fs');
const path = require('node:path');
const { keccak256, toHex, toFunctionSignature } = require('viem');

const policy = Object.freeze({ MIN_FUNDING_DURATION: 86400, MAX_FUNDING_DURATION: 2592000,
  FIRST_REVIEW_WINDOW: 259200, CLAIM_WINDOW: 604800, INITIAL_EVIDENCE_WINDOW: 2592000,
  STAGE_HARD_LIMIT: 5184000, REVIEW_WINDOW: 259200, SUPPLEMENT_WINDOW: 604800,
  CHALLENGE_WINDOW: 259200, FINALIZATION_WINDOW: 604800, MAX_VERSIONS: 3,
  CASE_RESPONSE_WINDOW: 259200, CASE_RESOLUTION_WINDOW: 259200 });

function artifacts(root) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', `${name}.sol`, `${name}.json`), 'utf8'));
  const advance = read('FundTogetherAdvance'), token = read('MockUSDC');
  for (const a of [advance, token]) {
    for (const field of ['bytecode', 'deployedBytecode']) {
      if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(a[field]?.object || '')) throw new Error('Workflow B artifact missing bytecode');
    }
    if (!Array.isArray(a.abi)) throw new Error('Workflow B artifact missing ABI');
  }
  const signatures = advance.abi.filter(x => x.type === 'function').map(toFunctionSignature);
  const ref = '(uint256,uint256,uint256,bytes32)';
  const expected = ['submitCampaignForDraft(bytes32,bytes32,uint256,uint256[],bytes32[])',
    'approveCampaign(uint256,bytes32,bytes32,bytes32)', 'publishCampaign(uint256,bytes32)',
    'cancelCampaign(uint256,bytes32)', 'donate(uint256,uint256)',
    'confirmFirstAdvance(uint256,bytes32,bytes32,bytes32)', 'claimAdvance(uint256,uint256,bytes32)',
    'submitEvidence(uint256,uint256,uint256,bytes32)', `approveEvidence(${ref},bytes32,bytes32,uint256)`,
    `requestSupplement(${ref},uint8,bytes32)`, `rejectEvidence(${ref},bytes32)`,
    `openCase(${ref},bytes32)`, `addCaseMaterial(${ref},bytes32)`, `submitCaseResponse(${ref},bytes32)`,
    `resolveCase(${ref},uint8,bytes32)`, `finalizeStage(${ref})`, 'stopCampaign(uint256,bytes32,bytes32)',
    'finalizeTimeout(uint256)', 'returnFunds(uint256,uint256,uint256)', 'claimRefund(uint256)',
    'campaign(uint256)', 'stage(uint256,uint256)', 'submission(uint256,uint256,uint256)',
    'challengeCase(uint256,uint256,uint256)', 'refundClaimable(uint256,address)'];
  for (const signature of expected) if (!signatures.includes(signature)) throw new Error(`Workflow B ABI drift: ${signature}`);
  const runtimeBytes = (advance.deployedBytecode.object.length - 2) / 2;
  if (runtimeBytes > 24576) throw new Error('Workflow B runtime exceeds EVM limit');
  return { advance, token, runtimeBytes };
}

const bytes = value => JSON.stringify(value, null, 2) + '\n';
const hashJson = value => keccak256(toHex(bytes(value)));
const workflowPolicy = keccak256(toHex('FundTogether.advance.no-bond.v1'));

function validateManifest(m) {
  const fail = () => { throw new Error('Workflow B manifest identity/configuration invalid'); };
  let url;
  try { url = new URL(m.rpcUrl); } catch { fail(); }
  if (m.protocolKind !== 'ADVANCE' || m.chainId !== 31338 || m.tokenDecimals !== 6
    || m.confirmations !== 1 || m.abiVersion !== '1' || m.workflowPolicy !== workflowPolicy
    || url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.port !== '9547' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^\d+$/.test(m.deploymentBlockNumber) || BigInt(m.deploymentBlockNumber) === 0n) fail();
  for (const key of ['contractAddress', 'tokenAddress', 'resolver']) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(m[key]) || /^0x0+$/.test(m[key])) fail();
  }
  if (m.contractAddress.toLowerCase() === m.tokenAddress.toLowerCase()) fail();
  for (const key of ['deploymentId', 'genesisHash', 'contractCodeHash', 'tokenCodeHash',
    'deploymentBlockHash', 'abiHash', 'policyHash']) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(m[key]) || /^0x0+$/.test(m[key])) fail();
  }
}

async function verifyDeployment(client, m, abi, tokenAbi) {
  validateManifest(m);
  if (abi.length && m.abiHash !== hashJson(abi)) throw new Error('Workflow B ABI hash changed');
  if (m.policyHash !== hashJson(policy)) throw new Error('Workflow B policy artifact hash changed');
  if (await client.getChainId() !== 31338) throw new Error('Workflow B chain mismatch');
  if ((await client.getBlock({ blockNumber: 0n })).hash !== m.genesisHash) throw new Error('Workflow B genesis mismatch');
  if ((await client.getBlock({ blockNumber: BigInt(m.deploymentBlockNumber) })).hash !== m.deploymentBlockHash) throw new Error('Workflow B deployment anchor mismatch');
  for (const [addressKey, codeKey] of [['contractAddress', 'contractCodeHash'], ['tokenAddress', 'tokenCodeHash']]) {
    const code = await client.getCode({ address: m[addressKey] });
    if (!code || code === '0x' || keccak256(code) !== m[codeKey]) throw new Error(`Workflow B ${codeKey} mismatch`);
  }
  const read = functionName => client.readContract({ address: m.contractAddress, abi, functionName });
  for (const [functionName, expected] of Object.entries({ deploymentId: m.deploymentId,
    WORKFLOW_POLICY: m.workflowPolicy, supportedToken: m.tokenAddress, resolver: m.resolver })) {
    if (String(await read(functionName)).toLowerCase() !== expected.toLowerCase()) throw new Error(`Workflow B ${functionName} mismatch`);
  }
  for (const [functionName, expected] of Object.entries(policy)) {
    if (await read(functionName) !== BigInt(expected)) throw new Error(`Workflow B ${functionName} mismatch`);
  }
  if (await client.readContract({ address: m.tokenAddress, abi: tokenAbi || abi, functionName: 'decimals' }) !== 6)
    throw new Error('Workflow B token decimals mismatch');
}

function atomicWrite(file, value) {
  const content = bytes(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  const pending = `${file}.${process.pid}.pending`;
  fs.writeFileSync(pending, content, { flag: 'wx' });
  fs.renameSync(pending, file);
}

function generate(root = path.resolve(__dirname, '../../..')) {
  const result = artifacts(root);
  const out = path.join(root, 'backend/src/blockchain/generated/advance');
  atomicWrite(path.join(out, 'fund-together-advance.abi.json'), result.advance.abi);
  atomicWrite(path.join(out, 'mock-usdc.abi.json'), result.token.abi);
  atomicWrite(path.join(out, 'policy.json'), policy);
  return { ...result, abiHash: hashJson(result.advance.abi), policyHash: hashJson(policy) };
}

if (require.main === module) {
  const result = generate();
  console.log(JSON.stringify({ runtimeBytes: result.runtimeBytes, abiHash: result.abiHash, policyHash: result.policyHash }));
}
module.exports = { artifacts, policy, workflowPolicy, hashJson, generate, atomicWrite, validateManifest, verifyDeployment };
