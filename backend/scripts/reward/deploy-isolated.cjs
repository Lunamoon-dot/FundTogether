const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, keccak256 } = require('viem');
const { generate, atomicWrite, hashJson, verifyDeployment } = require('./generate-artifacts.cjs');

const root = path.resolve(__dirname, '../../..');
const manifestPath = path.join(root, '.local/reward/generated/deployment.local.json');
const rpcUrl = process.env.REWARD_RPC_URL || 'http://127.0.0.1:9548';
const chain = defineChain({ id: 31339, name: 'FundTogether Reward', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });

async function main() {
  const result = generate(root);
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 200 });
  if (await client.getChainId() !== 31339) throw new Error('Reward chain 31339 required; no transaction sent');
  if (process.argv.includes('--rpc-check')) return console.log('Reward RPC reachable on chain 31339');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await verifyDeployment(client, manifest, result.reward.abi, result.token.abi);
    if (manifest.rpcUrl !== rpcUrl) atomicWrite(manifestPath, { ...manifest, rpcUrl });
    return console.log('Reward existing deployment verified:', manifest.contractAddress);
  }
  if (process.argv.includes('--verify-only')) throw new Error('Reward manifest missing; listener identity not assumed safe');
  if (!process.argv.includes('--create')) throw new Error('Reward deployment requires --create; no reset/redeploy option exists');
  if (!String(await client.request({ method: 'web3_clientVersion' })).toLowerCase().includes('anvil')) throw new Error('Reward unlocked local Anvil required');
  const accounts = await client.request({ method: 'eth_accounts' });
  if (accounts.length < 3) throw new Error('Reward requires distinct creator, resolver, and backup resolver accounts');
  const wallet = createWalletClient({ account: accounts[0], chain, transport: http(rpcUrl) });
  const deploy = async (artifact, args = []) => {
    const txHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Reward deployment receipt failed');
    return receipt;
  };
  const token = await deploy(result.token);
  const contract = await deploy(result.reward, [token.contractAddress, accounts[1], accounts[2], result.policyHash]);
  const manifest = { protocolKind: 'REWARD', chainId: 31339, rpcUrl, abiVersion: '1', abiHash: hashJson(result.reward.abi), policyHash: result.policyHash,
    tokenDecimals: 6, confirmations: 1, contractAddress: contract.contractAddress, tokenAddress: token.contractAddress, resolver: accounts[1], backupResolver: accounts[2],
    genesisHash: (await client.getBlock({ blockNumber: 0n })).hash, contractCodeHash: keccak256(await client.getCode({ address: contract.contractAddress })),
    tokenCodeHash: keccak256(await client.getCode({ address: token.contractAddress })), deploymentBlockNumber: contract.blockNumber.toString(), deploymentBlockHash: contract.blockHash };
  await verifyDeployment(client, manifest, result.reward.abi, result.token.abi);
  atomicWrite(manifestPath, manifest);
  console.log('Reward deployed and verified:', manifest.contractAddress);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { chain, manifestPath };
