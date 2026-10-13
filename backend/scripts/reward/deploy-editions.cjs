const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, keccak256 } = require('viem');
const { generateEditions } = require('./generate-editions-artifacts.cjs');
const { artifacts, verifyDeployment, atomicWrite } = require('./generate-artifacts.cjs');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  // Compile the shared verifier first: this script never maintains a second validation policy.
  const { parseEditionsDeployment, verifyEditionsDeployment } = require('../../dist/src/blockchain/editions-deployment.js');
  const prior = JSON.parse(fs.readFileSync(path.join(root, '.local/reward/generated/deployment.local.json'), 'utf8'));
  const file = path.join(root, '.local/reward/generated/editions-deployment.local.json');
  const { artifact, abiHash, policyHash } = generateEditions(root);
  const legacy = artifacts(root);
  const chain = defineChain({ id: 31339, name: 'FundTogether Editions local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [prior.rpcUrl] } } });
  const client = createPublicClient({ chain, transport: http(prior.rpcUrl), pollingInterval: 100 });
  await verifyDeployment(client, prior, legacy.reward.abi, legacy.token.abi);
  if (fs.existsSync(file)) {
    const manifest = parseEditionsDeployment(JSON.parse(fs.readFileSync(file, 'utf8')));
    await verifyEditionsDeployment(client, manifest);
    console.log('Existing Editions deployment verified:', manifest.contractAddress);
    return;
  }
  if (!process.argv.includes('--create')) throw new Error('Editions manifest missing; use --create only for a new local deployment');
  if (!String(await client.request({ method: 'web3_clientVersion' })).toLowerCase().includes('anvil')) throw new Error('Local unlocked Anvil required');
  const accounts = await client.request({ method: 'eth_accounts' });
  if (!accounts.length) throw new Error('No local deployer available');
  const wallet = createWalletClient({ account: accounts[0], chain, transport: http(prior.rpcUrl) });
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [prior.tokenAddress, prior.resolver, prior.backupResolver] });
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Editions deployment failed');
  const manifest = parseEditionsDeployment({ protocolKind: 'EDITIONS', chainId: 31339, rpcUrl: prior.rpcUrl, abiVersion: 'editions-local-v1', abiHash, policyHash,
    tokenDecimals: 6, confirmations: 1, contractAddress: receipt.contractAddress, tokenAddress: prior.tokenAddress, resolver: prior.resolver, backupResolver: prior.backupResolver,
    genesisHash: prior.genesisHash, tokenCodeHash: prior.tokenCodeHash, contractCodeHash: keccak256(await client.getCode({ address: receipt.contractAddress })),
    deploymentBlockNumber: receipt.blockNumber.toString(), deploymentBlockHash: receipt.blockHash });
  await verifyEditionsDeployment(client, manifest);
  atomicWrite(file, manifest);
  console.log('Separate local Editions deployment verified:', manifest.contractAddress);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
