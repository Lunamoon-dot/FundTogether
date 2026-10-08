// Owns disposable port 9545; verifies real HTTP, SIWE, S3, PostgreSQL and MVP receipts.
require('dotenv').config({ quiet: true });
process.env.LOG_LEVEL = 'silent'; process.env.INDEXER_ENABLED = 'false';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const filePath = require('node:path');
const { createServer } = require('node:http');
const { Test } = require('@nestjs/testing');
const { Pool } = require('pg');
const { SiweMessage } = require('siwe');
const { createPublicClient, createWalletClient, http, keccak256 } = require('viem');
const { foundry } = require('viem/chains');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { AppModule } = require('../dist/src/app.module');
const { CHAIN_DEPLOYMENT } = require('../dist/src/blockchain/blockchain.constants');
const { IndexerService } = require('../dist/src/indexer/indexer.service');
const { EvidenceStorageService } = require('../dist/src/modules/evidence/evidence-storage.service');
const { DRIZZLE_DB } = require('../dist/src/database/database.constants');
const contract = require('../../contracts/out/FundTogetherMvp.sol/FundTogetherMvp.json');
const token = require('../../contracts/out/MockUSDC.sol/MockUSDC.json');
const abi = contract.abi;
const tokenAbi = token.abi;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64');
const digest = bytes => `0x${createHash('sha256').update(bytes).digest('hex')}`;

async function main() {
  const rpcUrl = 'http://127.0.0.1:9545';
  const client = createPublicClient({ chain: foundry, transport: http(rpcUrl, { timeout: 3000, retryCount: 0 }), pollingInterval: 50 });
  let occupied = false; try { await client.getChainId(); occupied = true; } catch {}
  assert.equal(occupied, false, 'Port 9545 must be unused; never attaches to another chain');
  const anvil = spawn('wsl.exe', ['-d', 'Ubuntu-24.04', '--', 'bash', '-lc', 'printf "%s\\n" "$$"; exec ~/.foundry/bin/anvil --port 9545 --host 0.0.0.0 --silent'],
    { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  let pid;
  anvil.stdout.on('data', data => { const value = String(data).trim().split(/\r?\n/)[0]; if (!pid && /^[1-9][0-9]*$/.test(value)) pid = value; });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const accounts = Array.from({ length: 4 }, () => privateKeyToAccount(generatePrivateKey()));
  const wallets = accounts.map(account => createWalletClient({ account, chain: foundry, transport: http(rpcUrl), pollingInterval: 50 }));
  const [organizer, resolver, alice, bob] = accounts, [ownerWallet, reviewerWallet, aliceWallet, bobWallet] = wallets;
  const emails = accounts.map(() => `milestone-${randomUUID()}@example.invalid`), campaignIds = [], storageIds = new Set();
  let app, base, indexer, storage, manifest, streamId, organizationId, checks = 0;
  let worker, proxy, workerManifestPath, workerPendingPath;
  function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
  async function receipt(hash) { const r = await client.waitForTransactionReceipt({ hash, timeout: 15000 }); check(r.status, 'success'); return r; }
  async function write(wallet, name, args, isToken = false) {
    return receipt(await wallet.writeContract({ address: isToken ? manifest.tokenAddress : manifest.contractAddress, abi: isToken ? tokenAbi : abi, functionName: name, args }));
  }
  const read = (name, args) => client.readContract({ address: manifest.contractAddress, abi, functionName: name, args });
  async function request(path, cookie, method = 'GET', body, expected = 200) {
    const multipart = body instanceof FormData;
    const r = await fetch(base + path, { method, headers: { Origin: origin, ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
    const text = await r.text(); check(r.status, expected, `${method} ${path}: ${text}`);
    return { data: text ? JSON.parse(text) : null, cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  async function catchUp() { for (let n = 0; n < 30; n++) { await indexer.runOnce(); if ((await indexer.status()).status === 'ready') return; } assert.fail('Indexer catch-up failed'); }
  async function advance(timestamp) { await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] }); await client.request({ method: 'evm_mine' }); await catchUp(); }
  async function link(cookie, account, userId) {
    const challenge = (await request('/auth/wallets/nonce', cookie, 'POST')).data;
    const message = new SiweMessage({ ...challenge, address: account.address, scheme: new URL(origin).protocol.slice(0, -1), version: '1',
      statement: `Link this wallet to FundTogether account ${userId}.`, issuedAt: new Date().toISOString() }).prepareMessage();
    await request('/auth/wallets/link', cookie, 'POST', { message, signature: await account.signMessage({ message }) });
  }
  const route = (c, index = 0) => `/milestone-workflows/${c.id}/${index}`;
  async function detail(c, user, index = 0) { const d = (await request(route(c, index), user.cookie)).data; check(d.supported, true); return d; }
  async function prepare(c, user, account, action, index = 0, extra = {}, expected = 201) {
    const d = await detail(c, user, index);
    return (await request(route(c, index) + '/prepare', user.cookie, 'POST', { action, wallet: account.address, expectedVersion: d.version,
      expectedEvidenceHash: d.evidenceHash, reason: `Smoke verified ${action} with complete public findings`, acknowledged: true, ...extra }, expected)).data;
  }
  async function act(c, user, wallet, action, index = 0, extra = {}) {
    const call = await prepare(c, user, wallet.account, action, index, extra);
    const entry = abi.find(e => e.type === 'function' && e.name === call.functionName);
    const r = await write(wallet, call.functionName, call.args.map((v, n) => entry.inputs[n].type.startsWith('uint') ? BigInt(v) : v));
    await catchUp(); const d = await detail(c, user, index);
    check(d.events.some(e => e.hash === r.transactionHash && e.name === call.event), true, 'Expected action must be indexed');
    return d;
  }
  try {
    for (let n = 0; n < 80; n++) { try { await client.getChainId(); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
    for (const account of accounts) await client.request({ method: 'anvil_setBalance', params: [account.address, '0x8ac7230489e80000'] });
    const t = await receipt(await reviewerWallet.deployContract({ abi: tokenAbi, bytecode: token.bytecode.object }));
    const deployed = await receipt(await reviewerWallet.deployContract({ abi, bytecode: contract.bytecode.object, args: [t.contractAddress, `0x${randomBytes(32).toString('hex')}`] }));
    manifest = { chainId: 31337, rpcUrl, contractAddress: deployed.contractAddress, tokenAddress: t.contractAddress, tokenDecimals: 6, confirmations: 1,
      resolver: resolver.address, genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
      contractCodeHash: keccak256(await client.getCode({ address: deployed.contractAddress })), tokenCodeHash: keccak256(await client.getCode({ address: t.contractAddress })),
      deploymentBlockNumber: String(deployed.blockNumber), deploymentBlockHash: deployed.blockHash };
    manifest.milestonePolicy = await read('MILESTONE_POLICY', []);
    manifest.recoveryPolicy = await read('RECOVERY_POLICY', []);
    manifest.deploymentId = await read('deploymentId', []);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CHAIN_DEPLOYMENT).useValue(manifest).compile();
    app = module.createNestApplication({ logger: false }); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    indexer = app.get(IndexerService); storage = app.get(EvidenceStorageService); streamId = indexer.streamKey;
    await storage.initialize(); await catchUp();
    const users = [];
    for (let n = 0; n < accounts.length; n++) {
      const u = await request('/auth/register', null, 'POST', { email: emails[n], password: randomBytes(24).toString('base64url') }, 201);
      users.push(u); await link(u.cookie, accounts[n], u.data.userId);
    }
    const [owner, reviewer, donorA, donorB] = users;
    await pool.query("INSERT INTO platform_roles(user_id, roles) VALUES ($1, '[\"RESOLVER\"]'::jsonb), ($2, '[\"RESOLVER\"]'::jsonb)", [reviewer.data.userId, owner.data.userId]);
    organizationId = (await request('/organizations', owner.cookie, 'POST', { name: 'MVP lifecycle smoke', description: 'Disposable isolated verification' }, 201)).data.id;
    await request(`/organizations/${organizationId}/wallet`, owner.cookie, 'PUT', { address: organizer.address, chainId: 31337 });
    for (const a of [organizer, alice, bob]) await write(reviewerWallet, 'mint', [a.address, 100000000n], true);
    async function campaign(name, budgets = ['1000000', '2000000']) {
      const draft = (await request(`/organizations/${organizationId}/campaigns`, owner.cookie, 'POST', { title: name, description: 'Full lifecycle verification',
        milestones: budgets.map((budgetUnits, i) => ({ title: `M${i}`, description: `Work ${i}`, budgetUnits, acceptanceCriteria: [{ criterionId: `C${i}`, description: `Deliver result ${i}` }] })) }, 201)).data;
      campaignIds.push(draft.id);
      const plan = (await request(`/campaigns/${draft.id}/submission`, owner.cookie, 'POST', { expectedRevision: draft.revision, fundingDeadline: Number((await client.getBlock()).timestamp) + 86400 }, 201)).data;
      await write(ownerWallet, 'approve', [manifest.contractAddress, BigInt(plan.bondUnits)], true);
      await write(ownerWallet, 'submitCampaignForDraft', [plan.draftKey, plan.title, BigInt(plan.fundingDeadline), plan.budgetUnits.map(BigInt), plan.criteriaHashes]);
      const id = await read('campaignForDraft', [organizer.address, plan.draftKey]) - 1n;
      await write(reviewerWallet, 'approveCampaign', [id]); await write(ownerWallet, 'publishCampaign', [id]);
      const goal = BigInt(plan.goalUnits), a = goal / 3n, b = goal - a;
      for (const [wallet, amount] of [[aliceWallet, a], [bobWallet, b]]) {
        await write(wallet, 'approve', [manifest.contractAddress, amount], true); await write(wallet, 'donate', [id, amount]);
      }
      await write(ownerWallet, 'activateMilestone', [id, 0n]); await catchUp();
      return { ...draft, onchain: id };
    }
    async function evidence(c, index = 0) {
      const path = `/campaigns/${c.id}/milestones/${index}/evidence-draft`;
      let draft;
      const existing = await fetch(base + path, { headers: { Cookie: owner.cookie } });
      if (existing.status === 404) draft = (await request(path, owner.cookie, 'POST', { milestoneId: c.milestones[index].id,
        content: { report: { summary: 'Private outcome details', performedFrom: '2026-01-01', performedTo: '2026-01-02',
          outcomes: [{ criterionId: `C${index}`, description: 'Delivered locked result', documentIds: [] }] }, expenses: [], documents: [] } }, 201)).data;
      else { check(existing.status, 200); draft = await existing.json(); }
      if (!draft.content.documents.length) {
        const form = new FormData(); form.append('expectedRevision', String(draft.revision)); form.append('kind', 'PHOTO');
        form.append('file', new Blob([png], { type: 'image/png' }), 'private-personal-name.png');
        draft = (await request(path + '/documents', owner.cookie, 'POST', form, 201)).data;
        draft.content.documents.forEach(doc => storageIds.add(doc.storageObjectId));
      }
      const frozen = (await request(path + '/freeze', owner.cookie, 'POST', { expectedRevision: draft.revision }, 201)).data;
      const bad = new FormData(); bad.append('input', JSON.stringify({ packageId: frozen.id, confirmedRedacted: false,
        summary: 'Not approved for publication', outcomes: [{ criterionId: `C${index}`, description: 'Public result', documentIndexes: [0] }] }));
      bad.append('files', new Blob([png], { type: 'image/png' }), 'not-approved.png');
      await request(route(c, index) + '/publication', owner.cookie, 'POST', bad, 400);
      const form = new FormData(); form.append('input', JSON.stringify({ packageId: frozen.id, confirmedRedacted: true, summary: 'Public report with privacy checked',
        outcomes: [{ criterionId: `C${index}`, description: 'Public proof of locked result', documentIndexes: [0] }] }));
      form.append('files', new Blob([png], { type: 'image/png' }), 'redacted-safe-name.png');
      const publication = (await request(route(c, index) + '/publication', owner.cookie, 'POST', form, 201)).data;
      publication.manifest.documents.forEach(doc => storageIds.add(doc.id));
      check(JSON.stringify(publication).includes('private-personal-name'), false);
      check(JSON.stringify(publication).includes('storageObjectId'), false);
      check(publication.manifest.privateCommitment, frozen.evidenceHash);
      await act(c, owner, ownerWallet, 'submit', index, { publicationHash: publication.hash });
      await prepare(c, owner, organizer, 'admit', index, {}, 403);
      await prepare(c, donorA, alice, 'admit', index, {}, 403);
      await request(route(c, index) + '/original', donorA.cookie, 'GET', undefined, 403);
      const original = (await request(route(c, index) + '/original', reviewer.cookie)).data;
      check(original.manifest.documents[0].originalName, 'private-personal-name.png');
      const doc = publication.manifest.documents[0];
      const response = await fetch(base + route(c, index) + `/documents/${publication.hash}/${doc.id}`, { headers: { Cookie: donorA.cookie } });
      check(response.status, 200); check(digest(Buffer.from(await response.arrayBuffer())), doc.sha256);
      const manifestResponse = await fetch(base + route(c, index) + `/manifests/${publication.hash}`, { headers: { Cookie: donorA.cookie } });
      check(manifestResponse.status, 200); check(digest(Buffer.from(await manifestResponse.arrayBuffer())), publication.hash);
      return publication;
    }
    const happy = await campaign('MVP sequential completion');
    for (const index of [0, 1]) {
      const publicEvidence = await evidence(happy, index);
      if (!index) {
        const document = publicEvidence.manifest.documents[0];
        await storage.put(document.id, Buffer.from('corrupt public copy'), 'image/png');
        await prepare(happy, reviewer, resolver, 'admit', index, {}, 503);
        await request(route(happy, index) + `/documents/${publicEvidence.hash}/${document.id}`, donorA.cookie, 'GET', undefined, 503);
        check(await read('campaignState', [happy.onchain]), 11);
        await storage.put(document.id, png, 'image/png');
        const row = (await pool.query('SELECT manifest_bytes FROM evidence_publications WHERE hash=$1', [publicEvidence.hash])).rows[0];
        await pool.query('UPDATE evidence_publications SET manifest_bytes=manifest_bytes || $2 WHERE hash=$1', [publicEvidence.hash, ' ']);
        await request(route(happy, index), donorA.cookie, 'GET', undefined, 503);
        await pool.query('UPDATE evidence_publications SET manifest_bytes=$2 WHERE hash=$1', [publicEvidence.hash, row.manifest_bytes]);
        await prepare(happy, reviewer, resolver, 'admit', index, { expectedVersion: 0 }, 409);
        await prepare(happy, reviewer, resolver, 'admit', index, { wallet: bob.address }, 403);
      }
      let d = await act(happy, reviewer, reviewerWallet, 'admit', index);
      await prepare(happy, donorA, alice, 'settle', index, {}, 403);
      await advance(d.reviewEnd); d = await act(happy, donorA, aliceWallet, 'settle', index);
      check(d.state, index === 0 ? 9 : 10);
      await prepare(happy, donorA, alice, 'settle', index, {}, 409);
      if (!index) { await write(ownerWallet, 'activateMilestone', [happy.onchain, 1n]); await catchUp(); }
    }
    check(await read('totalReleased', [happy.onchain]), 3000000n);
    await act(happy, owner, ownerWallet, 'bond', 1); check(await read('claimableBond', [happy.onchain]), 0n);
    const disputed = await campaign('MVP challenge resubmit continue stop');
    await evidence(disputed); await act(disputed, reviewer, reviewerWallet, 'admit');
    let d = await act(disputed, donorA, aliceWallet, 'challenge');
    const deadlines = [d.dispute.responseDeadline, d.dispute.resolutionDeadline];
    await act(disputed, donorB, bobWallet, 'material'); await act(disputed, owner, ownerWallet, 'respond');
    await prepare(disputed, owner, organizer, 'respond', 0, {}, 403);
    await prepare(disputed, reviewer, resolver, 'continue', 0, {}, 403);
    await advance(deadlines[0]); d = await act(disputed, reviewer, reviewerWallet, 'resubmit'); check(d.state, 6);
    await evidence(disputed); d = await act(disputed, reviewer, reviewerWallet, 'admit'); check(d.version, 2);
    check(d.history.length, 2); check(new Set(d.history.map(p => p.hash)).size, 2);
    const historical = d.history.find(p => p.version === 1), oldDoc = historical.manifest.documents[0];
    const oldResponse = await fetch(base + route(disputed) + `/documents/${historical.hash}/${oldDoc.id}`, { headers: { Cookie: donorA.cookie } });
    check(oldResponse.status, 200); check(digest(Buffer.from(await oldResponse.arrayBuffer())), oldDoc.sha256);
    d = await act(disputed, donorB, bobWallet, 'challenge'); await advance(d.dispute.responseDeadline);
    const end = d.reviewEnd; d = await act(disputed, reviewer, reviewerWallet, 'continue'); check(d.reviewEnd, end);
    await prepare(disputed, donorA, alice, 'challenge', 0, {}, 403);
    await act(disputed, donorA, aliceWallet, 'settle'); await write(ownerWallet, 'activateMilestone', [disputed.onchain, 1n]); await catchUp();
    await evidence(disputed, 1); await act(disputed, reviewer, reviewerWallet, 'admit', 1);
    d = await act(disputed, donorA, aliceWallet, 'challenge', 1); await advance(d.dispute.responseDeadline);
    d = await act(disputed, reviewer, reviewerWallet, 'stop', 1); check(d.state, 12);
    check(await read('refundPool', [disputed.onchain]), 2000000n);
    for (const wallet of [aliceWallet, bobWallet]) await write(wallet, 'claimRefund', [disputed.onchain]);
    check(await read('refundAccounting', [disputed.onchain]), [1999999n, 1n, true, 1n]);
    await catchUp();
    await act(disputed, owner, ownerWallet, 'bond', 1);
    const stalled = await campaign('MVP permissionless challenge timeout', ['3000000']);
    await evidence(stalled); await act(stalled, reviewer, reviewerWallet, 'admit');
    const beforeChallenge = await client.request({ method: 'evm_snapshot' });
    d = await act(stalled, donorA, aliceWallet, 'challenge');
    await advance(d.dispute.resolutionDeadline); d = await act(stalled, donorB, bobWallet, 'timeout'); check(d.state, 12);
    check(await read('refundPool', [stalled.onchain]), 3000000n);
    const counts = (await pool.query('SELECT event_name, count(*)::text AS n FROM chain_events WHERE stream_id=$1 AND canonical GROUP BY event_name ORDER BY event_name', [streamId])).rows;
    await indexer.runOnce(); await indexer.runOnce();
    check((await pool.query('SELECT event_name, count(*)::text AS n FROM chain_events WHERE stream_id=$1 AND canonical GROUP BY event_name ORDER BY event_name', [streamId])).rows, counts, 'Replay must not duplicate records');
    check((await detail(disputed, reviewer, 1)).records.some(r => r.action === 'stop'), true);
    const timeoutHash = d.events.find(e => e.name === 'ChallengeResolved').hash;
    check(await client.request({ method: 'evm_revert', params: [beforeChallenge] }), true);
    await request(route(stalled), donorA.cookie, 'GET', undefined, 503);
    await advance((await client.getBlock({ blockTag: 'latest' })).timestamp + 10n);
    d = await detail(stalled, donorA); check(d.state, 7); check(d.dispute.responseDeadline, '0');
    check(d.events.some(e => e.hash === timeoutHash), false);
    check((await pool.query('SELECT canonical FROM chain_events WHERE stream_id=$1 AND transaction_hash=$2 AND event_name=$3', [streamId, timeoutHash, 'ChallengeResolved'])).rows[0].canonical, false);
    await indexer.runOnce(); check((await detail(stalled, donorA)).state, 7);
    const unattended = await campaign('MVP unattended worker recovery', ['3000000']);
    const savedPlan = (await pool.query('SELECT plan FROM campaign_submissions WHERE campaign_metadata_id=$1', [unattended.id])).rows[0].plan;
    await pool.query('UPDATE campaign_submissions SET plan=$2 WHERE campaign_metadata_id=$1', [unattended.id,
      JSON.stringify({ ...savedPlan, contractCodeHash: `0x${'0'.repeat(64)}` })]);
    check((await request('/milestone-workflows/review-queue', reviewer.cookie)).data.items.some(item => item.campaignId === unattended.id), false,
      'Archived deployment records must not break the current resolver queue');
    await pool.query('UPDATE campaign_submissions SET plan=$2 WHERE campaign_metadata_id=$1', [unattended.id, JSON.stringify(savedPlan)]);
    await advance((await detail(unattended, owner)).evidenceDeadline);
    const fingerprint = createHash('sha256').update(JSON.stringify([manifest.chainId, manifest.contractAddress, manifest.genesisHash,
      manifest.contractCodeHash, manifest.tokenCodeHash, manifest.deploymentBlockHash])).digest('hex');
    const root = filePath.resolve(__dirname, '../..');
    workerPendingPath = filePath.join(root, '.local/timeout-worker', fingerprint + '.json');
    workerManifestPath = filePath.join(root, '.local', `milestone-worker-${randomUUID()}.json`);
    check(fs.existsSync(workerPendingPath), false, 'Disposable worker must not adopt existing intents');
    fs.mkdirSync(filePath.dirname(workerPendingPath), { recursive: true });
    fs.writeFileSync(workerManifestPath, JSON.stringify(manifest));
    const runWorker = () => new Promise((resolve, reject) => {
      const child = spawn(processExec, ['scripts/local-timeout-worker.cjs', '--deployment', workerManifestPath, '--execute'],
        { cwd: __dirname + '/..', windowsHide: true });
      let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
      child.once('error', reject); child.once('exit', code => resolve({ code, output }));
    });
    const processExec = process.execPath;
    const [caller] = await client.request({ method: 'eth_accounts' });
    const key = unattended.onchain.toString();
    fs.writeFileSync(workerPendingPath, JSON.stringify({ [key]: { account: caller, event: 'CampaignFailed',
      args: [key, '0'], functionName: 'finalizeMilestoneTimeout' } }));
    const nonce = await client.getTransactionCount({ address: caller });
    const unknown = await runWorker(); check(unknown.code, 0); check(unknown.output.includes('submission outcome unknown'), true);
    check(await client.getTransactionCount({ address: caller }), nonce, 'Unknown send outcome must never trigger a blind resend');
    check(await read('campaignState', [unattended.onchain]), 6);
    fs.writeFileSync(workerPendingPath, '{}'); // Clear only this fabricated, never-submitted test intent.
    let unavailable = true, workerOutput = '';
    proxy = createServer(async (req, res) => {
      if (unavailable) { res.writeHead(503); res.end('Injected RPC outage'); return; }
      try { const parts = []; for await (const part of req) parts.push(part);
        const forwarded = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(parts) });
        res.writeHead(forwarded.status, { 'Content-Type': 'application/json' }); res.end(await forwarded.text());
      } catch { res.writeHead(503); res.end('RPC unavailable'); }
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    fs.writeFileSync(workerManifestPath, JSON.stringify({ ...manifest, rpcUrl: `http://127.0.0.1:${proxy.address().port}` }));
    worker = spawn(processExec, ['scripts/local-timeout-worker.cjs', '--deployment', workerManifestPath, '--execute', '--watch'],
      { cwd: filePath.resolve(__dirname, '..'), windowsHide: true });
    worker.stdout.on('data', b => { workerOutput += b; }); worker.stderr.on('data', b => {
      workerOutput += b; if (workerOutput.includes('RPC temporarily unavailable')) unavailable = false;
    });
    for (let n = 0; n < 240 && !workerOutput.includes('receipt success'); n++) {
      assert.equal(worker.exitCode, null, workerOutput); await new Promise(resolve => setTimeout(resolve, 250));
    }
    check(workerOutput.includes('RPC temporarily unavailable'), true);
    check(workerOutput.includes('receipt success'), true, workerOutput);
    await new Promise(resolve => { worker.once('exit', resolve); worker.kill(); }); worker = null;
    await new Promise(resolve => proxy.close(resolve)); proxy = null;
    check(JSON.parse(fs.readFileSync(workerPendingPath, 'utf8')), {});
    await catchUp(); check((await detail(unattended, donorA)).state, 12);
    check(await read('refundPool', [unattended.onchain]), 3000000n);
    const paid = await read('refundPaid', [unattended.onchain]);
    fs.writeFileSync(workerManifestPath, JSON.stringify(manifest));
    const restart = await runWorker(); check(restart.code, 0); check(restart.output.includes('submitted'), false);
    check(await read('refundPaid', [unattended.onchain]), paid);
    fs.writeFileSync(workerManifestPath, JSON.stringify({ ...manifest, recoveryPolicy: `0x${'1'.repeat(64)}` }));
    const mismatch = await runWorker(); check(mismatch.code, 1); check(mismatch.output.includes('policy/instance mismatch'), true);
    check(await client.getTransactionCount({ address: caller }), nonce + 1, 'Recovery sends exactly one timeout, never payouts');
    console.log(`PASS: ${checks} MVP lifecycle HTTP/SIWE/storage/receipt/index checks; sequential release, isolated reviewer, resubmit/continue/stop/timeout, private originals, immutable public evidence, partial refunds, retained dust, pull bond, replay and worker outage/unknown-send/restart recovery.`);
  } finally {
    try {
      if (worker) { await new Promise(resolve => { worker.once('exit', resolve); worker.kill(); }); }
      if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
      for (const name of [workerManifestPath, workerPendingPath, workerPendingPath && workerPendingPath + '.tmp'])
        if (name && fs.existsSync(name)) fs.unlinkSync(name);
      if (storage) for (const id of storageIds) await storage.remove(id);
      if (app) { const db = app.get(DRIZZLE_DB).$client; await app.close(); await db.end(); }
      if (streamId) for (const table of ['campaign_chain_projection', 'chain_events', 'indexer_streams']) await pool.query(`DELETE FROM ${table} WHERE stream_id=$1`, [streamId]);
      for (const id of campaignIds) {
        await pool.query('DELETE FROM evidence_access_log WHERE package_id IN (SELECT id FROM campaign_evidence_packages WHERE campaign_metadata_id=$1)', [id]);
        await pool.query('DELETE FROM evidence_publications WHERE package_id IN (SELECT id FROM campaign_evidence_packages WHERE campaign_metadata_id=$1)', [id]);
        for (const table of ['campaign_evidence_packages', 'campaign_evidence_drafts', 'campaign_submissions', 'campaign_milestone_drafts']) await pool.query(`DELETE FROM ${table} WHERE campaign_metadata_id=$1`, [id]);
        await pool.query('DELETE FROM campaign_metadata WHERE id=$1', [id]);
      }
      if (organizationId) { await pool.query('DELETE FROM organization_members WHERE organization_id=$1', [organizationId]); await pool.query('DELETE FROM organizations WHERE id=$1', [organizationId]); }
      for (const table of ['milestone_records', 'platform_roles', 'auth_sessions', 'wallet_links'])
        await pool.query(`DELETE FROM ${table} WHERE ${table === 'milestone_records' ? 'created_by' : 'user_id'} IN (SELECT id FROM users WHERE email=ANY($1))`, [emails]);
      await pool.query('DELETE FROM users WHERE email=ANY($1)', [emails]);
    } finally {
      await pool.end();
      if (pid) { const stop = spawn('wsl.exe', ['-d', 'Ubuntu-24.04', '--', 'kill', '--', pid], { stdio: 'ignore', windowsHide: true });
        await new Promise(resolve => { stop.once('exit', resolve); stop.once('error', resolve); }); }
      anvil.kill();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
