const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } = require('viem');
const { artifacts, verifyDeployment } = require('./generate-artifacts.cjs');

const root = require('node:path').resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(require('node:path').join(root, '.local/hed/generated/deployment.local.json'), 'utf8'));
const chain = defineChain({ id: 31339, name: 'FundTogether HED', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [manifest.rpcUrl] } } });
const apiUrl = process.env.HED_API_URL || 'http://127.0.0.1:3002';

async function main() {
  console.log('--- Starting Automated 6-Scenario E2E Acceptance Suite ---');
  const { disbursement, token } = artifacts(root);
  const client = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  await verifyDeployment(client, manifest, disbursement.abi, token.abi);

  const accounts = await client.request({ method: 'eth_accounts' });
  assert.ok(accounts.length >= 4, 'local HED Anvil needs primary, backup, donor and organizer accounts');
  const [organizer, backupResolver, donor] = accounts;

  const wallet = index => createWalletClient({ account: accounts[index], chain, transport: http(manifest.rpcUrl) });
  const send = async (index, abi, address, functionName, args) => {
    const hash = await wallet(index).writeContract({ abi, address, functionName, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    assert.equal(receipt.status, 'success', `${functionName} receipt`);
    return receipt;
  };

  const assertRevert = async (action, label) => {
    try {
      await action();
      assert.fail(`Expected revert for ${label}, but call succeeded`);
    } catch (err) {
      const msg = err.message || String(err);
      assert.ok(
        msg.includes('revert') || msg.includes('InvalidInput') || msg.includes('WrongState') || msg.includes('execution reverted'),
        `Revert verified for ${label}: ${msg}`
      );
    }
  };

  const hash = label => keccak256(toHex(`hed-e2e:${label}:${Date.now()}:${Math.random()}`));
  const goal = 4_000_000_000n; // 4,000 USDC base units

  // Helper: Setup funded & activated campaign
  async function setupCampaign(tag) {
    const commitment = hash(`campaign-${tag}`);
    await send(0, token.abi, manifest.tokenAddress, 'mint', [donor, goal]);
    await send(2, token.abi, manifest.tokenAddress, 'approve', [manifest.contractAddress, goal]);
    await send(0, disbursement.abi, manifest.contractAddress, 'createCampaign', [commitment, goal, 86_400n]);
    const campaignId = (await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'nextCampaignId' })) - 1n;
    await send(2, disbursement.abi, manifest.contractAddress, 'donate', [campaignId, goal]);
    await send(0, disbursement.abi, manifest.contractAddress, 'activateCampaign', [campaignId, hash(`eligibility-${tag}`)]);
    return campaignId;
  }

  // -------------------------------------------------------------
  // Scenario 1: Happy Path
  // -------------------------------------------------------------
  console.log('[Scenario 1] Running Happy Path (25% Request -> Settle -> Outcome Verify)...');
  {
    const campaignId = await setupCampaign('s1');
    const purchase = 1_000_000_000n; // 25% hard cap
    const transport = 500_000_000n;  // 12.5%
    const activityCeiling = purchase + transport; // 37.5% <= 50% cap
    await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, hash('act-s1'), activityCeiling]);

    // Request 1 (Purchase: 25%)
    const req1Hash = hash('req1');
    await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, req1Hash, organizer, purchase]);
    await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 0n, req1Hash]);
    const exp1Hash = hash('exp1');
    await send(0, disbursement.abi, manifest.contractAddress, 'candidateExpenditure', [campaignId, 0n, purchase, exp1Hash]);
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });
    await send(0, disbursement.abi, manifest.contractAddress, 'finalizeExpenditure', [campaignId, 0n]);

    // Request 2 (Transport: 12.5%)
    const req2Hash = hash('req2');
    await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, req2Hash, organizer, transport]);
    await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 1n, req2Hash]);
    const exp2Hash = hash('exp2');
    await send(0, disbursement.abi, manifest.contractAddress, 'candidateExpenditure', [campaignId, 1n, transport, exp2Hash]);
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });
    await send(0, disbursement.abi, manifest.contractAddress, 'finalizeExpenditure', [campaignId, 1n]);

    // Outcome verification
    const outcomeHash = hash('outcome-s1');
    await send(0, disbursement.abi, manifest.contractAddress, 'candidateOutcome', [campaignId, 0n, outcomeHash]);
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });
    await send(0, disbursement.abi, manifest.contractAddress, 'verifyOutcome', [campaignId, 0n, outcomeHash]);

    const act = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'activity', args: [campaignId, 0n] });
    assert.equal(act.state, 2, 'Activity must be VERIFIED');
    console.log('✓ Scenario 1 passed');
  }

  // -------------------------------------------------------------
  // Scenario 2: 25% Request Hard Cap Revert
  // -------------------------------------------------------------
  console.log('[Scenario 2] Verifying 25% Request Hard Cap enforcement...');
  {
    const campaignId = await setupCampaign('s2');
    await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, hash('act-s2'), 2_000_000_000n]);
    const excessiveAmount = (goal / 4n) + 1n; // 25% + 1 wei
    await assertRevert(
      () => client.simulateContract({
        account: organizer,
        address: manifest.contractAddress,
        abi: disbursement.abi,
        functionName: 'submitRequest',
        args: [campaignId, 0n, hash('excessive-req'), organizer, excessiveAmount],
      }),
      'Request amount > 25% goal must revert with InvalidInput'
    );
    console.log('✓ Scenario 2 passed');
  }

  // -------------------------------------------------------------
  // Scenario 3: 50% Outcome Exposure & Single Open Activity Limit
  // -------------------------------------------------------------
  console.log('[Scenario 3] Verifying 50% Outcome Exposure & Single Open Activity guardrails...');
  {
    const campaignId = await setupCampaign('s3');
    const excessiveCeiling = (goal / 2n) + 1n; // 50% + 1 wei
    await assertRevert(
      () => client.simulateContract({
        account: organizer,
        address: manifest.contractAddress,
        abi: disbursement.abi,
        functionName: 'createActivity',
        args: [campaignId, hash('excessive-act'), excessiveCeiling],
      }),
      'Activity ceiling > 50% goal must revert with InvalidInput'
    );

    // Create 1 valid open activity
    await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, hash('act-valid'), 2_000_000_000n]);

    // Attempting to create a second open activity before first is verified must revert
    await assertRevert(
      () => client.simulateContract({
        account: organizer,
        address: manifest.contractAddress,
        abi: disbursement.abi,
        functionName: 'createActivity',
        args: [campaignId, hash('second-act'), 1_000_000_000n],
      }),
      'Creating 2nd open activity before first is VERIFIED must revert with WrongState'
    );
    console.log('✓ Scenario 3 passed');
  }

  // -------------------------------------------------------------
  // Scenario 4: Surplus Return (Return Unused Funds to Escrow)
  // -------------------------------------------------------------
  console.log('[Scenario 4] Verifying returnFunds surplus refund to Escrow...');
  {
    const campaignId = await setupCampaign('s4');
    const disburseAmount = 1_000_000_000n; // 25%
    const surplusReturn = 200_000_000n;    // 5% surplus
    await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, hash('act-s4'), 2_000_000_000n]);
    const reqHash = hash('req-s4');
    await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, reqHash, organizer, disburseAmount]);
    await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 0n, reqHash]);

    const campaignBefore = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'campaign', args: [campaignId] });
    // Organizer approves token and calls returnFunds
    await send(0, token.abi, manifest.tokenAddress, 'approve', [manifest.contractAddress, surplusReturn]);
    await send(0, disbursement.abi, manifest.contractAddress, 'returnFunds', [campaignId, 0n, surplusReturn]);

    const campaignAfter = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'campaign', args: [campaignId] });
    const req = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'request', args: [campaignId, 0n] });

    assert.equal(campaignAfter.available, campaignBefore.available + surplusReturn, 'Available pool must restore returned funds');
    assert.equal(req.returned, surplusReturn, 'Request returned amount must match surplus');
    console.log('✓ Scenario 4 passed');
  }

  // -------------------------------------------------------------
  // Scenario 5: Donor Dispute Blocks Settlement until Resolver Decision
  // -------------------------------------------------------------
  console.log('[Scenario 5] Verifying Donor challenge blocks settlement during review window...');
  {
    const campaignId = await setupCampaign('s5');
    const amount = 1_000_000_000n;
    await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, hash('act-s5'), 2_000_000_000n]);
    const reqHash = hash('req-s5');
    await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, reqHash, organizer, amount]);
    await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 0n, reqHash]);
    await send(0, disbursement.abi, manifest.contractAddress, 'candidateExpenditure', [campaignId, 0n, amount, hash('exp-s5')]);

    // Donor opens case during challenge window
    const challengeReason = hash('dispute-fake-receipt');
    await send(2, disbursement.abi, manifest.contractAddress, 'openExpenditureCase', [campaignId, 0n, challengeReason]);

    // Advance time past original challenge end
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });

    // Finalize expenditure MUST REVERT because case is still open
    await assertRevert(
      () => client.simulateContract({
        account: organizer,
        address: manifest.contractAddress,
        abi: disbursement.abi,
        functionName: 'finalizeExpenditure',
        args: [campaignId, 0n],
      }),
      'Finalize expenditure must revert while dispute case is open'
    );

    // Resolver upholds case with decision
    await send(0, disbursement.abi, manifest.contractAddress, 'upholdExpenditureCase', [campaignId, 0n, hash('resolver-resolution')]);

    // Advance time past the new challenge window granted after uphold
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });

    // Now finalize expenditure succeeds
    await send(0, disbursement.abi, manifest.contractAddress, 'finalizeExpenditure', [campaignId, 0n]);
    const req = await client.readContract({ address: manifest.contractAddress, abi: disbursement.abi, functionName: 'request', args: [campaignId, 0n] });
    assert.equal(req.state, 4, 'Request must reach FINANCIALLY_SETTLED after dispute upheld and window elapsed');
    console.log('✓ Scenario 5 passed');
  }

  // -------------------------------------------------------------
  // Scenario 6: Wind-Down & Refund Claim
  // -------------------------------------------------------------
  console.log('[Scenario 6] Verifying Wind-Down & Donor proportional refund claim...');
  {
    const campaignId = await setupCampaign('s6');
    const disburseAmount = 1_000_000_000n; // 25% spent
    await send(0, disbursement.abi, manifest.contractAddress, 'createActivity', [campaignId, hash('act-s6'), 2_000_000_000n]);
    const reqHash = hash('req-s6');
    await send(0, disbursement.abi, manifest.contractAddress, 'submitRequest', [campaignId, 0n, reqHash, organizer, disburseAmount]);
    await send(0, disbursement.abi, manifest.contractAddress, 'approveAndDisburse', [campaignId, 0n, reqHash]);
    await send(0, disbursement.abi, manifest.contractAddress, 'candidateExpenditure', [campaignId, 0n, disburseAmount, hash('exp-s6')]);
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });
    await send(0, disbursement.abi, manifest.contractAddress, 'finalizeExpenditure', [campaignId, 0n]);

    // Advance time past execution horizon (180 days)
    await client.request({ method: 'evm_increaseTime', params: [181 * 24 * 60 * 60] });
    await client.request({ method: 'evm_mine' });

    // Trigger wind-down
    await send(0, disbursement.abi, manifest.contractAddress, 'startWindDown', [campaignId]);

    const donorBalanceBefore = await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [donor] });
    // Donor claims refund for remaining 3,000 USDC
    await send(2, disbursement.abi, manifest.contractAddress, 'claimRefund', [campaignId]);
    const donorBalanceAfter = await client.readContract({ address: manifest.tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [donor] });

    const expectedRefund = goal - disburseAmount; // 3,000,000,000n
    assert.equal(donorBalanceAfter - donorBalanceBefore, expectedRefund, 'Donor must receive exact remaining custody refund');
    console.log('✓ Scenario 6 passed');
  }

  console.log(JSON.stringify({ status: 'all_6_scenarios_passed', count: 6, timestamp: new Date().toISOString() }));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
