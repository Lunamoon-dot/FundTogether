// Real HTTP/PostgreSQL/Viem verification. Never resets the user's port-8545 chain.
require('dotenv').config({ quiet: true });
process.env.LOG_LEVEL = 'silent';
process.env.INDEXER_ENABLED = 'false';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Test } = require('@nestjs/testing');
const { Pool } = require('pg');
const { SiweMessage } = require('siwe');
const { createPublicClient, createWalletClient, http, keccak256 } = require('viem');
const { foundry } = require('viem/chains');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { AppModule } = require('../dist/src/app.module');
const { CHAIN_DEPLOYMENT } = require('../dist/src/blockchain/blockchain.constants');
const { BlockchainService } = require('../dist/src/blockchain/blockchain.service');
const { IndexerService } = require('../dist/src/indexer/indexer.service');
const { DRIZZLE_DB } = require('../dist/src/database/database.constants');
const contract = require('../../contracts/out/FundTogetherConfigured.sol/FundTogetherConfigured.json');
const token = require('../../contracts/out/MockUSDC.sol/MockUSDC.json');
const abi = require('../src/blockchain/generated/fund-together.abi.json');
const tokenAbi = require('../src/blockchain/generated/mock-usdc.abi.json');

async function main() {
  const rpcUrl = 'http://127.0.0.1:9545';
  const client = createPublicClient({ chain: foundry, transport: http(rpcUrl, { timeout: 2000, retryCount: 0 }), pollingInterval: 50 });
  // Refuse to attach to an existing test chain: this script owns its Anvil process.
  let occupied = false;
  try { await client.getChainId(); occupied = true; } catch {}
  assert.equal(occupied, false, 'Port 9545 must be unused; refusing to mutate an existing chain');
  const anvil = spawn('wsl.exe', ['bash', '-lc', 'printf "%s\\n" "$$"; exec ~/.foundry/bin/anvil --port 9545 --host 0.0.0.0 --silent'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let startupError, anvilPid;
  anvil.stdout.on('data', chunk => {
    const firstLine = String(chunk).trim().split(/\r?\n/)[0];
    if (!anvilPid && /^[1-9][0-9]*$/.test(firstLine)) anvilPid = firstLine;
  });
  anvil.on('error', error => { startupError = error; });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const emails = [1, 2, 3].map(n => 'publish-indexer-' + randomUUID() + '-' + n + '@example.invalid');
  const organizer = privateKeyToAccount(generatePrivateKey());
  const resolver = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({ account: organizer, chain: foundry, transport: http(rpcUrl) });
  // Ephemeral resolver is an unlocked, impersonated Anvil operator; its SIWE key stays in memory.
  const operator = createWalletClient({ account: resolver.address, chain: foundry, transport: http(rpcUrl) });
  let app, base, manifest, streamId, campaignId, organizationId, onchainId, indexer, chain;
  const campaignIds = [], chainCampaignIds = [];
  let checks = 0, triggerInstalled = false;
  const triggerName = 'smoke_' + randomUUID().replaceAll('-', '');
  async function receipt(hash) { const result = await client.waitForTransactionReceipt({ hash }); assert.equal(result.status, 'success'); checks++; return result; }
  async function write(sender, functionName, args, isToken = false) {
    return receipt(await sender.writeContract({ address: isToken ? manifest.tokenAddress : manifest.contractAddress, abi: isToken ? tokenAbi : abi, functionName, args }));
  }
  async function request(path, cookie, method = 'GET', body, expected = 200) {
    const response = await fetch(base + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    assert.equal(response.status, expected, method + ' ' + path + ': ' + text); checks++;
    return { data: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function startApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CHAIN_DEPLOYMENT).useValue(manifest).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    indexer = app.get(IndexerService); chain = app.get(BlockchainService);
    assert.equal(indexer.streamKey, streamId); checks++;
  }
  async function closeApp() {
    if (!app) return;
    const db = app.get(DRIZZLE_DB).$client;
    await app.close(); await db.end(); app = undefined;
  }
  async function link(cookie, account) {
    const { data: challenge } = await request('/auth/wallets/nonce', cookie, 'POST');
    const { data: session } = await request('/auth/session', cookie);
    const message = new SiweMessage({ ...challenge, address: account.address, scheme: new URL(origin).protocol.slice(0, -1), version: '1', statement: 'Link this wallet to FundTogether account ' + session.userId + '.', issuedAt: new Date().toISOString() }).prepareMessage();
    await request('/auth/wallets/link', cookie, 'POST', { message, signature: await account.signMessage({ message }) });
  }
  async function persisted() {
    const [checkpoint, events, projection] = await Promise.all([
      pool.query('SELECT last_block, last_block_hash FROM indexer_streams WHERE stream_id = $1', [streamId]),
      pool.query('SELECT * FROM chain_events WHERE stream_id = $1 ORDER BY block_number, transaction_hash, log_index, block_hash', [streamId]),
      pool.query('SELECT * FROM campaign_chain_projection WHERE stream_id = $1 ORDER BY onchain_campaign_id', [streamId]),
    ]);
    return { checkpoint: checkpoint.rows, events: events.rows, projection: projection.rows };
  }
  async function catchUp() {
    for (let i = 0; i < 20; i++) {
      await indexer.runOnce();
      const row = (await pool.query('SELECT last_block FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0];
      const confirmed = await client.getBlockNumber({ cacheTime: 0 }) - BigInt(manifest.confirmations - 1);
      if (row?.last_block !== null && row?.last_block !== undefined && BigInt(row.last_block) >= confirmed) return;
    }
    assert.fail('Indexer failed to catch up within 20 bounded batches');
  }
  async function expectFailure() { await assert.rejects(() => indexer.runOnce()); checks++; }
  async function noPublic(cookie) {
    const { data } = await request('/public/campaigns');
    assert(!data.items.some(item => item.id === campaignId));
    await request('/public/campaigns/' + campaignId, null, 'GET', undefined, 404);
    const publication = (await request('/campaigns/' + campaignId + '/publication', cookie)).data;
    assert.equal(publication.published, false); checks++;
  }
  async function dropTrigger() {
    if (!triggerInstalled) return;
    await pool.query('DROP TRIGGER IF EXISTS ' + triggerName + ' ON campaign_chain_projection');
    await pool.query('DROP FUNCTION IF EXISTS ' + triggerName + '()'); triggerInstalled = false;
  }
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (startupError) throw startupError;
      if (anvil.exitCode !== null) throw new Error('Isolated Anvil exited before startup');
      try { assert.equal(await client.getChainId(), 31337); ready = true; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, 'Isolated Anvil did not start on port 9545');
    await client.request({ method: 'anvil_setBalance', params: [resolver.address, '0x8ac7230489e80000'] });
    await client.request({ method: 'anvil_setBalance', params: [organizer.address, '0x8ac7230489e80000'] });
    await client.request({ method: 'anvil_impersonateAccount', params: [resolver.address] });
    const tokenDeployment = await receipt(await operator.deployContract({ abi: token.abi, bytecode: token.bytecode.object }));
    const deployment = await receipt(await operator.deployContract({ abi: contract.abi, bytecode: contract.bytecode.object, args: [tokenDeployment.contractAddress] }));
    manifest = { chainId: 31337, rpcUrl, contractAddress: deployment.contractAddress, tokenAddress: tokenDeployment.contractAddress, tokenDecimals: 6, confirmations: 1, resolver: resolver.address,
      genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
      contractCodeHash: keccak256(await client.getCode({ address: deployment.contractAddress })), tokenCodeHash: keccak256(await client.getCode({ address: tokenDeployment.contractAddress })) };
    streamId = manifest.chainId + ':' + manifest.contractAddress.toLowerCase() + ':' + manifest.genesisHash;
    await startApp(); await catchUp();
    const deploymentEvents = (await persisted()).events;
    const snapshot = await client.request({ method: 'evm_snapshot' });
    const owner = await request('/auth/register', null, 'POST', { email: emails[0], password: randomBytes(24).toString('base64url') }, 201);
    const reviewer = await request('/auth/register', null, 'POST', { email: emails[1], password: randomBytes(24).toString('base64url') }, 201);
    const outsider = await request('/auth/register', null, 'POST', { email: emails[2], password: randomBytes(24).toString('base64url') }, 201);
    assert.deepEqual(owner.data.roles, []); checks++;
    assert.equal((await request('/review/access', reviewer.cookie)).data.allowed, false);
    await request('/review/campaigns', reviewer.cookie, 'GET', undefined, 403);
    await link(owner.cookie, organizer); await link(reviewer.cookie, resolver);
    assert.equal((await request('/review/access', reviewer.cookie)).data.allowed, false, 'Wallet alone must not grant staff authority');
    await pool.query("INSERT INTO platform_roles (user_id, roles) SELECT id, '[\"ADMIN\"]'::jsonb FROM users WHERE email = $1", [emails[1]]);
    assert.deepEqual((await request('/auth/session', reviewer.cookie)).data.roles, ['ADMIN']);
    assert.equal((await request('/review/access', reviewer.cookie)).data.allowed, false, 'ADMIN alone must not grant resolver authority');
    await pool.query("UPDATE platform_roles SET roles = '[\"ADMIN\",\"RESOLVER\"]'::jsonb WHERE user_id = (SELECT id FROM users WHERE email = $1)", [emails[1]]);
    assert.deepEqual((await request('/auth/session', reviewer.cookie)).data.roles, ['ADMIN', 'RESOLVER']);
    assert.equal((await request('/review/access', reviewer.cookie)).data.allowed, true);
    assert.equal((await request('/review/access', owner.cookie)).data.allowed, false);
    await request('/review/campaigns', outsider.cookie, 'GET', undefined, 403);
    await request('/review/campaigns', owner.cookie, 'GET', undefined, 403);
    await request('/review/campaigns', null, 'GET', undefined, 401);
    organizationId = (await request('/organizations', owner.cookie, 'POST', { name: 'Indexer smoke', description: 'Disposable isolated chain check' }, 201)).data.id;
    await request('/organizations/' + organizationId + '/wallet', owner.cookie, 'PUT', { address: organizer.address, chainId: manifest.chainId });
    const input = { title: 'Indexer publication smoke', description: 'Private until canonical publication', milestones: [1000001, 2000002].map((n, i) => ({ title: 'M' + i, description: 'Work ' + i, budgetUnits: String(n), acceptanceCriteria: [{ criterionId: 'C' + i, description: 'Result ' + i }] })) };
    const atomicDraft = (await request('/organizations/' + organizationId + '/campaigns', owner.cookie, 'POST', { ...input, title: 'Atomic submission smoke' }, 201)).data;
    campaignIds.push(atomicDraft.id);
    const atomicPlan = (await request('/campaigns/' + atomicDraft.id + '/submission', owner.cookie, 'POST', { expectedRevision: atomicDraft.revision, fundingDeadline: Number((await client.getBlock()).timestamp) + 86400 }, 201)).data;
    const atomicArgs = [atomicPlan.draftKey, atomicPlan.title, BigInt(atomicPlan.fundingDeadline), atomicPlan.budgetUnits.map(BigInt), atomicPlan.criteriaHashes];
    await write(wallet, 'approve', [manifest.contractAddress, BigInt(atomicPlan.bondUnits)], true);
    const nextBeforeFailure = await chain.read('nextCampaignId', []);
    const failedHash = await wallet.writeContract({ address: manifest.contractAddress, abi, functionName: 'submitCampaignForDraft', args: atomicArgs, gas: 2000000n });
    const failedReceipt = await client.waitForTransactionReceipt({ hash: failedHash });
    assert.equal(failedReceipt.status, 'reverted');
    assert.equal(failedReceipt.logs.length, 0);
    assert.equal(await chain.read('nextCampaignId', []), nextBeforeFailure);
    assert.equal(await chain.read('campaignForDraft', [organizer.address, atomicPlan.draftKey]), 0n); checks++;
    await catchUp();
    assert(!(await request('/review/campaigns', reviewer.cookie)).data.items.some(item => item.id === atomicDraft.id));
    await write(operator, 'mint', [organizer.address, BigInt(atomicPlan.bondUnits)], true);
    const atomicReceipt = await write(wallet, 'submitCampaignForDraft', atomicArgs);
    const atomicId = (await chain.read('campaignForDraft', [organizer.address, atomicPlan.draftKey])) - 1n;
    chainCampaignIds.push(atomicId);
    const atomicStatus = (await request('/campaigns/' + atomicDraft.id + '/submission/sync', owner.cookie, 'POST', undefined, 201)).data;
    assert.equal(atomicStatus.stage, 'bond_locked');
    assert.equal(atomicStatus.criteriaReady, true);
    await catchUp();
    assert((await request('/review/campaigns', reviewer.cookie)).data.items.some(item => item.id === atomicDraft.id && item.bondAmountUnits === atomicPlan.bondUnits));
    const atomicEvents = (await pool.query('SELECT event_name FROM chain_events WHERE stream_id = $1 AND transaction_hash = $2 AND canonical', [streamId, atomicReceipt.transactionHash])).rows;
    assert.equal(atomicEvents.filter(event => event.event_name === 'CampaignCreated').length, 1);
    assert.equal(atomicEvents.filter(event => event.event_name === 'MilestoneCriteriaConfigured').length, atomicPlan.criteriaHashes.length);
    assert.equal(atomicEvents.filter(event => event.event_name === 'BondLocked').length, 1); checks++;
    await assert.rejects(() => client.simulateContract({ account: organizer.address, address: manifest.contractAddress, abi, functionName: 'submitCampaignForDraft', args: atomicArgs })); checks++;
    await request('/public/campaigns/' + atomicDraft.id, null, 'GET', undefined, 404);
    await write(wallet, 'cancelCampaign', [atomicId]);
    await write(wallet, 'transfer', [resolver.address, BigInt(atomicPlan.bondUnits)], true);
    await catchUp();
    const campaign = (await request('/organizations/' + organizationId + '/campaigns', owner.cookie, 'POST', input, 201)).data;
    campaignId = campaign.id; campaignIds.push(campaignId);
    const plan = (await request('/campaigns/' + campaignId + '/submission', owner.cookie, 'POST', { expectedRevision: campaign.revision, fundingDeadline: Number((await client.getBlock()).timestamp) + 86400 }, 201)).data;
    assert.equal(plan.contractAddress.toLowerCase(), manifest.contractAddress.toLowerCase());
    await request('/campaigns/' + campaignId + '/publication', outsider.cookie, 'GET', undefined, 403);
    await noPublic(owner.cookie);
    // Same organizer/name/budgets/criteria and publication cannot bind an unkeyed lookalike.
    const unkeyedId = await client.readContract({ address: manifest.contractAddress, abi, functionName: 'nextCampaignId' });
    await write(wallet, 'createCampaign', [plan.title, manifest.tokenAddress, BigInt(plan.fundingDeadline), plan.budgetUnits.map(BigInt)]);
    chainCampaignIds.push(unkeyedId);
    for (let i = 0; i < plan.criteriaHashes.length; i++) await write(wallet, 'configureMilestoneCriteria', [unkeyedId, BigInt(i), plan.criteriaHashes[i]]);
    await write(operator, 'mint', [organizer.address, BigInt(plan.bondUnits)], true);
    await write(wallet, 'approve', [manifest.contractAddress, BigInt(plan.bondUnits)], true);
    await write(wallet, 'lockBond', [unkeyedId]);
    await write(operator, 'approveCampaign', [unkeyedId]); await write(wallet, 'publishCampaign', [unkeyedId]);
    await catchUp(); await noPublic(owner.cookie);
    const unkeyed = (await pool.query('SELECT metadata_id, snapshot FROM campaign_chain_projection WHERE stream_id = $1 AND onchain_campaign_id = $2', [streamId, unkeyedId.toString()])).rows[0];
    assert.equal(unkeyed.metadata_id, null); assert.equal(unkeyed.snapshot.published, true); checks++;
    await write(wallet, 'createCampaignForDraft', [plan.draftKey, plan.title, BigInt(plan.fundingDeadline), plan.budgetUnits.map(BigInt)]);
    onchainId = (await client.readContract({ address: manifest.contractAddress, abi, functionName: 'campaignForDraft', args: [organizer.address, plan.draftKey] })) - 1n;
    chainCampaignIds.push(onchainId);
    await request('/campaigns/' + campaignId + '/submission/sync', owner.cookie, 'POST', undefined, 201);
    await catchUp(); await noPublic(owner.cookie);
    assert(!(await request('/review/campaigns', reviewer.cookie)).data.items.some(item => item.id === campaignId));
    await request('/review/campaigns/' + campaignId, reviewer.cookie, 'GET', undefined, 404);
    await assert.rejects(() => client.simulateContract({ account: organizer.address, address: manifest.contractAddress, abi, functionName: 'publishCampaign', args: [onchainId] })); checks++;
    for (let i = 0; i < plan.criteriaHashes.length; i++) await write(wallet, 'configureMilestoneCriteria', [onchainId, BigInt(i), plan.criteriaHashes[i]]);
    await catchUp();
    assert(!(await request('/review/campaigns', reviewer.cookie)).data.items.some(item => item.id === campaignId));
    await request('/review/campaigns/' + campaignId, reviewer.cookie, 'GET', undefined, 404);
    await write(operator, 'mint', [organizer.address, BigInt(plan.bondUnits) + 100n], true);
    await write(wallet, 'approve', [manifest.contractAddress, BigInt(plan.bondUnits)], true);
    await write(wallet, 'lockBond', [onchainId]);
    await request('/campaigns/' + campaignId + '/submission/sync', owner.cookie, 'POST', undefined, 201);
    await catchUp(); await noPublic(owner.cookie);
    const queue = (await request('/review/campaigns', reviewer.cookie)).data;
    assert(queue.items.some(item => item.id === campaignId && item.plan.draftKey === plan.draftKey));
    const reviewDetail = (await request('/review/campaigns/' + campaignId, reviewer.cookie)).data;
    assert.equal(reviewDetail.checks.every(check => check.passed), true); checks++;
    const reviewBody = { decision: 'approve', reason: 'Dossier and milestone criteria inspected by human resolver', expectedDossierHash: reviewDetail.dossierHash };
    await request('/review/campaigns/' + campaignId + '/approval', reviewer.cookie, 'GET', undefined, 403);
    await request('/review/campaigns/' + campaignId + '/decision', outsider.cookie, 'POST', reviewBody, 403);
    await request('/review/campaigns/' + campaignId + '/decision', reviewer.cookie, 'POST', { ...reviewBody, reason: 'tiny' }, 400);
    await request('/review/campaigns/' + campaignId + '/decision', reviewer.cookie, 'POST', { ...reviewBody, expectedDossierHash: '0x' + '0'.repeat(64) }, 409);
    await pool.query("INSERT INTO organization_members (organization_id, user_id, role) SELECT $1, id, 'OWNER' FROM users WHERE email = $2", [organizationId, emails[1]]);
    await request('/review/campaigns/' + campaignId + '/decision', reviewer.cookie, 'POST', reviewBody, 403);
    await pool.query('DELETE FROM organization_members WHERE organization_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)', [organizationId, emails[1]]);
    await Promise.all([request('/review/campaigns/' + campaignId + '/decision', reviewer.cookie, 'POST', reviewBody, 201),
      request('/review/campaigns/' + campaignId + '/decision', reviewer.cookie, 'POST', reviewBody, 201)]);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM campaign_reviews WHERE campaign_metadata_id = $1', [campaignId])).rows[0].count, 1); checks++;
    await request('/review/campaigns/' + campaignId + '/decision', reviewer.cookie, 'POST', { ...reviewBody, decision: 'reject' }, 409);
    assert.equal((await request('/campaigns/' + campaignId + '/publication', owner.cookie)).data.state, 'DRAFT', 'Review intent is not on-chain approval'); checks++;
    await request('/review/campaigns/' + campaignId + '/approval', reviewer.cookie);
    const deadlineSnapshot = await client.request({ method: 'evm_snapshot' });
    await client.request({ method: 'evm_increaseTime', params: [86401] }); await client.request({ method: 'evm_mine' });
    await request('/review/campaigns/' + campaignId + '/approval', reviewer.cookie, 'GET', undefined, 409);
    assert.equal(await client.request({ method: 'evm_revert', params: [deadlineSnapshot] }), true); checks++;
    await pool.query("UPDATE platform_roles SET roles = '[]'::jsonb WHERE user_id = (SELECT id FROM users WHERE email = $1)", [emails[1]]);
    await request('/review/campaigns/' + campaignId + '/approval', reviewer.cookie, 'GET', undefined, 403);
    await pool.query("UPDATE platform_roles SET roles = '[\"RESOLVER\"]'::jsonb WHERE user_id = (SELECT id FROM users WHERE email = $1)", [emails[1]]);
    await assert.rejects(() => client.simulateContract({ account: organizer.address, address: manifest.contractAddress, abi, functionName: 'approveCampaign', args: [onchainId] })); checks++;
    await write(operator, 'approveCampaign', [onchainId]);
    await catchUp(); await noPublic(owner.cookie);
    assert.equal((await request('/review/campaigns/' + campaignId, reviewer.cookie)).data.campaign.state, 'APPROVED');
    const published = await write(wallet, 'publishCampaign', [onchainId]);
    // API before indexing must not infer publication from a successful receipt.
    await noPublic(owner.cookie);
    await catchUp();
    const detail = (await request('/public/campaigns/' + campaignId)).data;
    assert.equal(detail.campaign.state, 'FUNDING'); assert.equal(detail.campaign.goalUnits, plan.goalUnits);
    assert.equal(detail.campaign.requiredBondUnits, plan.bondUnits); assert.equal(detail.campaign.bondAmountUnits, plan.bondUnits);
    assert.equal(detail.campaign.publicationTransactionHash, published.transactionHash);
    assert.equal(detail.campaign.onchainCampaignId, onchainId.toString()); assert.equal(detail.campaign.milestones[1].budgetUnits, plan.budgetUnits[1]);
    assert.deepEqual(detail.campaign.milestones[1].acceptanceCriteria, input.milestones[1].acceptanceCriteria);
    assert((await request('/public/campaigns')).data.items.some(item => item.id === campaignId));
    assert.equal((await request('/campaigns/' + campaignId + '/publication', owner.cookie)).data.published, true); checks++;

    const committed = (await pool.query('SELECT acceptance_criteria FROM campaign_milestone_drafts WHERE campaign_metadata_id = $1 AND milestone_index = 0', [campaignId])).rows[0].acceptance_criteria;
    await pool.query('UPDATE campaign_milestone_drafts SET acceptance_criteria = $2::jsonb WHERE campaign_metadata_id = $1 AND milestone_index = 0', [campaignId, JSON.stringify([{ ...committed[0], description: 'Changed after commitment' }])]);
    try { await noPublic(owner.cookie); }
    finally { await pool.query('UPDATE campaign_milestone_drafts SET acceptance_criteria = $2::jsonb WHERE campaign_metadata_id = $1 AND milestone_index = 0', [campaignId, JSON.stringify(committed)]); }
    await request('/public/campaigns/' + campaignId);

    // A separately matched and bonded draft cancelled before publication remains private.
    const unpublished = (await request('/organizations/' + organizationId + '/campaigns', owner.cookie, 'POST', { ...input, title: 'Cancelled unpublished smoke' }, 201)).data;
    campaignIds.push(unpublished.id);
    const unpublishedPlan = (await request('/campaigns/' + unpublished.id + '/submission', owner.cookie, 'POST', { expectedRevision: unpublished.revision, fundingDeadline: plan.fundingDeadline }, 201)).data;
    await write(wallet, 'createCampaignForDraft', [unpublishedPlan.draftKey, unpublishedPlan.title, BigInt(unpublishedPlan.fundingDeadline), unpublishedPlan.budgetUnits.map(BigInt)]);
    const unpublishedId = (await client.readContract({ address: manifest.contractAddress, abi, functionName: 'campaignForDraft', args: [organizer.address, unpublishedPlan.draftKey] })) - 1n;
    chainCampaignIds.push(unpublishedId);
    for (let i = 0; i < unpublishedPlan.criteriaHashes.length; i++) await write(wallet, 'configureMilestoneCriteria', [unpublishedId, BigInt(i), unpublishedPlan.criteriaHashes[i]]);
    await write(operator, 'mint', [organizer.address, BigInt(unpublishedPlan.bondUnits)], true);
    await write(wallet, 'approve', [manifest.contractAddress, BigInt(unpublishedPlan.bondUnits)], true); await write(wallet, 'lockBond', [unpublishedId]);
    await catchUp();
    assert.equal((await pool.query('SELECT metadata_id FROM campaign_chain_projection WHERE stream_id = $1 AND onchain_campaign_id = $2', [streamId, unpublishedId.toString()])).rows[0].metadata_id, unpublished.id);
    await request('/campaigns/' + unpublished.id + '/submission/sync', owner.cookie, 'POST', undefined, 201);
    const needsChanges = (await request('/review/campaigns/' + unpublished.id, reviewer.cookie)).data;
    const correction = { decision: 'request_changes', reason: 'Please specify measurable milestone delivery criteria', expectedDossierHash: needsChanges.dossierHash };
    await request('/review/campaigns/' + unpublished.id + '/decision', reviewer.cookie, 'POST', correction, 201);
    assert.equal((await request('/campaigns/' + unpublished.id + '/publication', owner.cookie)).data.review.reason, correction.reason); checks++;
    await request('/review/campaigns/' + unpublished.id + '/approval', reviewer.cookie, 'GET', undefined, 403);
    await request('/campaigns/' + unpublished.id + '/revision', owner.cookie, 'POST', undefined, 409);
    await request('/campaigns/' + unpublished.id + '/revision', outsider.cookie, 'POST', undefined, 403);
    const beforeReturn = await client.readContract({ address: manifest.tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [organizer.address] });
    await write(wallet, 'cancelCampaign', [unpublishedId]);
    assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [organizer.address] }), beforeReturn + BigInt(unpublishedPlan.bondUnits)); checks++;
    await request('/campaigns/' + unpublished.id + '/revision', owner.cookie, 'POST', undefined, 409);
    await catchUp();
    const newDraft = (await request('/campaigns/' + unpublished.id + '/revision', owner.cookie, 'POST', undefined, 201)).data;
    campaignIds.push(newDraft.id);
    assert.notEqual(newDraft.id, unpublished.id);
    assert.equal((await request('/campaigns/' + unpublished.id + '/revision', owner.cookie, 'POST', undefined, 201)).data.id, newDraft.id); checks++;
    const editable = (await request('/campaigns/' + newDraft.id, owner.cookie)).data;
    assert.equal(editable.status, 'draft'); assert.equal(editable.milestones[0].budgetUnits, unpublishedPlan.budgetUnits[0]); checks++;
    const replacementPlan = (await request('/campaigns/' + newDraft.id + '/submission', owner.cookie, 'POST', { expectedRevision: editable.revision, fundingDeadline: plan.fundingDeadline }, 201)).data;
    assert.notEqual(replacementPlan.draftKey, unpublishedPlan.draftKey);
    assert.deepEqual((await request('/campaigns/' + unpublished.id + '/submission', owner.cookie)).data, unpublishedPlan); checks++;
    await write(wallet, 'createCampaignForDraft', [replacementPlan.draftKey, replacementPlan.title, BigInt(replacementPlan.fundingDeadline), replacementPlan.budgetUnits.map(BigInt)]);
    const replacementId = (await client.readContract({ address: manifest.contractAddress, abi, functionName: 'campaignForDraft', args: [organizer.address, replacementPlan.draftKey] })) - 1n;
    chainCampaignIds.push(replacementId);
    for (let i = 0; i < replacementPlan.criteriaHashes.length; i++) await write(wallet, 'configureMilestoneCriteria', [replacementId, BigInt(i), replacementPlan.criteriaHashes[i]]);
    await write(wallet, 'approve', [manifest.contractAddress, BigInt(replacementPlan.bondUnits)], true); await write(wallet, 'lockBond', [replacementId]); await catchUp();
    const rejectDetail = (await request('/review/campaigns/' + newDraft.id, reviewer.cookie)).data;
    await request('/review/campaigns/' + newDraft.id + '/decision', reviewer.cookie, 'POST', { decision: 'reject', reason: 'Dossier does not substantiate delivery feasibility', expectedDossierHash: rejectDetail.dossierHash }, 201);
    await request('/review/campaigns/' + newDraft.id + '/approval', reviewer.cookie, 'GET', undefined, 403);
    assert.equal((await request('/campaigns/' + newDraft.id + '/publication', owner.cookie)).data.review.decision, 'reject'); checks++;
    await request('/public/campaigns/' + unpublished.id, null, 'GET', undefined, 404);
    assert(!(await request('/public/campaigns')).data.items.some(item => item.id === unpublished.id));
    assert.equal((await request('/campaigns/' + unpublished.id + '/publication', owner.cookie)).data.published, false); checks++;

    const stable = await persisted(); await indexer.runOnce(); assert.deepEqual(await persisted(), stable); checks++;
    // Replay the same canonical range; the event composite key must suppress duplicates.
    await pool.query('UPDATE indexer_streams SET last_block = NULL, last_block_hash = NULL WHERE stream_id = $1', [streamId]);
    await catchUp();
    assert.deepEqual((await persisted()).events, stable.events);
    const withoutReadBlock = rows => rows.map(row => ({ ...row, snapshot: { ...row.snapshot, indexedBlock: undefined } }));
    assert.deepEqual(withoutReadBlock((await persisted()).projection), withoutReadBlock(stable.projection)); checks++;
    const beforeRestart = await persisted();
    await closeApp();
    await write(wallet, 'approve', [manifest.contractAddress, 7n], true); const catchUpDonation = await write(wallet, 'donate', [onchainId, 7n]);
    await startApp();
    assert.deepEqual((await persisted()).checkpoint, beforeRestart.checkpoint); checks++;
    const competingIndexer = new IndexerService(app.get(DRIZZLE_DB), chain);
    await Promise.all([indexer.runOnce(), competingIndexer.runOnce()]);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM chain_events WHERE stream_id = $1 AND transaction_hash = $2 AND event_name = $3', [streamId, catchUpDonation.transactionHash, 'DonationReceived'])).rows[0].count, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM campaign_chain_projection WHERE stream_id = $1 AND metadata_id = $2', [streamId, campaignId])).rows[0].count, 1); checks++;
    await catchUp(); assert.equal((await request('/public/campaigns/' + campaignId)).data.campaign.totalContributedUnits, '7');

    // RPC failure must not advance the durable checkpoint or change ledger/projection.
    const beforeRpcFailure = await persisted(); const originalGetChainId = chain.client.getChainId;
    chain.client.getChainId = async () => { throw new Error('Smoke injected RPC outage'); };
    try { await expectFailure(); assert.deepEqual(await persisted(), beforeRpcFailure); checks++; await request('/public/campaigns/' + campaignId, null, 'GET', undefined, 503); }
    finally { chain.client.getChainId = originalGetChainId; }
    await catchUp();

    // Identity drift detected at the final check must roll back the whole batch.
    await client.request({ method: 'evm_mine' });
    const beforeIdentityDrift = await persisted();
    const originalVerifyDeployment = chain.verifyDeployment.bind(chain);
    let identityChecks = 0;
    chain.verifyDeployment = async (...args) => {
      await originalVerifyDeployment(...args);
      if (++identityChecks === 2) throw new Error('Smoke injected deployment drift before commit');
    };
    try {
      await expectFailure(); assert.equal(identityChecks, 2);
      assert.deepEqual(await persisted(), beforeIdentityDrift); checks++;
    } finally { chain.verifyDeployment = originalVerifyDeployment; }
    await catchUp();

    // A real PostgreSQL exception during projection insertion exercises transaction rollback.
    await write(wallet, 'approve', [manifest.contractAddress, 11n], true); await write(wallet, 'donate', [onchainId, 11n]);
    const beforeDbFailure = await persisted();
    await pool.query('CREATE FUNCTION ' + triggerName + '() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.stream_id = ' + "'" + streamId + "'" + ' THEN RAISE EXCEPTION \'Smoke injected projection failure\'; END IF; RETURN NEW; END $$');
    triggerInstalled = true;
    await pool.query('CREATE TRIGGER ' + triggerName + ' BEFORE INSERT OR UPDATE ON campaign_chain_projection FOR EACH ROW EXECUTE FUNCTION ' + triggerName + '()');
    try { await expectFailure(); assert.deepEqual(await persisted(), beforeDbFailure); checks++; }
    finally { await dropTrigger(); }
    await catchUp(); assert.equal((await request('/public/campaigns/' + campaignId)).data.campaign.totalContributedUnits, '18');

    // Change the chain after logs were fetched but before that batch can commit.
    const batchSnapshot = await client.request({ method: 'evm_snapshot' });
    await write(wallet, 'approve', [manifest.contractAddress, 3n], true); await write(wallet, 'donate', [onchainId, 3n]);
    const batchHead = await client.getBlockNumber({ cacheTime: 0 });
    const beforeMidBatchFork = await persisted(); const originalGetLogs = chain.client.getLogs;
    let forkInjected = false;
    chain.client.getLogs = async parameters => {
      const logs = await originalGetLogs(parameters);
      if (!forkInjected) {
        forkInjected = true;
        assert.equal(await client.request({ method: 'evm_revert', params: [batchSnapshot] }), true);
        await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number((await client.getBlock()).timestamp) + 300] });
        await client.request({ method: 'anvil_mine', params: ['0x' + (batchHead + 2n).toString(16)] });
      }
      return logs;
    };
    try { await expectFailure(); assert(forkInjected); assert.deepEqual(await persisted(), beforeMidBatchFork); checks++; }
    finally { chain.client.getLogs = originalGetLogs; }
    await catchUp(); assert.equal((await request('/public/campaigns/' + campaignId)).data.campaign.totalContributedUnits, '18');

    await write(wallet, 'cancelCampaign', [onchainId]); await catchUp();
    const cancelledPublic = (await request('/public/campaigns/' + campaignId)).data.campaign;
    assert.equal(cancelledPublic.state, 'CANCELLED'); assert.equal(cancelledPublic.publicationTransactionHash, published.transactionHash);
    assert((await request('/public/campaigns')).data.items.some(item => item.id === campaignId && item.state === 'CANCELLED')); checks++;

    // Restore an actual earlier chain snapshot, then mine a different branch beyond the checkpoint.
    const oldHeight = await client.getBlockNumber({ cacheTime: 0 });
    assert.equal(await client.request({ method: 'evm_revert', params: [snapshot] }), true);
    await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number((await client.getBlock()).timestamp) + 300] });
    await client.request({ method: 'anvil_mine', params: ['0x' + (oldHeight + 400n).toString(16)] });
    await request('/public/campaigns/' + campaignId, null, 'GET', undefined, 503);
    await indexer.runOnce();
    assert.equal((await pool.query('SELECT status FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0].status, 'rebuilding');
    await request('/public/campaigns/' + campaignId, null, 'GET', undefined, 503);
    const duringRebuild = await persisted(); const originalRebuildChainId = chain.client.getChainId;
    chain.client.getChainId = async () => { throw new Error('Smoke injected outage during rebuild'); };
    try { await expectFailure(); assert.deepEqual(await persisted(), duringRebuild); }
    finally { chain.client.getChainId = originalRebuildChainId; }
    assert.equal((await pool.query('SELECT status FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0].status, 'rebuilding');
    await indexer.runOnce();
    assert.equal((await pool.query('SELECT status FROM indexer_streams WHERE stream_id = $1', [streamId])).rows[0].status, 'rebuilding');
    await request('/public/campaigns/' + campaignId, null, 'GET', undefined, 503); checks++;
    await catchUp(); await noPublic(owner.cookie);
    const afterReorg = await persisted();
    assert.equal(afterReorg.projection.length, 0);
    assert(afterReorg.events.some(event => event.transaction_hash === published.transactionHash && event.canonical === false));
    assert.deepEqual(afterReorg.events.filter(event => event.canonical), deploymentEvents); checks++;
    assert.equal((await request('/review/campaigns', reviewer.cookie)).data.items.length, 0);
    // Full reset is distinct from a recoverable fork. Do not replay old DB rights
    // against an empty/redeployed chain. This script owns only isolated port 9545.
    const beforeFullReset = await persisted();
    await client.request({ method: 'anvil_reset' });
    await expectFailure();
    assert.deepEqual(await persisted(), beforeFullReset); checks++;
    await request('/public/campaigns/' + campaignId, null, 'GET', undefined, 503);
    console.log('PASS: ' + checks + ' real HTTP/transaction checks; explicit staff roles plus SIWE, revocation/conflicts, immutable human review, expiry, bond return and idempotent revision, approval/publication, cancellation privacy, commitment mismatch, unkeyed lookalike isolation, canonical public projection, duplicate replay, concurrent indexers, durable restart/catch-up, RPC failure, database rollback, mid-batch fork rollback and isolated-chain reorg/orphan retention.');
  } finally {
    try {
    await dropTrigger();
    if (manifest) for (const id of chainCampaignIds) { try { await write(wallet, 'cancelCampaign', [id]); } catch {} }
    await closeApp();
    if (streamId) {
      await pool.query('DELETE FROM campaign_chain_projection WHERE stream_id = $1', [streamId]);
      await pool.query('DELETE FROM chain_events WHERE stream_id = $1', [streamId]);
      await pool.query('DELETE FROM indexer_streams WHERE stream_id = $1', [streamId]);
    }
    for (const id of campaignIds) {
      await pool.query('DELETE FROM campaign_revisions WHERE parent_id = $1 OR child_id = $1', [id]);
      await pool.query('DELETE FROM campaign_submissions WHERE campaign_metadata_id = $1', [id]);
      await pool.query('DELETE FROM campaign_milestone_drafts WHERE campaign_metadata_id = $1', [id]);
      await pool.query('DELETE FROM campaign_metadata WHERE id = $1', [id]);
    }
    if (organizationId) {
      await pool.query('DELETE FROM organization_members WHERE organization_id = $1', [organizationId]);
      await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    await pool.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
    await pool.query('DELETE FROM wallet_links WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    } finally {
      await pool.end();
      if (anvilPid) {
        const stop = spawn('wsl.exe', ['kill', '--', anvilPid], { stdio: 'ignore', windowsHide: true });
        await new Promise(resolve => { stop.once('exit', resolve); stop.once('error', resolve); });
      }
      anvil.kill();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
