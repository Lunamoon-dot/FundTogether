const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createPublicClient, createWalletClient, defineChain, http, keccak256 } = require('viem');
const { generate, atomicWrite, verifyDeployment, workflowPolicy } = require('./generate-artifacts.cjs');

const root = path.resolve(__dirname, '../../..');
const manifestPath = path.join(root, '.local/workflow-b/generated/deployment.local.json');
const rpcUrl = 'http://127.0.0.1:9547';
const chain = defineChain({ id: 31338, name: 'FundTogether Workflow B',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });

async function main() {
  const a = generate(root);
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 200 });
  if (await client.getChainId() !== 31338) throw new Error('Workflow B chain 31338 required; no transaction sent');
  if (process.argv.includes('--rpc-check')) return console.log('Workflow B RPC reachable on chain 31338');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await verifyDeployment(client, manifest, a.advance.abi, a.token.abi);
    return console.log('Workflow B existing deployment verified:', manifest.contractAddress);
  }
  if (process.argv.includes('--verify-only')) throw new Error('Workflow B manifest missing; existing listener not assumed safe');
  // The start helper launches a new isolated node and calls this explicit creation command.
  if (!process.argv.includes('--create')) throw new Error('Workflow B new deployment requires --create; no reset/redeploy option exists');
  if (!String(await client.request({ method: 'web3_clientVersion' })).toLowerCase().includes('anvil'))
    throw new Error('Workflow B unlocked local Anvil required');
  const accounts = await client.request({ method: 'eth_accounts' });
  if (accounts.length < 4) throw new Error('Workflow B requires isolated unlocked test accounts');
  const wallet = createWalletClient({ account: accounts[0], chain, transport: http(rpcUrl) });
  const deploy = async (artifact, args = []) => {
    const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Workflow B deployment receipt failed');
    return receipt;
  };
  const token = await deploy(a.token);
  const deploymentId = `0x${randomBytes(32).toString('hex')}`;
  const contract = await deploy(a.advance, [token.contractAddress, accounts[0], deploymentId]);
  const manifest = { protocolKind: 'ADVANCE', chainId: 31338, rpcUrl, abiVersion: '1', abiHash: a.abiHash,
    policyHash: a.policyHash, workflowPolicy, deploymentId, tokenDecimals: 6, confirmations: 1,
    contractAddress: contract.contractAddress, tokenAddress: token.contractAddress, resolver: accounts[0],
    genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
    contractCodeHash: keccak256(await client.getCode({ address: contract.contractAddress })),
    tokenCodeHash: keccak256(await client.getCode({ address: token.contractAddress })),
    deploymentBlockNumber: contract.blockNumber.toString(), deploymentBlockHash: contract.blockHash };
  await verifyDeployment(client, manifest, a.advance.abi, a.token.abi);
  const next = await client.readContract({ address: manifest.contractAddress, abi: a.advance.abi, functionName: 'nextCampaignId' });
  const balance = await client.readContract({ address: manifest.tokenAddress, abi: a.token.abi, functionName: 'balanceOf', args: [manifest.contractAddress] });
  if (next !== 0n || balance !== 0n) throw new Error('Workflow B initial campaign/balance mismatch; manifest not promoted');
  atomicWrite(manifestPath, manifest);
  console.log('Workflow B deployed and verified:', JSON.stringify(manifest));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { chain, manifestPath };
