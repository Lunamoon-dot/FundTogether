// Disposable chain, real HTTP + SIWE + PostgreSQL + receipts. Never mutates port 8545.
require('dotenv').config({ quiet: true });
process.env.LOG_LEVEL = 'silent'; process.env.INDEXER_ENABLED = 'false';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Test } = require('@nestjs/testing');
const { Pool } = require('pg');
const { SiweMessage } = require('siwe');
const { createPublicClient, createWalletClient, http, keccak256, stringToHex } = require('viem');
const { foundry } = require('viem/chains');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { AppModule } = require('../dist/src/app.module');
const { CHAIN_DEPLOYMENT } = require('../dist/src/blockchain/blockchain.constants');
const { IndexerService } = require('../dist/src/indexer/indexer.service');
const { DRIZZLE_DB } = require('../dist/src/database/database.constants');
const contract = require('../../contracts/out/FundTogetherConfigured.sol/FundTogetherConfigured.json');
const token = require('../../contracts/out/MockUSDC.sol/MockUSDC.json');
const abi = require('../src/blockchain/generated/fund-together.abi.json');
const tokenAbi = require('../src/blockchain/generated/mock-usdc.abi.json');

async function main() {
  const rpcUrl = 'http://127.0.0.1:9545';
  const client = createPublicClient({ chain: foundry, transport: http(rpcUrl, { timeout: 2000, retryCount: 0 }), pollingInterval: 50 });
  let occupied = false; try { await client.getChainId(); occupied = true; } catch {}
  assert.equal(occupied, false, 'Port 9545 must be unused; refusing to mutate another chain');
  const anvil = spawn('wsl.exe', ['bash', '-lc', 'printf "%s\\n" "$$"; exec ~/.foundry/bin/anvil --port 9545 --host 0.0.0.0 --silent'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let anvilPid, startupError;
  anvil.stdout.on('data', data => { const first = String(data).trim().split(/\r?\n/)[0]; if (!anvilPid && /^[1-9][0-9]*$/.test(first)) anvilPid = first; });
  anvil.on('error', error => { startupError = error; });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const accounts = Array.from({ length: 4 }, () => privateKeyToAccount(generatePrivateKey()));
  const [organizer, resolver, alice, bob] = accounts;
  const [ownerWallet, operator, aliceWallet, bobWallet] = accounts.map(account => createWalletClient({ account, chain: foundry, transport: http(rpcUrl) }));
  const emails = accounts.map(() => `refund-${randomUUID()}@example.invalid`);
  const campaignIds = [];
  let app, base, indexer, manifest, streamId, organizationId, checks = 0;
  function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
  async function receipt(hash) { const result = await client.waitForTransactionReceipt({ hash }); check(result.status, 'success'); return result; }
  async function write(sender, name, args, isToken = false) {
    return receipt(await sender.writeContract({ address: isToken ? manifest.tokenAddress : manifest.contractAddress, abi: isToken ? tokenAbi : abi, functionName: name, args }));
  }
  const read = (name, args) => client.readContract({ address: manifest.contractAddress, abi, functionName: name, args });
  const balance = address => client.readContract({ address: manifest.tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [address] });
  async function request(path, cookie, method = 'GET', body, expected = 200) {
    const response = await fetch(base + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); check(response.status, expected, `${method} ${path}: ${text}`);
    return { data: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function start() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CHAIN_DEPLOYMENT).useValue(manifest).compile();
    app = module.createNestApplication({ logger: false }); await app.listen(0, '127.0.0.1'); base = await app.getUrl(); indexer = app.get(IndexerService);
  }
  async function close() { if (app) { const db = app.get(DRIZZLE_DB).$client; await app.close(); await db.end(); app = undefined; } }
  async function catchUp() { for (let i = 0; i < 20; i++) { await indexer.runOnce(); if ((await indexer.status()).status === 'ready') return; } assert.fail('Indexer did not catch up'); }
  async function link(cookie, account) {
    const { data: challenge } = await request('/auth/wallets/nonce', cookie, 'POST');
    const { data: session } = await request('/auth/session', cookie);
    const message = new SiweMessage({ ...challenge, address: account.address, scheme: new URL(origin).protocol.slice(0, -1), version: '1', statement: 'Link this wallet to FundTogether account ' + session.userId + '.', issuedAt: new Date().toISOString() }).prepareMessage();
    await request('/auth/wallets/link', cookie, 'POST', { message, signature: await account.signMessage({ message }) });
  }
  let owner, donor, second, outsider;
  async function create(title, budgets = ['4000000', '6000000']) {
    const draft = (await request(`/organizations/${organizationId}/campaigns`, owner.cookie, 'POST', { title, description: 'Disposable refund verification',
      milestones: budgets.map((budgetUnits, i) => ({ title: 'M' + i, description: 'Result ' + i, budgetUnits, acceptanceCriteria: [{ criterionId: 'C' + i, description: 'Proof ' + i }] })) }, 201)).data;
    campaignIds.push(draft.id);
    const plan = (await request(`/campaigns/${draft.id}/submission`, owner.cookie, 'POST', { expectedRevision: draft.revision, fundingDeadline: Number((await client.getBlock()).timestamp) + 86400 }, 201)).data;
    await write(operator, 'mint', [organizer.address, BigInt(plan.bondUnits)], true);
    await write(ownerWallet, 'approve', [manifest.contractAddress, BigInt(plan.bondUnits)], true);
    await write(ownerWallet, 'submitCampaignForDraft', [plan.draftKey, plan.title, BigInt(plan.fundingDeadline), plan.budgetUnits.map(BigInt), plan.criteriaHashes]);
    const id = await read('campaignForDraft', [organizer.address, plan.draftKey]) - 1n;
    await write(operator, 'approveCampaign', [id]); await write(ownerWallet, 'publishCampaign', [id]); await catchUp();
    return { metadataId: draft.id, id, deadline: plan.fundingDeadline };
  }
  async function donate(campaign, sender, amount) {
    await write(operator, 'mint', [sender.account.address, amount], true);
    await write(sender, 'approve', [manifest.contractAddress, amount], true); await write(sender, 'donate', [campaign.id, amount]); await catchUp();
  }
  async function detail(campaign, cookie = donor.cookie) { return (await request(`/refunds/${campaign.metadataId}`, cookie)).data.items[0]; }
  async function publicWorkflow(campaign, state) {
    const { campaign: projection, workflow, sync } = (await request(`/public/campaigns/${campaign.metadataId}`, null)).data;
    check(projection.state, state);
    check(workflow.checkedBlock, sync.lastIndexedBlock);
    check(workflow.checkedBlockHash, sync.lastIndexedBlockHash);
    const blockNumber = BigInt(workflow.checkedBlock);
    const block = await client.getBlock({ blockNumber });
    check(workflow.checkedBlockHash, block.hash);
    check(workflow.chainTimestamp, block.timestamp.toString(), 'UX clock is the indexed chain clock');
    const index = BigInt(workflow.currentMilestoneIndex);
    const facts = { currentMilestoneIndex: ['currentMilestoneIndex', [campaign.id]],
      activationDeadline: ['activationDeadlines', [campaign.id]], evidenceDeadline: ['evidenceDeadlines', [campaign.id, index]],
      refundSnapshotted: ['refundSnapshotted', [campaign.id]], refundPoolUnits: ['refundPool', [campaign.id]], releasedUnits: ['totalReleased', [campaign.id]] };
    for (const [field, [functionName, args]] of Object.entries(facts)) {
      const value = await client.readContract({ address: manifest.contractAddress, abi, functionName, args, blockNumber });
      check(workflow[field], typeof value === 'boolean' ? value : value.toString(), `Public ${field} uses the same checkpoint`);
    }
    check(workflow.reviewDeadline, (await client.readContract({ address: manifest.contractAddress, abi, functionName: 'milestoneEvidence', args: [campaign.id, index], blockNumber }))[1].toString());
    check(Object.hasOwn(workflow, 'wallets'), false, 'Public workflow does not expose account refund rights');
    return workflow;
  }
  async function at(timestamp) { await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] }); await client.request({ method: 'evm_mine' }); await catchUp(); }
  async function cannotClaim(campaign, account) { await assert.rejects(client.simulateContract({ address: manifest.contractAddress, abi, functionName: 'claimRefund', args: [campaign.id], account })); checks++; }
  async function indexedAccounting() {
    const events = (await pool.query(`SELECT transaction_hash, log_index, block_hash, block_number,
      event_name, args, canonical FROM chain_events WHERE stream_id = $1
      ORDER BY block_number, log_index, block_hash`, [streamId])).rows;
    // Replaying a wider batch legitimately refreshes the observation block of old campaigns.
    // Compare their financial/publication state, not this freshness marker.
    const projections = (await pool.query(`SELECT onchain_campaign_id, metadata_id, snapshot - 'indexedBlock' AS snapshot
      FROM campaign_chain_projection WHERE stream_id = $1 ORDER BY onchain_campaign_id`, [streamId])).rows;
    const sums = (await pool.query(`SELECT event_name, args->>'campaignId' AS campaign,
      lower(args->>'donor') AS donor, count(*)::text AS events, sum((args->>'amount')::numeric)::text AS units
      FROM chain_events WHERE stream_id = $1 AND canonical = true
      AND event_name IN ('DonationReceived', 'RefundClaimed')
      GROUP BY event_name, args->>'campaignId', lower(args->>'donor')
      ORDER BY event_name, campaign, donor`, [streamId])).rows;
    return { events, projections, sums };
  }
  async function replay(campaign) {
    const dbBefore = await indexedAccounting();
    const contributionsBefore = (await request('/contributions', donor.cookie)).data.items;
    const refundsBefore = await detail(campaign);
    for (let round = 0; round < 3; round++) {
      // Rewind only this disposable deployment's checkpoint. This forces real log rereads,
      // unlike runOnce() on a caught-up stream, which simply returns without replaying.
      await pool.query(`UPDATE indexer_streams SET last_block = NULL, last_block_hash = NULL,
        status = 'syncing', error = NULL WHERE stream_id = $1`, [streamId]);
      const otherWorker = new IndexerService(app.get(DRIZZLE_DB), indexer.chain);
      await Promise.all([indexer.runOnce(), otherWorker.runOnce()]);
      await catchUp();
      check(await indexedAccounting(), dbBefore, 'Forced replay preserves every event, projection and contribution/refund sum');
      check((await request('/contributions', donor.cookie)).data.items, contributionsBefore, 'Forced replay preserves contribution history');
      check(await detail(campaign), refundsBefore, 'Forced replay preserves refund rights and canonical transaction');
      if (round === 0) { await close(); await start(); }
    }
  }
  async function failedBatchRollsBack() {
    const before = await indexedAccounting();
    const checkpoint = (await pool.query('SELECT last_block, last_block_hash FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0];
    const snapshot = indexer.chain.snapshot;
    // Fail after event upserts but before projection/checkpoint commit, then retry normally.
    indexer.chain.snapshot = async () => { throw new Error('Injected isolated snapshot failure'); };
    try {
      await assert.rejects(indexer.runOnce(), /Injected isolated snapshot failure/); checks++;
      check(await indexedAccounting(), before, 'Failed batch rolls back event writes and projections');
      check((await pool.query('SELECT last_block, last_block_hash FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0], checkpoint,
        'Failed batch retains its last committed checkpoint');
    } finally { indexer.chain.snapshot = snapshot; }
  }
  try {
    for (let i = 0; i < 80; i++) {
      if (startupError) throw startupError;
      if (anvil.exitCode !== null) throw new Error('Isolated chain exited');
      try { await client.getChainId(); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    for (const account of accounts) await client.request({ method: 'anvil_setBalance', params: [account.address, '0x8ac7230489e80000'] });
    const deployedToken = await receipt(await operator.deployContract({ abi: token.abi, bytecode: token.bytecode.object }));
    const deployed = await receipt(await operator.deployContract({ abi: contract.abi, bytecode: contract.bytecode.object, args: [deployedToken.contractAddress] }));
    manifest = { chainId: 31337, rpcUrl, contractAddress: deployed.contractAddress, tokenAddress: deployedToken.contractAddress, tokenDecimals: 6, confirmations: 1,
      resolver: resolver.address, genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
      contractCodeHash: keccak256(await client.getCode({ address: deployed.contractAddress })), tokenCodeHash: keccak256(await client.getCode({ address: deployedToken.contractAddress })), atomicSubmission: true };
    await start(); streamId = indexer.streamKey; await catchUp();
    [owner, outsider, donor, second] = await Promise.all(emails.map(email => request('/auth/register', null, 'POST', { email, password: randomBytes(24).toString('base64url') }, 201)));
    await link(owner.cookie, organizer); await link(donor.cookie, alice); await link(second.cookie, bob);
    organizationId = (await request('/organizations', owner.cookie, 'POST', { name: 'Refund smoke', description: 'Isolated fixtures' }, 201)).data.id;
    await request(`/organizations/${organizationId}/wallet`, owner.cookie, 'PUT', { address: organizer.address, chainId: 31337 });
    await request('/refunds', null, 'GET', undefined, 401);
    await request('/refunds/not-a-uuid', donor.cookie, 'GET', undefined, 400);
    check((await request('/refunds', outsider.cookie)).data.items, []);
    const cancelled = await create('Cancelled with two donors');
    check(cancelled.id, 0n, 'Campaign ID zero must work');
    await publicWorkflow(cancelled, 'FUNDING');
    await donate(cancelled, aliceWallet, 1000000n); await donate(cancelled, aliceWallet, 2000000n); await donate(cancelled, bobWallet, 4000000n);
    check((await detail(cancelled)).wallets[0].contributionUnits, '3000000');
    await cannotClaim(cancelled, alice.address);
    const bondBefore = await balance(organizer.address);
    const cancellation = await write(ownerWallet, 'cancelCampaign', [cancelled.id]);
    check((await detail(cancelled)).snapshotted, false, 'Unindexed termination must not report refund ready');
    check((await publicWorkflow(cancelled, 'FUNDING')).refundSnapshotted, false, 'Unindexed receipt does not advance public guidance');
    await catchUp();
    check(await balance(organizer.address) - bondBefore, 6000000n, 'Bond returns independently');
    let row = await detail(cancelled);
    await publicWorkflow(cancelled, 'CANCELLED');
    check(row.poolUnits, '7000000'); check(row.wallets[0].claimableUnits, '3000000'); check(row.snapshotTransactionHash, cancellation.transactionHash);
    check((await detail(cancelled, outsider.cookie)).wallets, [], 'No client wallet parameter can expose another account entitlement');
    await cannotClaim(cancelled, resolver.address);
    const fork = await client.request({ method: 'evm_snapshot' });
    const before = await balance(alice.address);
    const claim = await write(aliceWallet, 'claimRefund', [cancelled.id]);
    check((await detail(cancelled)).wallets[0].claimed, false, 'Receipt alone must not imply indexed claim');
    await failedBatchRollsBack();
    await catchUp(); row = await detail(cancelled);
    check(await balance(alice.address) - before, 3000000n); check(row.wallets[0].claimed, true); check(row.wallets[0].claimableUnits, '0'); check(row.wallets[0].transactionHash, claim.transactionHash);
    await cannotClaim(cancelled, alice.address);
    await replay(cancelled);
    await close(); await start(); check((await detail(cancelled)).wallets[0].claimed, true, 'Restart retains canonical claim');
    await client.request({ method: 'evm_revert', params: [fork] });
    await request(`/refunds/${cancelled.metadataId}`, donor.cookie, 'GET', undefined, 503);
    await request(`/public/campaigns/${cancelled.metadataId}`, null, 'GET', undefined, 503);
    await catchUp(); check((await detail(cancelled)).wallets[0].claimed, false, 'Orphaned claim restores entitlement');
    check((await pool.query(`SELECT count(*)::text AS count FROM chain_events
      WHERE stream_id = $1 AND event_name = 'RefundClaimed' AND canonical = true`, [streamId])).rows[0].count, '0', 'Orphaned refunds do not remain payable history');
    // Change the timestamp so the replacement claim belongs to a distinct block incarnation.
    await at((await client.getBlock()).timestamp + 1n);
    const replacementClaim = await write(aliceWallet, 'claimRefund', [cancelled.id]);
    await write(bobWallet, 'claimRefund', [cancelled.id]); await catchUp();
    check((await detail(cancelled)).wallets[0].transactionHash, replacementClaim.transactionHash);
    check((await pool.query(`SELECT sum((args->>'amount')::numeric)::text AS units, count(*)::text AS count
      FROM chain_events WHERE stream_id = $1 AND event_name = 'RefundClaimed'
      AND args->>'campaignId' = $2 AND canonical = true`, [streamId, cancelled.id.toString()])).rows[0],
      { units: '7000000', count: '2' }, 'Only replacement canonical claims enter refund totals');
    await replay(cancelled);
    check((await detail(cancelled, second.cookie)).wallets[0].entitlementUnits, '4000000');
    const expired = await create('Deadline failure'); await donate(expired, aliceWallet, 2000000n);
    check((await detail(expired)).canFinalizeFunding, false);
    await assert.rejects(client.simulateContract({ address: manifest.contractAddress, abi, functionName: 'finalizeFundingFailure', args: [expired.id], account: bob.address })); checks++;
    await at(expired.deadline); check((await detail(expired)).canFinalizeFunding, true);
    check((await publicWorkflow(expired, 'FUNDING')).chainTimestamp, String(expired.deadline));
    await write(bobWallet, 'finalizeFundingFailure', [expired.id]); await catchUp();
    check((await detail(expired)).campaign.state, 'FUNDING_FAILED'); check((await detail(expired)).wallets[0].entitlementUnits, '2000000');
    await publicWorkflow(expired, 'FUNDING_FAILED');
    await write(aliceWallet, 'claimRefund', [expired.id]); await catchUp();
    const empty = await create('Empty cancellation'); await write(ownerWallet, 'cancelCampaign', [empty.id]); await catchUp();
    check((await detail(empty)).poolUnits, '0'); await cannotClaim(empty, alice.address);
    const partial = await create('Partial refund and rounding', ['2', '3']);
    await donate(partial, aliceWallet, 1n); await donate(partial, bobWallet, 4n);
    check(BigInt((await publicWorkflow(partial, 'FUNDED')).activationDeadline) > 0n, true);
    const activation = await write(ownerWallet, 'activateMilestone', [partial.id, 0n]);
    check((await publicWorkflow(partial, 'FUNDED')).activationTransactionHash, null, 'Receipt alone does not imply indexed activation');
    await catchUp();
    const activatedWorkflow = await publicWorkflow(partial, 'MILESTONE_ACTIVE');
    check(BigInt(activatedWorkflow.evidenceDeadline) > 0n, true);
    check(activatedWorkflow.activationTransactionHash, activation.transactionHash, 'Activation progress matches the canonical indexed hash');
    const evidence = keccak256(stringToHex('isolated evidence'));
    await write(ownerWallet, 'submitEvidence', [partial.id, 0n, evidence]);
    await catchUp(); check(BigInt((await publicWorkflow(partial, 'EVIDENCE_PENDING')).admissionDeadline) > 0n, true);
    await write(operator, 'grantRole', [await read('VERIFIER_ROLE', []), resolver.address]);
    await write(operator, 'assignVerifier', [partial.id, 0n, 1n, resolver.address]);
    await write(operator, 'verifySubmission', [partial.id, 0n, 1n, evidence]);
    await catchUp(); check(BigInt((await publicWorkflow(partial, 'IN_REVIEW')).reviewDeadline) > 0n, true);
    await at((await read('milestoneEvidence', [partial.id, 0n]))[1]); await write(bobWallet, 'settleMilestone', [partial.id, 0n]);
    await at(await read('activationDeadlines', [partial.id]));
    row = await detail(partial); check(row.canFinalizeMilestone, true); check(row.currentMilestoneIndex, '1');
    check((await publicWorkflow(partial, 'MILESTONE_SETTLED')).currentMilestoneIndex, '1');
    await write(bobWallet, 'finalizeMilestoneTimeout', [partial.id, 1n]); await catchUp();
    row = await detail(partial); check(row.poolUnits, '3'); check(row.releasedUnits, '2'); check(row.wallets[0].entitlementUnits, '0');
    await publicWorkflow(partial, 'FAILED');
    check((await detail(partial, second.cookie)).wallets[0].entitlementUnits, '2');
    await write(aliceWallet, 'claimRefund', [partial.id]); await write(bobWallet, 'claimRefund', [partial.id]); await catchUp();
    check((await detail(partial)).wallets[0].claimed, true, 'Zero rounded claim still indexes its event');
    await cannotClaim(partial, alice.address); check(await balance(manifest.contractAddress), 1n, 'Rounding dust remains in escrow');
    await cannotClaim(partial, bob.address);
    const partialClaims = (await pool.query(`SELECT sum((args->>'amount')::numeric)::text AS units, count(*)::text AS count
      FROM chain_events WHERE stream_id = $1 AND event_name = 'RefundClaimed'
      AND args->>'campaignId' = $2 AND canonical = true`, [streamId, partial.id.toString()])).rows[0];
    check(partialClaims, { units: '2', count: '2' }, 'Zero payout is indexed once and aggregate claims exclude dust');
    await replay(partial);
    check((await request('/refunds', donor.cookie)).data.items.length, 3, 'Only campaigns contributed to by current linked wallets');
    console.log(`PASS: ${checks} refund HTTP/transaction/accounting checks: two donors, repeated donations, cancellation/bond separation, expiry, exact receipt/index lag, SIWE ownership, double/non-donor rejection, restart/replay/reorg, partial refunds, zero rounding and dust.`);
  } finally {
    try {
      await close();
      if (streamId) {
        await pool.query('DELETE FROM campaign_chain_projection WHERE stream_id = $1', [streamId]);
        await pool.query('DELETE FROM chain_events WHERE stream_id = $1', [streamId]);
        await pool.query('DELETE FROM indexer_streams WHERE stream_id = $1', [streamId]);
      }
      for (const id of campaignIds) {
        await pool.query('DELETE FROM campaign_submissions WHERE campaign_metadata_id = $1', [id]);
        await pool.query('DELETE FROM campaign_milestone_drafts WHERE campaign_metadata_id = $1', [id]);
        await pool.query('DELETE FROM campaign_metadata WHERE id = $1', [id]);
      }
      if (organizationId) { await pool.query('DELETE FROM organization_members WHERE organization_id = $1', [organizationId]); await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]); }
      await pool.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
      await pool.query('DELETE FROM wallet_links WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
      await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    } finally {
      await pool.end();
      if (anvilPid) { const stop = spawn('wsl.exe', ['kill', '--', anvilPid], { stdio: 'ignore', windowsHide: true }); await new Promise(resolve => { stop.once('exit', resolve); stop.once('error', resolve); }); }
      anvil.kill();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
