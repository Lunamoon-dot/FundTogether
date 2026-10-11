const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, keccak256 } = require('viem');
const { generate, atomicWrite, verifyDeployment } = require('./generate-artifacts.cjs');

const root = path.resolve(__dirname, '../../..');
const manifestPath = path.join(root, '.local/hed/generated/deployment.local.json');
const rpcUrl = process.env.HED_BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:9548';
const chain = defineChain({ id: 31339, name: 'FundTogether HED', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } } });

async function main() {
  const artifacts = generate(root);
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 200 });
  if (await client.getChainId() !== 31339) throw new Error('HED chain 31339 required; no transaction sent');
  if (process.argv.includes('--rpc-check')) return console.log('HED RPC reachable on chain 31339');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await verifyDeployment(client, manifest, artifacts.disbursement.abi, artifacts.token.abi);
    return console.log('HED existing deployment verified:', manifest.contractAddress);
  }
  if (process.argv.includes('--verify-only')) throw new Error('HED manifest missing; listener identity not assumed safe');
  if (!process.argv.includes('--create')) throw new Error('HED deployment requires --create; no reset/redeploy option exists');
  if (!String(await client.request({ method: 'web3_clientVersion' })).toLowerCase().includes('anvil'))
    throw new Error('HED unlocked local Anvil required');
  const accounts = await client.request({ method: 'eth_accounts' });
  if (accounts.length < 2) throw new Error('HED requires distinct unlocked primary and backup resolver accounts');
  const wallet = createWalletClient({ account: accounts[0], chain, transport: http(rpcUrl) });
  const deploy = async (artifact, args = []) => {
    const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('HED deployment receipt failed');
    return receipt;
  };
  const token = await deploy(artifacts.token);
  const contract = await deploy(artifacts.disbursement, [token.contractAddress, accounts[0], accounts[1], artifacts.policyHash]);
  const manifest = { protocolKind: 'HED', chainId: 31339, rpcUrl, abiVersion: '1', abiHash: hashJson(artifacts.disbursement.abi),
    policyHash: artifacts.policyHash, tokenDecimals: 6, confirmations: 1, contractAddress: contract.contractAddress,
    tokenAddress: token.contractAddress, resolver: accounts[0], backupResolver: accounts[1],
    genesisHash: (await client.getBlock({ blockNumber: 0n })).hash, contractCodeHash: keccak256(await client.getCode({ address: contract.contractAddress })),
    tokenCodeHash: keccak256(await client.getCode({ address: token.contractAddress })), deploymentBlockNumber: contract.blockNumber.toString(), deploymentBlockHash: contract.blockHash };
  await verifyDeployment(client, manifest, artifacts.disbursement.abi, artifacts.token.abi);
  atomicWrite(manifestPath, manifest);
  console.log('HED deployed and verified:', JSON.stringify(manifest));
}

const { hashJson } = require('./generate-artifacts.cjs');
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { chain, manifestPath };
