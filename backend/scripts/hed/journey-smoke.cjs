const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } = require('viem');
const { artifacts, verifyDeployment } = require('./generate-artifacts.cjs');

const root = require('node:path').resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(require('node:path').join(root, '.local/hed/generated/deployment.local.json'), 'utf8'));
const chain = defineChain({ id: 31339, name: 'FundTogether HED', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
const apiUrl = process.env.HED_API_URL || 'http://127.0.0.1:3002';

async function main() {
  const { disbursement, token } = artifacts(root), client = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  await verifyDeployment(client, manifest, disbursement.abi, token.abi);
  const accounts = await client.request({ method: 'eth_accounts' });
  assert.ok(accounts.length >= 4, 'local HED Anvil needs primary, backup, donor and organizer accounts');
  const wallet = index => createWalletClient({ account: accounts[index], chain, transport: http(manifest.rpcUrl) });
  const send = async (index, abi, address, functionName, args) => {
    const hash = await wallet(index).writeContract({ abi, address, functionName, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    assert.equal(receipt.status, 'success', `${functionName} receipt`); return receipt;
  };
  const hash = label => keccak256(toHex(`hed-smoke:${label}:${Date.now()}`));
  const projection = async campaignId => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(`${apiUrl}/v1/disbursement/public/campaigns/${campaignId}`);
      if (response.ok) {
        const value = await response.json();
        if (value.requests?.length === 2 && value.requests.every(request => request.state === 'FINANCIALLY_SETTLED')
          && value.activities?.[0]?.state === 'VERIFIED') return value;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('HED indexer projection did not catch up to the verified journey');
  };
  const goal = 4_000_000_000n, purchase = 1_000_000_000n, transport = 500_000_000n;
  const commitment = hash('campaign'), eligibility = hash('eligibility'), activityHash = hash('activity'), purchaseHash = hash('purchase-request'), transportHash = hash('transport-request');
  const recipient = accounts[0];
  const balanceBefore = await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [recipient] });
  await send(0, token.abi, manifest.tokenAddress, 'mint', [accounts[2], goal]);
  await send(2, token.abi, manifest.tokenAddress, 'approve', [manifest.contractAddress, goal]);
  await send(0, disbursement.abi, manifest.contractAddress, 'createCampaign', [commitment, goal, 86_400n]);
  const campaignId = (await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'nextCampaignId' })) - 1n;
  await send(2, disbursement.abi, manifest.contractAddress, 'donate', [campaignId, goal]);
  await send(0, disbursement.abi, manifest.contractAddress, 'activateCampaign', [campaignId, eligibility]);
  await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, activityHash, purchase + transport]);
  await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, purchaseHash, recipient, purchase]);
  await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 0n, purchaseHash]);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [recipient] }), balanceBefore + purchase);
  const expenditureReportHash = hash('expenditure');
  await send(0, disbursement.abi, manifest.contractAddress, 'candidateExpenditure', [campaignId, 0n, purchase, expenditureReportHash]);
  const expenditure = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'request', args: [campaignId, 0n] });
  assert.equal(expenditure.expenditureReportHash, expenditureReportHash);
  await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60] }); await client.request({ method: 'evm_mine' });
  await send(1, disbursement.abi, manifest.contractAddress, 'finalizeExpenditure', [campaignId, 0n]);
  await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, transportHash, recipient, transport]);
  await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 1n, transportHash]);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [recipient] }), balanceBefore + purchase + transport);
  const transportReportHash = hash('transport-expenditure');
  await send(0, disbursement.abi, manifest.contractAddress, 'candidateExpenditure', [campaignId, 1n, transport, transportReportHash]);
  const transportExpenditure = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'request', args: [campaignId, 1n] });
  assert.equal(transportExpenditure.expenditureReportHash, transportReportHash);
  await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60] }); await client.request({ method: 'evm_mine' });
  await send(1, disbursement.abi, manifest.contractAddress, 'finalizeExpenditure', [campaignId, 1n]);
  const outcomeReportHash = hash('outcome');
  await send(0, disbursement.abi, manifest.contractAddress, 'candidateOutcome', [campaignId, 0n, outcomeReportHash]);
  await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60] }); await client.request({ method: 'evm_mine' });
  await send(0, disbursement.abi, manifest.contractAddress, 'verifyOutcome', [campaignId, 0n, outcomeReportHash]);
  const activity = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'activity', args: [campaignId, 0n] });
  assert.equal(activity.outcomeReportHash, outcomeReportHash); assert.equal(activity.approved, purchase + transport); assert.equal(activity.state, 2);
  const indexed = await projection(campaignId);
  assert.equal(indexed.activities[0].outcomeReportHash, outcomeReportHash);
  assert.equal(indexed.requests[0].expenditureReportHash, expenditureReportHash);
  assert.equal(indexed.requests[1].expenditureReportHash, transportReportHash);
  assert.ok(indexed.riskProjection, 'indexed snapshot must include riskProjection');
  assert.equal(indexed.riskProjection.financialExposure, '0');
  assert.equal(indexed.riskProjection.outcomeExposure, '0');
  assert.equal(indexed.riskProjection.maxRequestCap, '1000000000');
  console.log(JSON.stringify({ campaignId: campaignId.toString(), purchasePaid: purchase.toString(), transportPaid: transport.toString(), outcomeState: 'VERIFIED', indexedBlock: indexed.checkpoint.blockNumber, riskProjection: indexed.riskProjection }));
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
