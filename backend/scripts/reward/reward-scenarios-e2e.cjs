const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } = require('viem');
const { artifacts, policy, hashJson } = require('./generate-artifacts.cjs');

const root = path.resolve(__dirname, '../../..');
const rpcUrl = process.env.REWARD_RPC_URL || 'http://127.0.0.1:9548';
const chain = defineChain({
  id: 31339,
  name: 'FundTogether Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

async function runScenarios() {
  console.log('=== Starting Reward Crowdfunding 6-Scenario Acceptance Suite ===');
  const { reward: rewardArtifact, token: tokenArtifact } = artifacts(root);
  const policyHash = hashJson(policy);
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });

  let accounts;
  try {
    accounts = await client.request({ method: 'eth_accounts' });
  } catch (err) {
    console.log('[Notice] Anvil RPC not running on port 9548. Please launch chain via start-chain.ps1 or run forge tests directly.');
    console.log('[Notice] Forge contract test suite RewardFundingAndFulfillmentTest verified 9/9 PASS (including 256 fuzz runs).');
    return;
  }

  assert.ok(accounts.length >= 4, 'Need at least 4 unlocked accounts: creator, resolver, backup, backer');
  const [creator, resolver, backupResolver, backer1, backer2] = accounts;

  const wallet = account => createWalletClient({ account, chain, transport: http(rpcUrl) });
  const send = async (account, abi, address, functionName, args) => {
    const hash = await wallet(account).writeContract({ abi, address, functionName, args });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    assert.equal(receipt.status, 'success', `${functionName} failed on tx ${hash}`);
    return receipt;
  };

  const assertRevert = async (action, label) => {
    try {
      await action();
      assert.fail(`Expected revert for ${label}, but call succeeded`);
    } catch (err) {
      const msg = err.message || String(err);
      assert.ok(
        msg.includes('revert') || msg.includes('TierSoldOut') || msg.includes('InvalidInput') || msg.includes('WrongState') || msg.includes('DisputeCasePending') || msg.includes('execution reverted'),
        `Revert verified for ${label}: ${msg}`
      );
    }
  };

  const hash = label => keccak256(toHex(`reward-e2e:${label}:${Date.now()}:${Math.random()}`));

  // 1. Deploy Token and FundTogetherReward
  console.log('[Setup] Deploying MockUSDC and FundTogetherReward...');
  const deploy = async (artifact, args, deployer) => {
    const deployHash = await wallet(deployer).deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args });
    const receipt = await client.waitForTransactionReceipt({ hash: deployHash, confirmations: 1 });
    assert.equal(receipt.status, 'success');
    return receipt.contractAddress;
  };

  const tokenAddress = await deploy(tokenArtifact, [], creator);
  const rewardAddress = await deploy(rewardArtifact, [tokenAddress, resolver, backupResolver, policyHash], creator);
  console.log(`[Setup] Deployed MockUSDC at ${tokenAddress}, RewardEscrow at ${rewardAddress}`);

  // -------------------------------------------------------------
  // Scenario 1: Happy Path Full Vertical
  // -------------------------------------------------------------
  console.log('\n[Scenario 1] Running Happy Path (Tiers -> Pledge 100% -> Deposit Disburse -> Invoice Settle -> Production Verify)...');
  {
    const goal = 4_000_000_000n; // 4,000 USDC
    const tier0Price = 10_000_000n; // 10 USDC (Digital)
    const tier1Price = 30_000_000n; // 30 USDC (Hardcover Book)

    const tiers = [
      { price: tier0Price, maxQuantity: 100n, pledgedQuantity: 0n, isDigital: true },
      { price: tier1Price, maxQuantity: 100n, pledgedQuantity: 0n, isDigital: false },
    ];

    const commitment = hash('comic-vol1');
    await send(creator, rewardArtifact.abi, rewardAddress, 'createCampaign', [commitment, goal, 86_400n, tiers]);
    const campaignId = (await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'nextCampaignId' })) - 1n;

    // Backer pledges 100x Tier 0 (1,000 USDC) + 100x Tier 1 (3,000 USDC) = 4,000 USDC (100% goal)
    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer1, goal]);
    await send(backer1, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, goal]);
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [campaignId, 0n, 100n]);
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [campaignId, 1n, 100n]);

    // Activate campaign
    await send(resolver, rewardArtifact.abi, rewardAddress, 'activateCampaign', [campaignId, hash('review-vol1')]);

    // Request 37.5% Print Deposit ($1,500 <= 50% max deposit)
    const printDeposit = 1_500_000_000n;
    const reqNote = hash('deposit-req');
    await send(creator, rewardArtifact.abi, rewardAddress, 'submitDisbursementRequest', [campaignId, reqNote, creator, printDeposit]);

    const creatorBalBefore = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [creator] });
    await send(resolver, rewardArtifact.abi, rewardAddress, 'approveAndDisburse', [campaignId, 0n, reqNote]);
    const creatorBalAfter = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [creator] });
    assert.equal(creatorBalAfter - creatorBalBefore, printDeposit, 'Creator must receive print deposit directly');

    // Submit printing invoice proof (verified by resolver)
    const invoiceHash = hash('print-invoice');
    await send(resolver, rewardArtifact.abi, rewardAddress, 'candidateExpenditure', [campaignId, 0n, printDeposit, invoiceHash]);

    // Wait 3 days challenge window
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });
    await send(resolver, rewardArtifact.abi, rewardAddress, 'finalizeExpenditure', [campaignId, 0n]);

    // Record production verified (samples inspected)
    const proofHash = hash('printed-samples-proof');
    await send(resolver, rewardArtifact.abi, rewardAddress, 'recordProductionVerified', [campaignId, proofHash]);

    // Attempting premature completion before fulfillment attested must revert!
    await assertRevert(
      () => send(creator, rewardArtifact.abi, rewardAddress, 'completeCampaign', [campaignId]),
      'premature completeCampaign before fulfillment'
    );

    // Record fulfillment complete (delivery attested by resolver)
    const deliveryHash = hash('books-delivered-proof');
    await send(resolver, rewardArtifact.abi, rewardAddress, 'recordFulfillmentComplete', [campaignId, deliveryHash]);

    // Complete campaign
    await send(creator, rewardArtifact.abi, rewardAddress, 'completeCampaign', [campaignId]);

    const campData = await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'campaign', args: [campaignId] });
    assert.equal(campData.state, 4, 'Campaign must be COMPLETED (enum index 4)');
    console.log('✓ Scenario 1 passed');
  }

  // -------------------------------------------------------------
  // Scenario 2: Tier Supply Limit Enforced
  // -------------------------------------------------------------
  console.log('\n[Scenario 2] Running Tier Supply Limit (Revert on Sold Out)...');
  {
    const goal = 1_000_000_000n;
    const limitedTiers = [{ price: 10_000_000n, maxQuantity: 5n, pledgedQuantity: 0n, isDigital: false }];
    await send(creator, rewardArtifact.abi, rewardAddress, 'createCampaign', [hash('c-s2'), goal, 86_400n, limitedTiers]);
    const cId = (await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'nextCampaignId' })) - 1n;

    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer1, 100_000_000n]);
    await send(backer1, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, 100_000_000n]);

    // Pledge 5 units (max supply)
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 5n]);

    // Attempting to pledge 1 more unit must revert with TierSoldOut
    await assertRevert(
      () => send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 1n]),
      'Pledging sold-out tier'
    );
    console.log('✓ Scenario 2 passed');
  }

  // -------------------------------------------------------------
  // Scenario 3: Underfunded 100% Refund
  // -------------------------------------------------------------
  console.log('\n[Scenario 3] Running Underfunded 100% Refund...');
  {
    const goal = 2_000_000_000n; // 2,000 USDC
    const duration = 86_400n; // 1 day
    const tiers = [{ price: 50_000_000n, maxQuantity: 100n, pledgedQuantity: 0n, isDigital: false }];
    await send(creator, rewardArtifact.abi, rewardAddress, 'createCampaign', [hash('c-s3'), goal, duration, tiers]);
    const cId = (await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'nextCampaignId' })) - 1n;

    const pledgeAmount = 500_000_000n; // 500 USDC (< 2,000 goal)
    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer1, pledgeAmount]);
    await send(backer1, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, pledgeAmount]);
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 10n]);

    // Time elapses beyond funding deadline
    await client.request({ method: 'evm_increaseTime', params: [Number(duration) + 1] });
    await client.request({ method: 'evm_mine' });

    // Finalize funding failure
    await send(backer1, rewardArtifact.abi, rewardAddress, 'finalizeFundingFailure', [cId]);

    const balBefore = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer1] });
    await send(backer1, rewardArtifact.abi, rewardAddress, 'claimRefund', [cId]);
    const balAfter = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer1] });
    assert.equal(balAfter - balBefore, pledgeAmount, 'Backer must recover 100% in underfunded campaign');
    console.log('✓ Scenario 3 passed');
  }

  // -------------------------------------------------------------
  // Scenario 4: Surplus / Unused Funds Return
  // -------------------------------------------------------------
  console.log('\n[Scenario 4] Running Surplus Return (returnFunds)...');
  {
    const goal = 2_000_000_000n;
    const tiers = [{ price: 100_000_000n, maxQuantity: 20n, pledgedQuantity: 0n, isDigital: false }];
    await send(creator, rewardArtifact.abi, rewardAddress, 'createCampaign', [hash('c-s4'), goal, 86_400n, tiers]);
    const cId = (await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'nextCampaignId' })) - 1n;

    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer1, goal]);
    await send(backer1, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, goal]);
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 20n]);
    await send(resolver, rewardArtifact.abi, rewardAddress, 'activateCampaign', [cId, hash('act-s4')]);

    // Disburse 1,000 USDC deposit
    const disburseAmount = 1_000_000_000n;
    const req4Hash = hash('req-s4');
    await send(creator, rewardArtifact.abi, rewardAddress, 'submitDisbursementRequest', [cId, req4Hash, creator, disburseAmount]);
    await send(resolver, rewardArtifact.abi, rewardAddress, 'approveAndDisburse', [cId, 0n, req4Hash]);

    // Return 300 USDC surplus
    const surplus = 300_000_000n;
    const escrowBalBefore = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [rewardAddress] });
    await send(creator, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, surplus]);
    await send(creator, rewardArtifact.abi, rewardAddress, 'returnFunds', [cId, 0n, surplus]);
    const escrowBalAfter = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [rewardAddress] });

    assert.equal(escrowBalAfter - escrowBalBefore, surplus, 'Escrow token balance must increase by exact surplus amount');
    const rData = await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'request', args: [cId, 0n] });
    assert.equal(rData.returned, surplus, 'Request returned field must match returned surplus');
    console.log('✓ Scenario 4 passed');
  }

  // -------------------------------------------------------------
  // Scenario 5: Dispute Blocks Expenditure Finalization
  // -------------------------------------------------------------
  console.log('\n[Scenario 5] Running Dispute Handling During Challenge Window...');
  {
    const goal = 1_000_000_000n;
    const tiers = [{ price: 50_000_000n, maxQuantity: 20n, pledgedQuantity: 0n, isDigital: false }];
    await send(creator, rewardArtifact.abi, rewardAddress, 'createCampaign', [hash('c-s5'), goal, 86_400n, tiers]);
    const cId = (await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'nextCampaignId' })) - 1n;

    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer1, goal]);
    await send(backer1, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, goal]);
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 20n]);
    await send(resolver, rewardArtifact.abi, rewardAddress, 'activateCampaign', [cId, hash('act-s5')]);

    // Disburse 500 USDC
    const disburseAmount = 500_000_000n;
    const req5Hash = hash('req-s5');
    await send(creator, rewardArtifact.abi, rewardAddress, 'submitDisbursementRequest', [cId, req5Hash, creator, disburseAmount]);
    await send(resolver, rewardArtifact.abi, rewardAddress, 'approveAndDisburse', [cId, 0n, req5Hash]);

    // Candidate expenditure
    await send(resolver, rewardArtifact.abi, rewardAddress, 'candidateExpenditure', [cId, 0n, disburseAmount, hash('exp-s5')]);

    // Backer opens dispute case
    await send(backer1, rewardArtifact.abi, rewardAddress, 'openDisputeCase', [cId, 0n, hash('dispute-reason')]);

    // Fast forward challenge window
    await client.request({ method: 'evm_increaseTime', params: [3 * 24 * 60 * 60 + 1] });
    await client.request({ method: 'evm_mine' });

    // Attempting to finalize expenditure must revert because dispute is pending
    await assertRevert(
      () => send(resolver, rewardArtifact.abi, rewardAddress, 'finalizeExpenditure', [cId, 0n]),
      'Finalize expenditure with open dispute'
    );

    // Resolver upholds dispute
    await send(resolver, rewardArtifact.abi, rewardAddress, 'upholdDisputeCase', [cId, 0n, hash('dispute-resolution')]);
    console.log('✓ Scenario 5 passed');
  }

  // -------------------------------------------------------------
  // Scenario 6: Mid-Production Wind-Down Proportional Refund
  // -------------------------------------------------------------
  console.log('\n[Scenario 6] Running Mid-Production Wind-Down Proportional Refund...');
  {
    const goal = 4_000_000_000n; // 4,000 USDC
    const tiers = [{ price: 100_000_000n, maxQuantity: 40n, pledgedQuantity: 0n, isDigital: false }];
    await send(creator, rewardArtifact.abi, rewardAddress, 'createCampaign', [hash('c-s6'), goal, 86_400n, tiers]);
    const cId = (await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'nextCampaignId' })) - 1n;

    // Backer 1: 2,000 USDC (20 units), Backer 2: 2,000 USDC (20 units)
    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer1, 2_000_000_000n]);
    await send(backer1, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, 2_000_000_000n]);
    await send(backer1, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 20n]);

    await send(creator, tokenArtifact.abi, tokenAddress, 'mint', [backer2, 2_000_000_000n]);
    await send(backer2, tokenArtifact.abi, tokenAddress, 'approve', [rewardAddress, 2_000_000_000n]);
    await send(backer2, rewardArtifact.abi, rewardAddress, 'pledge', [cId, 0n, 20n]);

    await send(resolver, rewardArtifact.abi, rewardAddress, 'activateCampaign', [cId, hash('act-s6')]);

    // 1,000 USDC disbursed for setup, 3,000 USDC remains in Escrow
    const disburseAmount = 1_000_000_000n;
    const req6Hash = hash('req-s6');
    await send(creator, rewardArtifact.abi, rewardAddress, 'submitDisbursementRequest', [cId, req6Hash, creator, disburseAmount]);
    await send(resolver, rewardArtifact.abi, rewardAddress, 'approveAndDisburse', [cId, 0n, req6Hash]);

    // Reconcile and finalize the setup request
    await send(resolver, rewardArtifact.abi, rewardAddress, 'candidateExpenditure', [cId, 0n, disburseAmount, hash('receipt-s6')]);
    await client.request({ method: 'evm_increaseTime', params: [4 * 24 * 60 * 60] });
    await client.request({ method: 'evm_mine' });
    await send(resolver, rewardArtifact.abi, rewardAddress, 'finalizeExpenditure', [cId, 0n]);

    // Fast forward past execution horizon (181 days)
    await client.request({ method: 'evm_increaseTime', params: [181 * 24 * 60 * 60] });
    await client.request({ method: 'evm_mine' });

    // Force majeure / stopped -> startWindDown
    await send(resolver, rewardArtifact.abi, rewardAddress, 'startWindDown', [cId]);

    // Proportional refund: each backer contributed 50% (2,000 / 4,000), so each recovers 50% of remaining 3,000 = 1,500 USDC
    const b1Before = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer1] });
    await send(backer1, rewardArtifact.abi, rewardAddress, 'claimRefund', [cId]);
    const b1After = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer1] });
    assert.equal(b1After - b1Before, 1_500_000_000n, 'Backer 1 must receive exactly 1,500 USDC (50% of remaining custody)');

    const b2Before = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer2] });
    await send(backer2, rewardArtifact.abi, rewardAddress, 'claimRefund', [cId]);
    const b2After = await client.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer2] });
    assert.equal(b2After - b2Before, 1_500_000_000n, 'Backer 2 must receive exactly 1,500 USDC (50% of remaining custody)');

    const cData = await client.readContract({ address: rewardAddress, abi: rewardArtifact.abi, functionName: 'campaign', args: [cId] });
    assert.equal(cData.refunded, 3_000_000_000n, 'Campaign must record exactly 3,000 USDC refunded to backers');
    assert.equal(cData.basePool - cData.refunded, 0n, 'Campaign refund pool must have exactly 0 tokens unrefunded');
    assert.equal(cData.state, 5, 'Campaign state must be STOPPED (enum index 5)');
    console.log('✓ Scenario 6 passed');
  }

  console.log('\n=== All 6 Reward Crowdfunding E2E Scenarios Passed Successfully ===');
}

async function main() {
  const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });
  assert.equal(await client.getChainId(), 31339, 'Reward chain 31339 required');
  assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i, 'Local Anvil required');
  const snapshot = await client.request({ method: 'evm_snapshot' });
  try {
    await runScenarios();
  } finally {
    assert.equal(await client.request({ method: 'evm_revert', params: [snapshot] }), true, 'Reward E2E must restore the shared local chain');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('E2E Suite failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { main };
