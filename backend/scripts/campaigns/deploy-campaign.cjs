const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, keccak256 } = require('viem');
const { generateCampaign } = require('./generate-campaign-artifacts.cjs');
const { atomicWrite } = require('./generate-historical-artifacts.cjs');

const root = path.resolve(__dirname, '../../..');
const manifestPath = path.join(root, '.local/fundtogether/generated/campaigns-deployment.local.json');
const rpcUrl = process.env.FUNDTOGETHER_RPC_URL || 'http://127.0.0.1:9548';
const chain = defineChain({
  id: 31339,
  name: 'FundTogether local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

async function deploy(client, wallet, artifact, args = []) {
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('FundTogether deployment receipt failed');
  return receipt;
}

function deploymentRoles(accounts) {
  if (!Array.isArray(accounts) || accounts.length < 10) {
    throw new Error('FundTogether requires primary resolver, backup resolver, creator, and four Judge accounts');
  }
  const judges = accounts.slice(6, 10);
  const uniqueJudges = new Set(judges.map(account => account.toLowerCase()));
  if (uniqueJudges.size !== judges.length || judges.some(account => [accounts[1], accounts[2]].includes(account))) {
    throw new Error('FundTogether Judge pool must contain four unique accounts separate from Resolver wallets');
  }
  return { deployer: accounts[0], resolver: accounts[1], backupResolver: accounts[2], judges };
}

async function verifyFixtureRoleMapping(client, manifest) {
  const accounts = await client.request({ method: 'eth_accounts' });
  const expected = deploymentRoles(accounts);
  if (manifest.resolver.toLowerCase() !== expected.resolver.toLowerCase()
    || manifest.backupResolver.toLowerCase() !== expected.backupResolver.toLowerCase()
    || manifest.judges.length !== expected.judges.length
    || manifest.judges.some((judge, index) => judge.toLowerCase() !== expected.judges[index].toLowerCase())) {
    throw new Error('FundTogether manifest uses an outdated local account mapping; reset and redeploy the local chain');
  }
}

async function main() {
  const { parseDeploymentManifest, verifyDeploymentManifest } = require('../../dist/src/blockchain/deployment.js');
  const artifacts = generateCampaign(root);
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });
  if (await client.getChainId() !== 31339) throw new Error('FundTogether chain 31339 required; no transaction sent');
  const genesis = await client.getBlock({ blockNumber: 0n });

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = parseDeploymentManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      await verifyDeploymentManifest(client, manifest);
      await verifyFixtureRoleMapping(client, manifest);
      console.log('FundTogether Campaign deployment verified:', manifest.contractAddress);
      return;
    } catch (error) {
      if (!process.argv.includes('--create')) throw error;
      console.warn(`Existing Campaign manifest is not valid for this local chain: ${error.message}`);
    }
  }
  if (process.argv.includes('--verify-only')) throw new Error('FundTogether Campaign manifest missing or invalid');
  if (!process.argv.includes('--create')) throw new Error('FundTogether deployment requires --create');
  if (!String(await client.request({ method: 'web3_clientVersion' })).toLowerCase().includes('anvil')) throw new Error('Local unlocked Anvil required');

  const accounts = await client.request({ method: 'eth_accounts' });
  const { deployer, resolver, backupResolver, judges } = deploymentRoles(accounts);
  const wallet = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) });
  const tokenReceipt = await deploy(client, wallet, artifacts.tokenArtifact);
  const campaignReceipt = await deploy(client, wallet, artifacts.artifact, [tokenReceipt.contractAddress, resolver, backupResolver, judges]);
  const manifest = parseDeploymentManifest({
    protocolKind: 'CAMPAIGNS',
    chainId: 31339,
    rpcUrl,
    abiVersion: 'campaigns-local-judge-v1',
    abiHash: artifacts.abiHash,
    policyHash: artifacts.policyHash,
    tokenDecimals: 6,
    confirmations: 1,
    contractAddress: campaignReceipt.contractAddress,
    tokenAddress: tokenReceipt.contractAddress,
    resolver,
    backupResolver,
    judges,
    genesisHash: genesis.hash,
    contractCodeHash: keccak256(await client.getCode({ address: campaignReceipt.contractAddress })),
    tokenCodeHash: keccak256(await client.getCode({ address: tokenReceipt.contractAddress })),
    deploymentBlockNumber: campaignReceipt.blockNumber.toString(),
    deploymentBlockHash: campaignReceipt.blockHash,
  });
  await verifyDeploymentManifest(client, manifest);
  atomicWrite(manifestPath, manifest);
  console.log('FundTogether Campaign deployed and verified:', manifest.contractAddress);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { chain, manifestPath, deploymentRoles, verifyFixtureRoleMapping };
