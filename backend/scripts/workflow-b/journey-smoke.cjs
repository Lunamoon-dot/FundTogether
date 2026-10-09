const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createPublicClient, createWalletClient, http, getAddress, encodeFunctionData, decodeEventLog, encodeAbiParameters, keccak256, toHex } = require('viem');
const { SiweMessage } = require('siwe');
const { Test } = require('@nestjs/testing');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { guardEnvironment } = require('./guard-environment.cjs');
const { giftPlan } = require('./pilot-fixtures.cjs');
const { pdf, png } = require('./format-fixtures.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..');
const from = file => require(path.join(root, 'backend/dist/src', file));
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });
process.env.INDEXER_ENABLED = 'false'; process.env.LOG_LEVEL = 'silent';
const forkUrl = 'http://127.0.0.1:9548';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startFork(restorePath) {
  // Use a fresh TCP socket: a cached HTTP keep-alive connection from a stopped
  // node can fail with a stale-socket error despite the port being free.
  await new Promise((resolve, reject) => {
    const socket = require('node:net').createConnection({ host: '127.0.0.1', port: 9548 });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Port9548 already responds; preserve it and do not start or reset another fork')); });
    socket.once('error', error => { socket.destroy(); error.code === 'ECONNREFUSED' ? resolve() : reject(error); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Port9548 status unknown; do not start another fork')); });
  });
  const target = spawnSync('wsl.exe', ['-d', 'Ubuntu-24.04', '--exec', 'wslpath', '-a', path.join(__dirname, 'fork-node.py')], { encoding: 'utf8', windowsHide: true });
  assert.equal(target.status, 0, 'Resolve owned fork supervisor path');
  const child = spawn('wsl.exe', ['-d', 'Ubuntu-24.04', '--exec', 'python3', '-B', target.stdout.trim(), ...(restorePath ? [restorePath] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let pid = '', failure = '', rpcFailure = '';
  child.stdout.on('data', chunk => { pid += chunk; });
  child.stderr.on('data', chunk => { failure = (failure + chunk).slice(-2000); });
  child.on('error', error => { failure = error.message; });
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit'); child.stdin.end();
    await Promise.race([exited, pause(7000).then(() => { if (child.exitCode === null) throw new Error('Owned fork shutdown pending; do not launch a second fork'); })]);
    // WSL's localhost forward can outlive the child briefly. Wait for that
    // listener to close before returning the reusable lab port to the caller.
    for (let i = 0; i < 40; i++) {
      const closed = await new Promise((resolve, reject) => {
        const socket = require('node:net').createConnection({ host: '127.0.0.1', port: 9548 });
        socket.setTimeout(1000);
        socket.once('connect', () => { socket.destroy(); resolve(false); });
        socket.once('error', error => { socket.destroy(); error.code === 'ECONNREFUSED' ? resolve(true) : reject(error); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
      });
      if (closed) return;
      await pause(250);
    }
    throw new Error('Owned node exited but port9548 forwarding remains; do not launch another node');
  };
  try {
    for (let i = 0; i < 240; i++) {
      if (child.exitCode !== null) throw new Error(`Owned fork failed: ${failure}`);
      try {
        const result = await new Promise((resolve, reject) => {
          const request = require('node:http').request(forkUrl, { method: 'POST', agent: false,
            headers: { 'Content-Type': 'application/json', Connection: 'close' } }, response => {
            let body = ''; response.on('data', chunk => { body += chunk; });
            response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
          });
          request.setTimeout(1000, () => request.destroy(new Error('RPC startup request timeout')));
          request.on('error', reject);
          request.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }));
        });
        if (result.result === '0x7a6a') return { child, pid: pid.trim(), stop };
        rpcFailure = JSON.stringify(result);
      } catch (error) { rpcFailure = error.message; }
      if (i > 0 && i % 40 === 0) console.log(`Waiting on owned B lab process${pid.trim()}: ${rpcFailure}; ${failure}`);
      await pause(250);
    }
    throw new Error(`Owned fork startup timed out: ${rpcFailure}; ${failure}`);
  } catch (error) { await stop(); throw error; }
}

async function main() {
  guardEnvironment(process.env);
  const schema = from('database/schema');
  const { AdvanceBlockchainService } = from('advance/advance-blockchain.service');
  const { AdvanceIndexerService } = from('advance/advance-indexer.service');
  const { EvidenceStorageService } = from('modules/evidence/evidence-storage.service');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/generated/deployment.local.json'), 'utf8'));
  const source = new AdvanceBlockchainService(manifest);
  await source.verifyDeployment();
  const sourceHead = await source.client.getBlock(), sourceCount = await source.read('nextCampaignId', []);
  const fork = await startFork();
  const client = createPublicClient({ chain: source.client.chain, transport: http(forkUrl, { retryCount: 0 }), pollingInterval: 50 });
  const chain = new AdvanceBlockchainService(manifest);
  Object.defineProperty(chain, 'client', { value: client });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  const db = drizzle(pool, { schema });
  const rollback = new Error('ROLLBACK_HTTP_JOURNEY');
  const report = { testedAt: new Date().toISOString(), mode: 'AUTOMATED_HTTP_DISPOSABLE_FORK', context: chain.context,
    fork: { url: forkUrl, pid: fork.pid, sourceBlock: sourceHead.number.toString(), sourceHash: sourceHead.hash },
    manualExtension: false, reviewerExperiment: false, documentScope: 'Synthetic format probes; not labelled activity evidence',
    assertions: [], receipts: [], journeys: [] };
  const check = name => { report.assertions.push(name); console.log(name); };
  const countRows = async () => (await pool.query('select (select count(*) from users)::text users, (select count(*) from campaign_metadata)::text campaigns, (select count(*) from campaign_evidence_packages)::text packages')).rows[0];
  try {
    const beforeRows = await countRows();
    await chain.verifyDeployment();
    try {
      await db.transaction(async lab => {
        const module = await Test.createTestingModule({ imports: [from('advance/advance-app.module').AdvanceAppModule] })
          .overrideProvider(from('database/database.constants').DRIZZLE_DB).useValue(lab)
          .overrideProvider(AdvanceBlockchainService).useValue(chain).compile();
        const app = module.createNestApplication({ logger: false });
        const objects = new Set();
        const storage = app.get(EvidenceStorageService), put = storage.put.bind(storage);
        storage.put = async (id, bytes, mediaType) => { objects.add(id); return put(id, bytes, mediaType); };
        try {
          await app.listen(0, '127.0.0.1');
          const base = await app.getUrl(), indexer = app.get(AdvanceIndexerService);
          const tokenAbi = from('blockchain/generated/advance/mock-usdc.abi.json');
          async function sync() {
            for (let i = 0; i < 50; i++) { await indexer.runOnce(); if ((await indexer.status()).status === 'ready') return; }
            throw new Error('B fork indexer did not catch up');
          }
          async function request(actor, method, route, body, status = 200) {
            const multipart = body instanceof FormData;
            const response = await fetch(base + route, { method, headers: { Origin: process.env.WEB_ORIGIN,
              ...(actor?.cookie ? { Cookie: actor.cookie } : {}), ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }) },
              ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
            const text = await response.text(), data = text ? JSON.parse(text) : null;
            assert.equal(response.status, status, `${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
            return { response, data };
          }
          async function send(actor, functionName, args, token = false) {
            const abi = token ? tokenAbi : chain.abi, address = token ? manifest.tokenAddress : manifest.contractAddress;
            // Encode ABI-typed integer strings from the real HTTP preparation response.
            const data = encodeFunctionData({ abi, functionName, args });
            const simulation = await client.call({ account: actor.address, to: address, data });
            assert.ok(simulation);
            // Unlocked Anvil accounts do not apply a wallet's gas margin. Its
            // implicit limit has exhausted on submitEvidence despite a valid
            // same-block eth_call; estimate explicitly for this test sender.
            const estimatedGas = await client.estimateGas({ account: actor.address, to: address, data });
            const started = performance.now();
            const hash = await actor.wallet.sendTransaction({ to: address, data, gas: estimatedGas * 120n / 100n });
            const receipt = await client.waitForTransactionReceipt({ hash });
            const tx = await client.getTransaction({ hash });
            if (receipt.status !== 'success') {
              console.error(JSON.stringify({ failedFunction: functionName, hash, gas: tx.gas.toString(), gasUsed: receipt.gasUsed.toString(), block: receipt.blockNumber.toString() }));
              await client.call({ account: actor.address, to: address, data, blockNumber: receipt.blockNumber });
            }
            assert.equal(receipt.status, 'success', functionName);
            assert.equal(tx.input, data); assert.equal(tx.from.toLowerCase(), actor.address.toLowerCase());
            assert.equal(tx.to.toLowerCase(), address.toLowerCase());
            const events = receipt.logs.filter(log => log.address.toLowerCase() === address.toLowerCase()).map(log =>
              decodeEventLog({ abi, data: log.data, topics: log.topics, strict: true }));
            assert.ok(events.length);
            const minedMs = performance.now() - started;
            await sync();
            const indexedMs = performance.now() - started - minedMs;
            const status = await indexer.status();
            assert.ok(BigInt(status.lastIndexedBlock) >= receipt.blockNumber);
            assert.equal((await client.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash);
            if (!token) {
              const { eq, and } = require('drizzle-orm');
              const rows = await lab.select().from(schema.chainEvents).where(and(eq(schema.chainEvents.streamId, indexer.streamKey),
                eq(schema.chainEvents.transactionHash, hash), eq(schema.chainEvents.canonical, true)));
              assert.equal(rows.length, events.length);
              assert.ok(rows.every(row => row.blockHash === receipt.blockHash));
            }
            report.receipts.push(JSON.parse(JSON.stringify({ functionName, hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
              estimatedGas, gasLimit: tx.gas, gasUsed: receipt.gasUsed, events, minedMs: Math.round(minedMs), indexedMs: Math.round(indexedMs) }, (_key, v) => typeof v === 'bigint' ? v.toString() : v)));
            return receipt;
          }
          const addresses = await client.request({ method: 'eth_accounts' });
          const actors = [];
          for (const [i, name] of ['resolver', 'organizer', 'donorA', 'donorB', 'staff'].entries()) {
            const actor = { name, address: getAddress(addresses[i]), wallet: createWalletClient({ account: addresses[i], chain: client.chain, transport: http(forkUrl) }) };
            const { and, eq } = require('drizzle-orm');
            const [linked] = await lab.select().from(schema.walletLinks).where(and(eq(schema.walletLinks.address, actor.address.toLowerCase()), eq(schema.walletLinks.chainId, '31338')));
            if (!linked) {
              const { randomUUID, randomBytes } = require('node:crypto');
              const registered = await request(null, 'POST', '/auth/register', { email: `journey-${randomUUID()}@workflow-b.invalid`, password: randomBytes(24).toString('hex') }, 201);
              actor.cookie = registered.response.headers.get('set-cookie').split(';')[0]; actor.id = registered.data.userId;
            }
            const nonce = (await request(actor, linked ? 'GET' : 'POST', linked ? '/auth/nonce' : '/auth/wallets/nonce', linked ? undefined : {})).data;
            const message = new SiweMessage({ scheme: 'http', domain: nonce.domain, uri: nonce.uri, address: actor.address,
              version: '1', chainId: nonce.chainId, nonce: nonce.nonce, issuedAt: new Date().toISOString(), statement: 'Synthetic disposable B integration account' }).prepareMessage();
            const auth = await request(actor, 'POST', linked ? '/auth/verify' : '/auth/wallets/link', { message, signature: await actor.wallet.signMessage({ message }) });
            if (linked) { actor.cookie = auth.response.headers.get('set-cookie').split(';')[0]; actor.id = auth.data.userId; }
            actors.push(actor);
          }
          const [resolver, organizer, donorA, donorB, staff] = actors;
          for (const actor of actors) await lab.insert(schema.platformRoles).values({ userId: actor.id,
            roles: actor === resolver ? ['RESOLVER'] : actor === staff ? ['ADMIN'] : [] })
            .onConflictDoUpdate({ target: schema.platformRoles.userId, set: { roles: actor === resolver ? ['RESOLVER'] : actor === staff ? ['ADMIN'] : [] } });
          await sync();
          check('Real SIWE cookies for five roles; roles changed only inside rolled-back B transaction');
          const org = (await request(organizer, 'POST', '/organizations', { name: 'Synthetic HTTP journey organization', description: 'Disposable local integration only' }, 201)).data;
          await request(organizer, 'PUT', `/organizations/${org.id}/wallet`, { address: organizer.address, chainId: 31338 });
          const verification = { status: 'VERIFIED', summary: 'Synthetic authority registry', reason: 'Controlled fixture',
            sources: [{ description: 'Synthetic registry', reference: 'local-fixture-only' }], scope: 'Gift pilot', limits: 'No real institution checked',
            validUntil: new Date(Number((await client.getBlock()).timestamp + 86400000n) * 1000).toISOString() };
          await request(staff, 'POST', `/v1/advance/internal/organizations/${org.id}/verifications`, verification, 201);
          const ownerView = async c => (await request(organizer, 'GET', `/v1/advance/campaigns/${c.id}/workflow`)).data;
          async function prepare(c, actor, action, extra = {}, expected = 201) {
            const view = await ownerView(c);
            const body = { action, context: view.plan.context, actorWallet: actor.address, expectedPlanHash: view.plan.planHash,
              expectedCheckpoint: view.checkpoint, expectedState: view.workflow?.state ?? 'UNSUBMITTED', expectedCurrentStage: view.workflow?.currentStage ?? '0', ...extra };
            return (await request(actor, 'POST', `/v1/advance/campaigns/${c.id}/actions/prepare`, body, expected)).data;
          }
          async function action(c, actor, name, extra) {
            let prepared = await prepare(c, actor, name, extra);
            if (prepared.approval) {
              assert.equal(prepared.approval.spender.toLowerCase(), manifest.contractAddress.toLowerCase());
              assert.equal(prepared.approval.tokenAddress.toLowerCase(), manifest.tokenAddress.toLowerCase());
              await send(actor, 'approve', [prepared.approval.spender, prepared.approval.amount], true);
              prepared = await prepare(c, actor, name, extra);
              assert.equal(prepared.approval, undefined);
            }
            assert.equal(prepared.contractAddress, manifest.contractAddress); assert.equal(prepared.actorWallet.toLowerCase(), actor.address.toLowerCase());
            return send(actor, prepared.functionName, prepared.args);
          }
          const review = (c, kind, extra = {}) => ({ kind, actorWallet: resolver.address, expectedPlanHash: c.plan.planHash,
            reason: 'Synthetic integration decision', sources: verification.sources, scope: 'HTTP/RPC/accounting only',
            limits: 'Automated decision; not independent human verification', conflictOfInterest: false, publicDisclosureConfirmed: true, ...extra });
          const balance = address => client.readContract({ address: manifest.tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [address] });
          const initialEscrow = await balance(manifest.contractAddress);
          let expectedCustody = 0n;
          async function verify(c, state, numbers) {
            const view = await ownerView(c), direct = await chain.snapshot(BigInt(c.chainId), BigInt(view.checkpoint.blockNumber));
            assert.equal(view.workflow.state, state);
            assert.deepEqual(view.snapshot.campaign, direct.campaign); assert.deepEqual(view.snapshot.stages, direct.stages);
            for (const [key, value] of Object.entries(numbers ?? {})) assert.equal(direct.campaign[key], String(value), `${c.label} ${key}`);
            const p = direct.campaign;
            assert.equal(BigInt(p.contributed) + BigInt(p.returned), BigInt(p.advanced) + BigInt(p.refunded) + BigInt(p.custody));
            const pub = (await request(null, 'GET', `/v1/advance/public/campaigns/${c.chainId}`)).data;
            assert.deepEqual(pub.snapshot.campaign, direct.campaign); assert.deepEqual(pub.snapshot.stages, direct.stages);
            return view;
          }
          async function create(count, label, fullyFunded = true, budgets, confirmFirst = true) {
            const planInput = giftPlan(count); planInput.title = `Synthetic HTTP ${label}`;
            if (budgets) planInput.stages.forEach((s, i) => { s.budgetUnits = String(budgets[i]); });
            const c = (await request(organizer, 'POST', `/v1/advance/organizations/${org.id}/campaigns`, planInput, 201)).data;
            c.label = label; c.input = planInput;
            c.plan = (await request(organizer, 'POST', `/v1/advance/campaigns/${c.id}/submission`, { expectedRevision: c.revision }, 201)).data;
            await action(c, organizer, 'SUBMIT_CAMPAIGN');
            c.chainId = (await ownerView(c)).workflow.campaignId;
            await prepare(c, organizer, 'CLAIM_ADVANCE', { stage: '0' }, 409);
            await action(c, resolver, 'APPROVE_CAMPAIGN', { review: review(c, 'APPROVE_CAMPAIGN') });
            await action(c, organizer, 'PUBLISH_CAMPAIGN');
            const goal = c.plan.budgets.map(BigInt).reduce((a, b) => a + b), half = goal / 2n;
            for (const donor of fullyFunded ? [donorA, donorB] : [donorA]) {
              const contribution = donor === donorA ? half : goal - half;
              await send(resolver, 'mint', [donor.address, contribution], true);
              await action(c, donor, 'DONATE', { amount: contribution.toString() }); expectedCustody += contribution;
            }
            if (!fullyFunded) { await verify(c, 'FUNDING', { contributed: half, advanced: 0, custody: half }); return c; }
            await verify(c, 'FIRST_REVIEW', { advanced: 0, custody: goal });
            await prepare(c, organizer, 'CLAIM_ADVANCE', { stage: '0' }, 409);
            if (confirmFirst) await action(c, resolver, 'CONFIRM_FIRST_ADVANCE', { review: review(c, 'FIRST_ELIGIBILITY') });
            return c;
          }
          async function advance(c, stage) {
            const before = await balance(organizer.address), budget = BigInt(c.plan.budgets[stage]);
            await prepare(c, donorA, 'CLAIM_ADVANCE', { stage: String(stage) }, 403);
            await action(c, organizer, 'CLAIM_ADVANCE', { stage: String(stage) });
            expectedCustody -= budget;
            assert.equal(await balance(organizer.address), before + budget);
            await prepare(c, organizer, 'CLAIM_ADVANCE', { stage: String(stage) }, 409);
            check(`${c.label} stage${stage}: fixed budget to organizer once, wrong wallet/early/repeat blocked`);
          }
          async function evidence(c, stage) {
            const endpoint = `/v1/advance/campaigns/${c.id}/stages/${stage}/evidence`;
            const existing = (await ownerView(c)).packages.filter(p => p.milestoneIndex === String(stage));
            const version = existing.length + 1;
            const criteria = c.input.stages[stage].acceptanceCriteria;
            let draft;
            if (version === 1) {
              draft = (await request(organizer, 'PATCH', endpoint, { expectedRevision: 0, content: {
                report: { summary: `Synthetic ${c.label} stage${stage}`, performedFrom: '2026-10-01', performedTo: '2026-10-02', outcomes: [] },
                documents: [], expenses: [], giftReport: { deliveredPackages: c.input.stages[stage].targetPackages, recipientScope: c.input.recipientScope,
                  distributionFrom: '2026-10-01', distributionTo: '2026-10-02', handoverSummary: 'Controlled format test', limitations: 'No actual delivery claimed' },
              } })).data;
            } else draft = (await request(organizer, 'GET', endpoint)).data;
            for (const kind of ['REPORT', 'PHOTO', 'INVOICE', 'PAYMENT_PROOF', 'DELIVERY_RECORD']) {
              const form = new FormData(); form.set('expectedRevision', String(draft.revision)); form.set('kind', kind);
              form.set('file', new Blob([kind === 'PHOTO' ? png() : pdf(`SYNTHETIC ${c.label} stage${stage} version${version} ${kind}`)],
                { type: kind === 'PHOTO' ? 'image/png' : 'application/pdf' }), kind === 'PHOTO' ? 'probe.png' : 'probe.pdf');
              draft = (await request(organizer, 'POST', `${endpoint}/documents`, form, 201)).data;
            }
            const linked = { ...draft.content, documents: draft.content.documents.map(d => ({ ...d, relatesToCriterionIds: criteria.map(r => r.criterionId) })),
              report: { ...draft.content.report, outcomes: criteria.map(r => ({ criterionId: r.criterionId, description: 'Synthetic declared outcome', documentIds: draft.content.documents.map(d => d.documentId) })) } };
            draft = (await request(organizer, 'PATCH', endpoint, { expectedRevision: draft.revision, content: linked })).data;
            const frozen = (await request(organizer, 'POST', `${endpoint}/freeze`, { expectedRevision: draft.revision }, 201)).data;
            await request(null, 'GET', `/v1/advance/evidence-packages/${frozen.id}/original`, undefined, 401);
            await request(donorA, 'GET', `/v1/advance/evidence-packages/${frozen.id}/original`, undefined, 403);
            const publicForm = new FormData(); publicForm.set('summary', 'Synthetic public format bundle'); publicForm.set('redactionConfirmed', 'true');
            publicForm.set('originalDocumentIds', JSON.stringify(draft.content.documents.map(d => d.documentId)));
            for (const doc of draft.content.documents) publicForm.append('files', new Blob([pdf(`SYNTHETIC PUBLIC ${doc.documentId}`)], { type: 'application/pdf' }), 'public.pdf');
            const published = (await request(organizer, 'POST', `/v1/advance/evidence-packages/${frozen.id}/redacted`, publicForm, 201)).data;
            await action(c, organizer, 'SUBMIT_EVIDENCE', { stage: String(stage), packageId: frozen.id });
            const ref = { campaignId: c.chainId, stage: String(stage), version: String(version), evidenceHash: frozen.evidenceHash };
            const pub = (await request(null, 'GET', `/v1/advance/public/evidence/${published.hash}`)).data;
            assert.equal(from('advance/advance-plan').sha256(pub.manifestBytes), published.hash);
            check(`${c.label} stage${stage} v${version}: HTTP multipart, freeze/hash, private ACL, redacted publication and submission`);
            return { ref, frozen, published, documents: draft.content.documents, criteria };
          }
          async function assess(c, e, outcome = 'MET', spent) {
            const actionName = outcome === 'MET' ? 'APPROVE_EVIDENCE' : outcome === 'NOT_MET' ? 'REJECT_EVIDENCE' : 'REQUEST_SUPPLEMENT';
            await action(c, resolver, actionName, { review: review(c, 'EVIDENCE', { evidenceRef: e.ref, packageId: e.frozen.id,
              publicHash: e.published.hash, decision: { outcome, conflictOfInterest: false, campaignSpent: spent ?? c.plan.budgets[Number(e.ref.stage)],
                criteria: e.criteria.map(r => ({ criterionId: r.criterionId, outcome, reason: 'Synthetic machine-selected outcome',
                  documentIds: e.documents.map(d => d.documentId), sources: ['controlled-fixture'], limits: 'No human truth assessment' })) } }) });
          }
          async function warpTo(timestamp) {
            assert.equal(client.transport.url, forkUrl);
            await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] });
            await client.request({ method: 'evm_mine' }); await sync();
          }
          async function finalize(c, e) {
            const view = await ownerView(c);
            await prepare(c, donorA, 'FINALIZE_STAGE', { evidenceRef: e.ref }, 409);
            const before = await balance(organizer.address);
            await warpTo(view.workflow.deadlines.challengeEnd);
            await action(c, donorA, 'FINALIZE_STAGE', { evidenceRef: e.ref });
            assert.equal(await balance(organizer.address), before, 'Final acceptance does not pay the advance twice');
          }
          if (!process.argv.includes('--waiting')) {
          const g1 = await create(1, 'G1-complete');
          await advance(g1, 0); const g1e = await evidence(g1, 0); await assess(g1, g1e); await finalize(g1, g1e);
          const g1done = await verify(g1, 'COMPLETED', { contributed: 2200000000n, advanced: 2200000000n, returned: 0, custody: 0 });
          assert.equal(g1done.snapshot.stages[0].state, 'FINALIZED');
          report.journeys.push({ label: g1.label, campaignId: g1.chainId, metadataId: g1.id, snapshot: g1done.snapshot });
          check('G1 COMPLETED through HTTP/SIWE/files/contract/indexer; final acceptance transfers zero tokens');
          const g2 = await create(3, 'G2-complete');
          for (let stage = 0; stage < 3; stage++) {
            await advance(g2, stage);
            let e = await evidence(g2, stage);
            if (stage === 0) {
              await assess(g2, e, 'NEEDS_INFORMATION');
              await verify(g2, 'SUPPLEMENT_DUE', { advanced: 1100000000n, custody: 2200000000n });
              await prepare(g2, organizer, 'CLAIM_ADVANCE', { stage: '0' }, 409);
              const prior = e; e = await evidence(g2, stage);
              const manifest2 = JSON.parse(e.frozen.manifestBytes);
              assert.equal(e.ref.version, '2'); assert.equal(manifest2.parentPackageId, prior.frozen.id);
              const versions = (await ownerView(g2)).snapshot.stages[stage].submissions;
              assert.equal(versions[1].parentVersion, '1'); assert.equal(versions[0].evidenceHash, prior.frozen.evidenceHash);
            }
            await assess(g2, e); await finalize(g2, e);
            const state = stage === 2 ? 'COMPLETED' : 'ADVANCE_AVAILABLE';
            await verify(g2, state, { advanced: BigInt(stage + 1) * 1100000000n, custody: BigInt(2 - stage) * 1100000000n });
          }
          const g2done = await verify(g2, 'COMPLETED');
          assert.ok(g2done.snapshot.stages.every(s => s.state === 'FINALIZED'));
          report.journeys.push({ label: g2.label, campaignId: g2.chainId, metadataId: g2.id, snapshot: g2done.snapshot });
          check('G2 three distinct advances; supplement v2 receives no extra advance; all three stages finalized');
          if (process.argv.includes('--failures')) {
            const statement = { reason: 'Synthetic disputed criterion', sources: ['controlled-case-source'], limits: 'No real allegation', publicDisclosureConfirmed: true };
            async function open(c, e) {
              await prepare(c, staff, 'OPEN_CASE', { evidenceRef: e.ref, statement }, 403);
              await action(c, donorA, 'OPEN_CASE', { evidenceRef: e.ref, statement });
              await action(c, donorB, 'ADD_CASE_MATERIAL', { evidenceRef: e.ref, statement });
              await action(c, organizer, 'SUBMIT_CASE_RESPONSE', { evidenceRef: e.ref, statement });
              await prepare(c, organizer, 'SUBMIT_CASE_RESPONSE', { evidenceRef: e.ref, statement }, 409);
              await prepare(c, organizer, 'CLAIM_ADVANCE', { stage: e.ref.stage }, 409);
            }
            async function resolve(c, e, resolution) {
              const extra = { review: review(c, 'CASE', { evidenceRef: e.ref, resolution,
                ...(resolution === 'CONTINUE' ? { packageId: e.frozen.id, publicHash: e.published.hash } : {}) }) };
              await prepare(c, resolver, 'RESOLVE_CASE', extra, 409);
              await warpTo((await ownerView(c)).workflow.deadlines.responseEnd);
              await prepare(c, donorB, 'ADD_CASE_MATERIAL', { evidenceRef: e.ref, statement }, 409);
              await action(c, resolver, 'RESOLVE_CASE', extra);
            }
            async function returned(c, stage, amount) {
              const before = await balance(organizer.address);
              await action(c, organizer, 'RETURN_FUNDS', { stage: String(stage), amount: String(amount) });
              expectedCustody += BigInt(amount);
              assert.equal(await balance(organizer.address), before - BigInt(amount));
            }
            async function claim(c, donor, baseAmount, supplement) {
              const rights = (await request(donor, 'GET', `/v1/advance/refunds/${c.chainId}`)).data.items;
              const right = rights.find(r => r.wallet.toLowerCase() === donor.address.toLowerCase());
              assert.ok(right); assert.equal(right.base, String(baseAmount)); assert.equal(right.supplement, String(supplement));
              const before = await balance(donor.address);
              await action(c, donor, 'CLAIM_REFUND');
              assert.equal(await balance(donor.address), before + BigInt(baseAmount) + BigInt(supplement));
              expectedCustody -= BigInt(baseAmount) + BigInt(supplement);
              await prepare(c, donor, 'CLAIM_REFUND', {}, 409);
            }
            async function record(c, numbers) {
              const view = await verify(c, 'STOPPED', numbers);
              report.journeys.push({ label: c.label, campaignId: c.chainId, metadataId: c.id, snapshot: view.snapshot });
            }
            const stopped = await create(3, 'G2-case-stop');
            await advance(stopped, 0); const first = await evidence(stopped, 0); await assess(stopped, first);
            await open(stopped, first); await resolve(stopped, first, 'CONTINUE');
            await prepare(stopped, donorA, 'OPEN_CASE', { evidenceRef: first.ref, statement }, 409);
            await finalize(stopped, first); await advance(stopped, 1);
            const second = await evidence(stopped, 1); await assess(stopped, second);
            await open(stopped, second); await resolve(stopped, second, 'STOP');
            await record(stopped, { advanced: 2200000000n, custody: 1100000000n, basePool: 1100000000n, supplementPool: 0 });
            await returned(stopped, 1, 50000000n);
            for (const donor of [donorB, donorA]) await claim(stopped, donor, 550000000n, 25000000n);
            await returned(stopped, 0, 110000000n);
            for (const donor of [donorA, donorB]) await claim(stopped, donor, 0, 55000000n);
            await record(stopped, { basePool: 1100000000n, supplementPool: 160000000n, refunded: 1260000000n, custody: 0 });
            check('G2 CONTINUE then stage2 STOP: immutable base1100, return50 plus later110; both prior claimers recover supplement exactly');

            const zero = await create(1, 'G1-zero-base-stop'); await advance(zero, 0);
            await action(zero, resolver, 'STOP_CAMPAIGN', { review: review(zero, 'STOP') });
            await record(zero, { advanced: 2200000000n, basePool: 0, custody: 0 });
            for (const donor of [donorA, donorB]) await claim(zero, donor, 0, 0);
            await returned(zero, 0, 50000000n);
            for (const donor of [donorB, donorA]) await claim(zero, donor, 0, 25000000n);
            await record(zero, { basePool: 0, supplementPool: 50000000n, refunded: 50000000n, custody: 0 });
            check('G1 STOP after full advance has base0; zero-base consumed once without transfer; later return grants fresh supplement');

            const before = await create(1, 'G1-return-before-stop'); await advance(before, 0);
            await returned(before, 0, 50000000n);
            await action(before, resolver, 'STOP_CAMPAIGN', { review: review(before, 'STOP') });
            // Fault injection on the disposable fork only: temporarily remove
            // token custody to force a real ERC20 transfer revert, then restore
            // exact storage and exercise the retained right. Runtime code stays
            // identical so this tests rollback rather than identity rejection.
            const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [manifest.contractAddress, 0n]));
            const tokenStorage = await client.getStorageAt({ address: manifest.tokenAddress, slot });
            assert.equal(BigInt(tokenStorage), await balance(manifest.contractAddress), 'Verified OpenZeppelin balances slot');
            const rightsBefore = await chain.read('refundClaimable', [BigInt(before.chainId), donorA.address]);
            const campaignBefore = (await ownerView(before)).snapshot.campaign;
            const donorBefore = await balance(donorA.address);
            try {
              await client.request({ method: 'anvil_setStorageAt', params: [manifest.tokenAddress, slot, toHex(0n, { size: 32 })] });
              const intent = await prepare(before, donorA, 'CLAIM_REFUND');
              const data = encodeFunctionData({ abi: chain.abi, functionName: intent.functionName, args: intent.args });
              await assert.rejects(client.call({ account: donorA.address, to: manifest.contractAddress, data }));
              const failedHash = await donorA.wallet.sendTransaction({ to: manifest.contractAddress, data, gas: 300000n });
              const failedReceipt = await client.waitForTransactionReceipt({ hash: failedHash });
              assert.equal(failedReceipt.status, 'reverted'); assert.equal(failedReceipt.logs.length, 0);
              await sync();
              assert.deepEqual(await chain.read('refundClaimable', [BigInt(before.chainId), donorA.address]), rightsBefore);
              assert.deepEqual((await ownerView(before)).snapshot.campaign, campaignBefore);
              assert.equal(await balance(donorA.address), donorBefore);
              report.injectedTransferFailure = { hash: failedHash, blockHash: failedReceipt.blockHash, gasUsed: failedReceipt.gasUsed.toString(),
                injection: 'Disposable-fork token balance set to0; original balance restored', status: failedReceipt.status, retainedRights: true };
            } finally { await client.request({ method: 'anvil_setStorageAt', params: [manifest.tokenAddress, slot, tokenStorage] }); }
            for (const donor of [donorA, donorB]) await claim(before, donor, 25000000n, 0);
            await record(before, { basePool: 50000000n, supplementPool: 0, refunded: 50000000n, custody: 0 });
            check('Return50 before snapshot belongs to base; actual failed refund receipt preserves all rights and successful retry pays once');

            for (const order of [[donorA, donorB], [donorB, donorA]]) {
              const tiny = await create(3, `Tiny-units-${order[0].name}-first`, true, [2, 2, 3]);
              await advance(tiny, 0);
              await action(tiny, resolver, 'STOP_CAMPAIGN', { review: review(tiny, 'STOP') });
              for (const donor of order) await claim(tiny, donor, 2, 0);
              await returned(tiny, 0, 1);
              for (const donor of order) await prepare(tiny, donor, 'CLAIM_REFUND', {}, 409);
              await returned(tiny, 0, 1);
              await claim(tiny, donorB, 0, 1);
              await prepare(tiny, donorA, 'CLAIM_REFUND', {}, 409);
              await prepare(tiny, organizer, 'RETURN_FUNDS', { stage: '0', amount: '1' }, 409);
              await record(tiny, { contributed: 7, advanced: 2, returned: 2, basePool: 5, supplementPool: 2, refunded: 5, custody: 2 });
            }
            check('Tiny contributions3/4: base5 pays2/2 in either order; cumulative supplement2 pays0/1; retained rounding2 never paid to last claimant');

            const missing = await create(1, 'G1-case-resubmit-timeout'); await advance(missing, 0);
            let e = await evidence(missing, 0); await assess(missing, e); await open(missing, e); await resolve(missing, e, 'RESUBMIT');
            const prior = e; e = await evidence(missing, 0);
            assert.equal(JSON.parse(e.frozen.manifestBytes).parentPackageId, prior.frozen.id);
            await assess(missing, e, 'INCONCLUSIVE');
            const waiting = await ownerView(missing);
            await prepare(missing, donorA, 'FINALIZE_TIMEOUT', {}, 409);
            await warpTo(waiting.workflow.deadlines.submissionEnd);
            await prepare(missing, organizer, 'CLAIM_ADVANCE', { stage: '0' }, 409);
            await action(missing, donorA, 'FINALIZE_TIMEOUT');
            await record(missing, { advanced: 2200000000n, basePool: 0, custody: 0 });
            check('Case RESUBMIT creates version2 without advance; INCONCLUSIVE requests evidence; expired supplement stops permissionlessly');

            const funding = await create(1, 'G1-partial-funding-timeout', false);
            const fundingView = await ownerView(funding);
            await prepare(funding, donorA, 'FINALIZE_TIMEOUT', {}, 409);
            await warpTo(fundingView.workflow.deadlines.fundingEnd);
            await prepare(funding, donorB, 'DONATE', { amount: '1' }, 409);
            await action(funding, donorB, 'FINALIZE_TIMEOUT');
            await claim(funding, donorA, 1100000000n, 0);
            await record(funding, { contributed: 1100000000n, advanced: 0, basePool: 1100000000n, refunded: 1100000000n, custody: 0 });
            check('At fundingEnd further contribution rejects; permissionless timeout refunds only actual contribution');
          }
          }
          if (process.argv.includes('--waiting')) {
            async function stopAt(c, deadlineKey, contributed, advanced) {
              await prepare(c, donorA, 'FINALIZE_TIMEOUT', {}, 409);
              const view = await ownerView(c);
              await warpTo(view.workflow.deadlines[deadlineKey]);
              await action(c, donorB, 'FINALIZE_TIMEOUT');
              const stopped = await verify(c, 'STOPPED', { contributed, advanced, basePool: contributed - advanced, custody: contributed - advanced });
              report.journeys.push({ label: c.label, campaignId: c.chainId, metadataId: c.id, snapshot: stopped.snapshot });
              check(`${c.label}: before deadline rejected, equality stops with conserved custody`);
            }
            const firstWait = await create(1, 'First-review-absence', true, undefined, false);
            await stopAt(firstWait, 'firstReviewEnd', 2200000000n, 0n);
            const claimWait = await create(1, 'Advance-unclaimed');
            await stopAt(claimWait, 'claimEnd', 2200000000n, 0n);
            const noEvidence = await create(1, 'No-execution-evidence'); await advance(noEvidence, 0);
            await stopAt(noEvidence, 'submissionEnd', 2200000000n, 2200000000n);
            const noReviewer = await create(1, 'Evidence-review-absence'); await advance(noReviewer, 0); await evidence(noReviewer, 0);
            await stopAt(noReviewer, 'reviewEnd', 2200000000n, 2200000000n);
            const noResolution = await create(1, 'Case-resolution-absence'); await advance(noResolution, 0);
            const e = await evidence(noResolution, 0); await assess(noResolution, e);
            const end = BigInt((await ownerView(noResolution)).workflow.deadlines.challengeEnd);
            await warpTo(end - 2n);
            const opened = await action(noResolution, donorA, 'OPEN_CASE', { evidenceRef: e.ref,
              statement: { reason: 'Synthetic near-deadline case', sources: ['controlled source'], limits: 'No real allegation', publicDisclosureConfirmed: true } });
            assert.ok((await client.getBlock({ blockNumber: opened.blockNumber })).timestamp < end);
            await stopAt(noResolution, 'resolutionEnd', 2200000000n, 2200000000n);
            const limit = await create(1, 'Evidence-version-limit'); await advance(limit, 0);
            for (let version = 1; version <= 3; version++) {
              const packageVersion = await evidence(limit, 0); assert.equal(packageVersion.ref.version, String(version));
              await assess(limit, packageVersion, 'INCONCLUSIVE');
              await verify(limit, version === 3 ? 'STOPPED' : 'SUPPLEMENT_DUE', { advanced: 2200000000n, custody: 0 });
            }
            await request(organizer, 'POST', `/v1/advance/campaigns/${limit.id}/stages/0/evidence/freeze`, { expectedRevision: 1 }, 409);
            const limited = await verify(limit, 'STOPPED', { basePool: 0 });
            report.journeys.push({ label: limit.label, campaignId: limit.chainId, metadataId: limit.id, snapshot: limited.snapshot });
            check('Third inconclusive submission stops at MAX_VERSIONS; no fourth package or extra advance');
            const unused = await create(1, 'Final-acceptance-unused'); await advance(unused, 0);
            const unusedE = await evidence(unused, 0); await assess(unused, unusedE, 'MET', '2150000000');
            await warpTo((await ownerView(unused)).workflow.deadlines.challengeEnd);
            await prepare(unused, donorA, 'FINALIZE_STAGE', { evidenceRef: unusedE.ref }, 409);
            await action(unused, organizer, 'RETURN_FUNDS', { stage: '0', amount: '50000000' }); expectedCustody += 50000000n;
            await action(unused, donorA, 'FINALIZE_STAGE', { evidenceRef: unusedE.ref });
            const done = await verify(unused, 'COMPLETED', { advanced: 2200000000n, returned: 50000000n, basePool: 50000000n, custody: 50000000n });
            report.journeys.push({ label: unused.label, campaignId: unused.chainId, metadataId: unused.id, snapshot: done.snapshot });
            check('MET with unused50 cannot finalize until real return; COMPLETED retains refundable base50');
          }
          assert.equal(await balance(manifest.contractAddress), initialEscrow + expectedCustody);
          report.tokenCustody = { before: initialEscrow.toString(), after: (await balance(manifest.contractAddress)).toString(), expectedDelta: expectedCustody.toString() };
        } finally {
          for (const id of objects) await storage.remove(id);
          await app.close();
        }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await countRows(), beforeRows);
    assert.equal(await source.read('nextCampaignId', []), sourceCount);
    assert.equal((await source.client.getBlock({ blockNumber: sourceHead.number })).hash, sourceHead.hash);
    check('B source campaign count/block preserved; database outer transaction rolled back; only test-uploaded objects removed');
    report.result = 'PASS';
  } finally {
    await pool.end(); await fork.stop();
  }
  atomicWrite(path.join(root, `.local/workflow-b/${process.argv.includes('--waiting') ? 'waiting-journey-report' : process.argv.includes('--failures') ? 'failure-journey-report' : 'journey-report'}.json`), report);
  console.log(`Workflow B HTTP journey PASS: ${report.journeys.length} recorded outcomes, ${report.receipts.length} receipts, ${report.assertions.length} assertions; isolated fork stopped`);
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { startFork };
