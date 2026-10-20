const fs = require('node:fs');
const path = require('node:path');
const { keccak256, toHex, toFunctionSignature } = require('viem');
const { atomicWrite, hashJson } = require('./generate-historical-artifacts.cjs');

function assertFreshFoundryArtifact(root, artifact) {
  const sources = artifact.metadata?.sources;
  if (!sources || typeof sources !== 'object') throw new Error('Campaign Foundry artifact is missing source metadata; run forge build');

  const contractsRoot = path.resolve(root, 'contracts');
  const mismatches = [];
  for (const [relativePath, metadataSource] of Object.entries(sources)) {
    const sourcePath = path.resolve(contractsRoot, relativePath);
    if (sourcePath !== contractsRoot && !sourcePath.startsWith(`${contractsRoot}${path.sep}`)) {
      throw new Error(`Campaign artifact source escapes contracts root: ${relativePath}`);
    }
    if (!metadataSource || typeof metadataSource !== 'object' || typeof metadataSource.keccak256 !== 'string') {
      mismatches.push(`${relativePath} (missing hash)`);
      continue;
    }
    if (!fs.existsSync(sourcePath)) {
      mismatches.push(`${relativePath} (missing file)`);
      continue;
    }
    // Foundry hashes source text after normalizing Windows CRLF to LF.
    const sourceText = fs.readFileSync(sourcePath, 'utf8').replaceAll('\r\n', '\n');
    const actualHash = keccak256(toHex(Buffer.from(sourceText, 'utf8')));
    if (actualHash.toLowerCase() !== metadataSource.keccak256.toLowerCase()) mismatches.push(relativePath);
  }
  if (mismatches.length) {
    throw new Error(`Campaign Foundry artifact is stale; run forge build. Mismatched sources: ${mismatches.join(', ')}`);
  }
}

function generateCampaign(root = path.resolve(__dirname, '../../..')) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/FundTogetherCampaign.sol/FundTogetherCampaign.json'), 'utf8'));
  const tokenArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/MockUSDC.sol/MockUSDC.json'), 'utf8'));
  if (!/^0x[0-9a-f]+$/i.test(artifact.bytecode?.object || '') || !Array.isArray(artifact.abi)) throw new Error('Build Campaign contract first');
  if (!/^0x[0-9a-f]+$/i.test(tokenArtifact.bytecode?.object || '') || !Array.isArray(tokenArtifact.abi)) throw new Error('Build MockUSDC contract first');
  assertFreshFoundryArtifact(root, artifact);
  const signatures = artifact.abi.filter(item => item.type === 'function').map(toFunctionSignature);
  for (const signature of ['pledge(uint256,uint256)', 'requestCompletion(uint256,bytes32)', 'approveCompletion(uint256,bytes32,bytes32)',
    'requestDisbursement(uint256,bytes32,uint256)', 'approveDisbursement(uint256,bytes32,bytes32)', 'rejectDisbursement(uint256,bytes32,bytes32)',
    'rejectCompletion(uint256,bytes32,bytes32)', 'claimSurplus(uint256,uint8)', 'claimableSurplus(uint256,address)',
    'claimRefund(uint256)', 'startRefunds(uint256)',
    'createPublicationCase(bytes32,uint256,uint256,uint256)', 'votePublicationCase(uint256,bool)',
    'expirePublicationCase(uint256)', 'publicationCase(uint256)', 'publicationCaseId(bytes32)',
    'publicationJudge(uint256,uint8)', 'judgePoolLength()', 'judgePoolAt(uint256)', 'isEligibleJudge(address)',
    'createCampaign(bytes32,uint256,uint256,uint256)',
    'reviewProduction(uint256,bytes32,bool)', 'confirmCampaignCompletion(uint256,uint256)', 'reviewRelease(uint256,bytes32,bytes32,bool)', 'resolveChallenge(uint256,address,bool,bytes32)']) {
    if (!signatures.includes(signature)) throw new Error(`Campaign ABI mismatch: ${signature}`);
  }
  if (signatures.includes('approveCampaign(address,bytes32,uint256,uint256,uint256)')) throw new Error('Campaign ABI still exposes fixed Resolver publication approval');
  if (signatures.includes('payout(uint256)')) throw new Error('Campaign ABI still exposes permissionless payout');
  if (signatures.some(signature => /shipping|fulfillment|tier\(/i.test(signature))) throw new Error('Unsupported flow in Campaign ABI');
  const runtimeBytes = (artifact.deployedBytecode.object.length - 2) / 2;
  if (runtimeBytes > 24576) throw new Error('Campaign contract exceeds EVM code size');
  atomicWrite(path.join(root, 'backend/src/blockchain/generated/campaigns/fund-together-campaign.abi.json'), artifact.abi);
  atomicWrite(path.join(root, 'backend/src/blockchain/generated/fundtogether/mock-usdc.abi.json'), tokenArtifact.abi);
  for (const signature of ['requestPayout(uint256,bytes32,uint256)', 'approvePayout(uint256,bytes32,bytes32)', 'rejectPayout(uint256,bytes32,bytes32)']) {
    if (signatures.includes(signature)) throw new Error(`Campaign ABI still exposes retired payout function: ${signature}`);
  }
  return { artifact, tokenArtifact, runtimeBytes, abiHash: hashJson(artifact.abi), policyHash: keccak256(toHex('campaigns-local-escrow-v7')) };
}

if (require.main === module) {
  const { runtimeBytes, abiHash, policyHash } = generateCampaign();
  console.log(JSON.stringify({ runtimeBytes, abiHash, policyHash }));
}
module.exports = { assertFreshFoundryArtifact, generateCampaign };
