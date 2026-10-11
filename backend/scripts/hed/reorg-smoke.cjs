const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } = require('viem');
const { artifacts, verifyDeployment } = require('./generate-artifacts.cjs');

const root = require('node:path').resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(require('node:path').join(root, '.local/hed/generated/deployment.local.json'), 'utf8'));
const chain = defineChain({ id: 31339, name: 'FundTogether HED', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
const apiUrl = process.env.HED_API_URL || 'http://127.0.0.1:3002';

const waitFor = async (condition, message) => {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(message);
};

async function main() {
  const { disbursement, token } = artifacts(root), client = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  await verifyDeployment(client, manifest, disbursement.abi, token.abi);
  const accounts = await client.request({ method: 'eth_accounts' });
  assert.ok(accounts.length >= 3, 'local HED Anvil needs organizer and donor accounts');
  const wallet = index => createWalletClient({ account: accounts[index], chain, transport: http(manifest.rpcUrl) });
  const send = async (index, abi, address, functionName, args) => {
    const hash = await wallet(index).writeContract({ abi, address, functionName, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    assert.equal(receipt.status, 'success', `${functionName} receipt`);
  };
  const snapshot = await client.request({ method: 'evm_snapshot' });
  try {
    const goal = 1_000_000_000n, commitment = keccak256(toHex(`hed-reorg:${Date.now()}`));
    const campaignId = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'nextCampaignId' });
    await send(0, token.abi, manifest.tokenAddress, 'mint', [accounts[2], goal]);
    await send(2, token.abi, manifest.tokenAddress, 'approve', [manifest.contractAddress, goal]);
    await send(0, disbursement.abi, manifest.contractAddress, 'createCampaign', [commitment, goal, 86_400n]);
    await send(2, disbursement.abi, manifest.contractAddress, 'donate', [campaignId, goal]);
    await waitFor(async () => (await fetch(`${apiUrl}/v1/disbursement/public/campaigns/${campaignId}`)).ok, 'HED indexer did not project temporary campaign');
    assert.equal(await client.request({ method: 'evm_revert', params: [snapshot] }), true, 'HED snapshot revert');
    await waitFor(async () => {
      const health = await fetch(`${apiUrl}/health`).then(response => response.json());
      const temporary = await fetch(`${apiUrl}/v1/disbursement/public/campaigns/${campaignId}`);
      return health.status === 'ready' && temporary.status === 404;
    }, 'HED indexer did not discard orphan projection after reorg');
    console.log(JSON.stringify({ revertedCampaignId: campaignId.toString(), status: 'orphan_projection_removed' }));
  } catch (error) {
    await client.request({ method: 'evm_revert', params: [snapshot] }).catch(() => undefined);
    throw error;
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
