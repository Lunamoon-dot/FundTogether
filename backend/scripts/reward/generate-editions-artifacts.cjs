const fs = require('node:fs');
const path = require('node:path');
const { keccak256, toHex, toFunctionSignature } = require('viem');
const { atomicWrite, hashJson } = require('./generate-artifacts.cjs');

function generateEditions(root = path.resolve(__dirname, '../../..')) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/FundTogetherEditions.sol/FundTogetherEditions.json'), 'utf8'));
  if (!/^0x[0-9a-f]+$/i.test(artifact.bytecode?.object || '') || !Array.isArray(artifact.abi)) throw new Error('Build Editions contract first');
  const signatures = artifact.abi.filter(item => item.type === 'function').map(toFunctionSignature);
  for (const signature of ['pledge(uint256)', 'payout(uint256)', 'claimRefund(uint256)', 'startRefunds(uint256)',
    'approveCampaign(address,bytes32,uint256,uint256,uint256,uint256)', 'createCampaign(bytes32,uint256,uint256,uint256,uint256)',
    'reviewRelease(uint256,bytes32,bytes32,bool)', 'resolveChallenge(uint256,address,bool,bytes32)']) {
    if (!signatures.includes(signature)) throw new Error(`Editions ABI mismatch: ${signature}`);
  }
  if (signatures.some(signature => /shipping|fulfillment|disburse|tier\(/i.test(signature))) throw new Error('Legacy flow in Editions ABI');
  const runtimeBytes = (artifact.deployedBytecode.object.length - 2) / 2;
  if (runtimeBytes > 24576) throw new Error('Editions contract exceeds EVM code size');
  atomicWrite(path.join(root, 'backend/src/blockchain/generated/editions/fund-together-editions.abi.json'), artifact.abi);
  return { artifact, runtimeBytes, abiHash: hashJson(artifact.abi), policyHash: keccak256(toHex('editions-local-escrow-v1')) };
}

if (require.main === module) {
  const { runtimeBytes, abiHash, policyHash } = generateEditions();
  console.log(JSON.stringify({ runtimeBytes, abiHash, policyHash }));
}
module.exports = { generateEditions };
