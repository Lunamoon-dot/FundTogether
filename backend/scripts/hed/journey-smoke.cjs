const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } = require('viem');
const { artifacts, verifyDeployment } = require('./generate-artifacts.cjs');

const root = require('node:path').resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(require('node:path').join(root, '.local/hed/generated/deployment.local.json'), 'utf8'));
const chain = defineChain({ id: 31339, name: 'FundTogether HED', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });

async function main() {
  const { disbursement, token } = artifacts(root), client = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  await verifyDeployment(client, manifest, disbursement.abi, token.abi);
  const accounts = await client.request({ method: 'eth_accounts' });
  assert.ok(accounts.length >= 4, 'local HED Anvil needs primary, backup, donor and vendor accounts');
  const wallet = index => createWalletClient({ account: accounts[index], chain, transport: http(manifest.rpcUrl) });
  const send = async (index, abi, address, functionName, args) => {
    const hash = await wallet(index).writeContract({ abi, address, functionName, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    assert.equal(receipt.status, 'success', `${functionName} receipt`); return receipt;
  };
  const hash = label => keccak256(toHex(`hed-smoke:${label}:${Date.now()}`));
  const goal = 2_000_000_000n, request = 1_000_000_000n;
  const commitment = hash('campaign'), eligibility = hash('eligibility'), activityHash = hash('activity'), requestHash = hash('request');
  const vendorBalanceBefore = await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [accounts[3]] });
  await send(0, token.abi, manifest.tokenAddress, 'mint', [accounts[2], goal]);
  await send(2, token.abi, manifest.tokenAddress, 'approve', [manifest.contractAddress, goal]);
  await send(0, disbursement.abi, manifest.contractAddress, 'createCampaign', [commitment, goal, 86_400n]);
  const campaignId = (await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'nextCampaignId' })) - 1n;
  await send(2, disbursement.abi, manifest.contractAddress, 'donate', [campaignId, goal]);
  await send(0, disbursement.abi, manifest.contractAddress, 'activateCampaign', [campaignId, eligibility]);
  await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, activityHash, request]);
  await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, requestHash, accounts[3], request, 0n]);
  await send(0, disbursement.abi, manifest.contractAddress, 'approveRequest', [campaignId, 0n, requestHash]);
  await send(3, disbursement.abi, manifest.contractAddress, 'acknowledgeVendor', [campaignId, 0n, requestHash]);
  await send(0, disbursement.abi, manifest.contractAddress, 'candidateDelivery', [campaignId, 0n, request, hash('delivery')]);
  await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60] }); await client.request({ method: 'evm_mine' });
  await send(1, disbursement.abi, manifest.contractAddress, 'executeFinal', [campaignId, 0n]);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [accounts[3]] }), vendorBalanceBefore + request);
  await send(0, disbursement.abi, manifest.contractAddress, 'candidateOutcome', [campaignId, 0n, hash('outcome')]);
  await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60] }); await client.request({ method: 'evm_mine' });
  await send(0, disbursement.abi, manifest.contractAddress, 'verifyOutcome', [campaignId, 0n, hash('outcome-final')]);
  const activity = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'activity', args: [campaignId, 0n] });
  assert.equal(activity.state, 2); console.log(JSON.stringify({ campaignId: campaignId.toString(), vendorPaid: request.toString(), outcomeState: 'VERIFIED' }));
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
