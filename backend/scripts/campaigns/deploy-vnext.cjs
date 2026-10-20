const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } = require('viem');

const root = path.resolve(__dirname, '../../..');
const contracts = name => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', name), 'utf8'));
const campaignArtifact = contracts('CampaignEscrowVNext.sol/CampaignEscrowVNext.json');
const registryArtifact = contracts('JuryRegistry.sol/JuryRegistry.json');
const reviewArtifact = contracts('JuryReview.sol/JuryReview.json');
const tokenArtifact = contracts('MockUSDC.sol/MockUSDC.json');
const randomnessArtifact = contracts('MockRandomness.sol/MockRandomness.json');
const manifestPath = path.join(root, '.local/fundtogether/generated/vnext-deployment.local.json');
const rpcUrl = process.env.FUNDTOGETHER_RPC_URL || 'http://127.0.0.1:9548';
const chain = defineChain({
  id: 31339,
  name: 'FundTogether VNext local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const zero = '0x0000000000000000000000000000000000000000';
const policyHash = keccak256(toHex('fundtogether-vnext-local-v2-remediation'));
const abiHash = keccak256(toHex(JSON.stringify(campaignArtifact.abi, null, 2) + '\n'));

async function deploy(client, wallet, artifact, args = []) {
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('VNext deployment receipt failed');
  return { address: receipt.contractAddress, receipt };
}

async function write(client, wallet, request) {
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== 'success') throw new Error(`VNext wiring transaction failed: ${request.functionName}`);
  return receipt;
}

async function main() {
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });
  if (await client.getChainId() !== 31339) throw new Error('VNext requires Anvil chain 31339');
  const genesis = await client.getBlock({ blockNumber: 0n });
  const accounts = await client.request({ method: 'eth_accounts' });
  if (!accounts.length) throw new Error('Anvil has no unlocked deployer account');
  const deployer = accounts[0];
  const wallet = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) });

  if (fs.existsSync(manifestPath) && !process.argv.includes('--create')) {
    console.log('VNext manifest exists; pass --create to redeploy or use the verifier.');
    return;
  }

  const token = await deploy(client, wallet, tokenArtifact);
  const randomness = await deploy(client, wallet, randomnessArtifact);
  const registry = await deploy(client, wallet, registryArtifact, [token.address, zero]);
  const review = await deploy(client, wallet, reviewArtifact, [
    registry.address,
    zero,
    randomness.address,
    48n * 60n * 60n,
    24n * 60n * 60n,
    24n * 60n * 60n,
    48n * 60n * 60n,
    1n,
    300n,
    1_000_000n,
    2n,
    500n,
  ]);
  const campaign = await deploy(client, wallet, campaignArtifact, [
    token.address,
    review.address,
    1n,
    policyHash,
    7n * 24n * 60n * 60n,
    7n * 24n * 60n * 60n,
    7n * 24n * 60n * 60n,
  ]);

  await write(client, wallet, { address: registry.address, abi: registryArtifact.abi, functionName: 'configureReviewController', args: [review.address] });
  await write(client, wallet, { address: review.address, abi: reviewArtifact.abi, functionName: 'configureCampaignEscrow', args: [campaign.address] });
  const anchor = await client.getBlock({ blockNumber: campaign.receipt.blockNumber });
  const codeHash = async address => keccak256(await client.getCode({ address }));
  const manifest = {
    protocolKind: 'FUNDTOGETHER_VNEXT',
    chainId: 31339,
    rpcUrl,
    abiVersion: 'fundtogether-vnext-local-v2-remediation',
    abiHash,
    policyHash,
    tokenDecimals: 6,
    confirmations: 1,
    campaignEscrow: campaign.address,
    juryRegistry: registry.address,
    juryReview: review.address,
    randomnessProvider: randomness.address,
    tokenAddress: token.address,
    genesisHash: genesis.hash,
    campaignCodeHash: await codeHash(campaign.address),
    registryCodeHash: await codeHash(registry.address),
    reviewCodeHash: await codeHash(review.address),
    tokenCodeHash: await codeHash(token.address),
    deploymentBlockNumber: campaign.receipt.blockNumber.toString(),
    deploymentBlockHash: anchor.hash,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`FundTogether VNext deployed and wired: ${campaign.address}`);
  console.log(`Manifest: ${manifestPath}`);
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { manifestPath, policyHash, abiHash };
