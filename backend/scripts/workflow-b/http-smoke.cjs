const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { createWalletClient, getAddress, http, parseEther } = require('viem');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { SiweMessage } = require('siwe');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { guardEnvironment } = require('./guard-environment.cjs');
const { giftPlan } = require('./pilot-fixtures.cjs');
const { atomicWrite } = require('./generate-artifacts.cjs');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.local/workflow-b/backend.env'), quiet: true });
process.env.INDEXER_ENABLED = 'false'; process.env.LOG_LEVEL = 'silent';

async function main() {
  guardEnvironment(process.env);
  const from = file => require(path.join(root, 'backend/dist/src', file));
  const api = from('advance/advance-api.schema');
  const { AdvanceAppModule } = from('advance/advance-app.module');
  const { AdvanceBlockchainService } = from('advance/advance-blockchain.service');
  const { AdvanceIndexerService } = from('advance/advance-indexer.service');
  const app = await NestFactory.create(AdvanceAppModule, { logger: false, abortOnError: false });
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  try {
    const doc = from('advance/advance-openapi').completeAdvanceOpenApi(SwaggerModule.createDocument(app,
      new DocumentBuilder().setTitle('FundTogether Workflow B API').setVersion('0.2.0').build()));
    assert.ok(doc.paths['/v1/advance/campaigns/{id}/actions/prepare'].post.requestBody);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(), chain = app.get(AdvanceBlockchainService), indexer = app.get(AdvanceIndexerService);
    for (let i = 0; i < 50; i++) { await indexer.runOnce(); if ((await indexer.status()).status === 'ready') break; }
    let cookie = '';
    const statuses = [];
    async function request(method, route, body, expected = 200, overrides = {}) {
      const headers = { Origin: process.env.WEB_ORIGIN, ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...overrides };
      const response = await fetch(base + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await response.text(), data = text ? JSON.parse(text) : null;
      assert.equal(response.status, expected, `${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
      statuses.push({ method, route, status: response.status });
      return { response, data };
    }
    await request('GET', '/v1/advance/refunds', undefined, 401);
    const health = (await request('GET', '/health')).data;
    assert.equal(health.context.protocolKind, 'ADVANCE'); assert.equal(health.status, 'ready');
    api.advancePublicListSchema.parse((await request('GET', '/v1/advance/public/campaigns')).data);
    const pilot = JSON.parse(fs.readFileSync(path.join(root, '.local/workflow-b/review-evidence-report.json'), 'utf8'));
    api.advancePublicDetailSchema.parse((await request('GET', `/v1/advance/public/campaigns/${pilot.campaignId}`)).data);
    const eventPage = api.advanceEventsSchema.parse((await request('GET', `/v1/advance/public/campaigns/${pilot.campaignId}/events`)).data);
    assert.ok(eventPage.events.some(e => e.eventName === 'AdvanceClaimed'));
    assert.ok(eventPage.events.every(e => e.args.campaignId === pilot.campaignId));
    await request('GET', `/v1/advance/evidence-packages/${pilot.packageId}/original`, undefined, 401);
    await request('GET', `/v1/advance/evidence-packages/${pilot.packageId}/redacted`, undefined, 401);
    const publicManifest = await request('GET', `/v1/advance/public/evidence/${pilot.publicHash}`);
    assert.equal(publicManifest.response.headers.get('cache-control'), 'no-store');
    const record = (await request('GET', `/v1/advance/public/records/${pilot.decisionHash}`)).data;
    assert.equal(from('advance/advance-plan').sha256(record.recordBytes), pilot.decisionHash);
    const resolverWallet = createWalletClient({ account: chain.context.resolver, chain: chain.client.chain, transport: http(chain.deployment.rpcUrl) });
    const resolverNonce = (await request('GET', '/auth/nonce')).data;
    const resolverMessage = new SiweMessage({ scheme: 'http', domain: resolverNonce.domain, uri: resolverNonce.uri, address: getAddress(chain.context.resolver),
      version: '1', chainId: resolverNonce.chainId, nonce: resolverNonce.nonce, issuedAt: new Date().toISOString(), statement: 'Read-only synthetic B publication authorization check' }).prepareMessage();
    const resolverSession = await request('POST', '/auth/verify', { message: resolverMessage, signature: await resolverWallet.signMessage({ message: resolverMessage }) });
    const resolverCookie = resolverSession.response.headers.get('set-cookie').split(';')[0];
    const publication = await request('GET', `/v1/advance/evidence-packages/${pilot.packageId}/redacted`, undefined, 200, { Cookie: resolverCookie });
    api.advancePublicationSchema.parse(publication.data);
    assert.equal(publication.data.hash, pilot.publicHash);
    assert.equal(from('advance/advance-plan').sha256(publication.data.manifestBytes), pilot.publicHash);
    assert.equal(publication.response.headers.get('cache-control'), 'private, no-store');
    const resolverView = api.advanceOwnerWorkflowSchema.parse((await request('GET', `/v1/advance/campaigns/${pilot.metadataId}/workflow`, undefined, 200, { Cookie: resolverCookie })).data);
    assert.equal(resolverView.reviewAccess.canSign, true);
    const history = (await request('GET', `/v1/advance/internal/organizations/${resolverView.organizationId}/verifications`, undefined, 200, { Cookie: resolverCookie })).data;
    assert.ok(history.length > 0);
    await request('GET', '/v1/advance/internal/organizations', undefined, 403, { Cookie: resolverCookie });
    await request('POST', '/auth/register', { email: `bad-origin-${randomUUID()}@workflow-b.invalid`, password: randomBytes(18).toString('hex') }, 403, { Origin: 'http://localhost:5173' });
    const session = await request('POST', '/auth/register', { email: `http-${randomUUID()}@workflow-b.invalid`, password: randomBytes(18).toString('hex') }, 201);
    cookie = session.response.headers.get('set-cookie').split(';')[0];
    assert.ok(cookie.startsWith('ft_workflow_b_session='));
    await request('GET', '/auth/session', undefined, 401, { Cookie: cookie.replace('ft_workflow_b_session=', 'ft_session=') });
    await request('GET', '/auth/session', undefined, 200, { Cookie: `ft_session=unrelated; ${cookie}` });
    await request('GET', `/v1/advance/evidence-packages/${pilot.packageId}/original`, undefined, 403);
    await request('GET', `/v1/advance/evidence-packages/${pilot.packageId}/redacted`, undefined, 403);
    await request('GET', '/v1/advance/internal/reviews', undefined, 403);
    await request('GET', '/v1/advance/internal/organizations', undefined, 403);
    await request('GET', `/v1/advance/internal/organizations/${resolverView.organizationId}/verifications`, undefined, 403);
    const signer = privateKeyToAccount(generatePrivateKey());
    const wallet = createWalletClient({ account: signer, chain: chain.client.chain, transport: http(chain.deployment.rpcUrl) });
    const nonce = (await request('POST', '/auth/wallets/nonce', {}, 200)).data;
    const message = new SiweMessage({ scheme: 'http', domain: nonce.domain, uri: nonce.uri, address: signer.address,
      version: '1', chainId: nonce.chainId, nonce: nonce.nonce, issuedAt: new Date().toISOString(), statement: 'Synthetic B HTTP test wallet' }).prepareMessage();
    await request('POST', '/auth/wallets/link', { message, signature: await signer.signMessage({ message }) }, 200);
    const org = (await request('POST', '/organizations', { name: 'Synthetic B HTTP organization', description: 'Only for HTTP contract verification' }, 201)).data;
    await request('PUT', `/organizations/${org.id}/wallet`, { address: signer.address, chainId: 31338 });
    const draft = api.advanceDraftSchema.parse((await request('POST', `/v1/advance/organizations/${org.id}/campaigns`, giftPlan(), 201)).data);
    api.advanceDraftListSchema.parse((await request('GET', `/v1/advance/organizations/${org.id}/campaigns`)).data);
    const frozen = api.advanceSubmissionPlanSchema.parse((await request('POST', `/v1/advance/campaigns/${draft.id}/submission`, { expectedRevision: draft.revision }, 201)).data);
    let view = api.advanceOwnerWorkflowSchema.parse((await request('GET', `/v1/advance/campaigns/${draft.id}/workflow`)).data);
    assert.equal(view.snapshot, null);
    await request('GET', `/v1/advance/campaigns/${draft.id}/workflow`, undefined, 403, { Cookie: resolverCookie });
    const reviewQueue = (await request('GET', '/v1/advance/internal/reviews', undefined, 200, { Cookie: resolverCookie })).data;
    assert.equal(reviewQueue.some(item => item.id === draft.id), false, 'Unsubmitted private drafts must stay outside reviewer queue');
    const input = { action: 'SUBMIT_CAMPAIGN', context: view.plan.context, actorWallet: signer.address, expectedPlanHash: frozen.planHash,
      expectedCheckpoint: view.checkpoint, expectedState: 'UNSUBMITTED', expectedCurrentStage: '0' };
    const route = `/v1/advance/campaigns/${draft.id}/actions/prepare`;
    await request('POST', route, { ...input, context: { ...input.context, chainId: 31337 } }, 400);
    await request('POST', route, { ...input, context: { ...input.context, deploymentId: `0x${'3'.repeat(64)}` } }, 409);
    await request('POST', route, { ...input, actorWallet: chain.context.resolver }, 403);
    await request('POST', route, { ...input, expectedCheckpoint: { ...input.expectedCheckpoint, blockHash: `0x${'4'.repeat(64)}` } }, 409);
    await request('POST', route, { ...input, expectedPlanHash: `0x${'5'.repeat(64)}` }, 409);
    const prepared = api.advanceActionPreparationSchema.parse((await request('POST', route, input, 201)).data);
    assert.equal(prepared.functionName, 'submitCampaignForDraft');
    assert.equal((await chain.read('campaignForDraft', [frozen.organizer, frozen.draftKey])).toString(), '0');
    const accounts = await chain.client.request({ method: 'eth_accounts' });
    const funder = createWalletClient({ account: accounts[0], chain: chain.client.chain, transport: http(chain.deployment.rpcUrl) });
    const gasHash = await funder.sendTransaction({ to: signer.address, value: parseEther('1') });
    assert.equal((await chain.client.waitForTransactionReceipt({ hash: gasHash })).status, 'success');
    const txHash = await wallet.writeContract({ address: prepared.contractAddress, abi: chain.abi, functionName: prepared.functionName,
      args: [frozen.draftKey, frozen.planHash, BigInt(frozen.fundingDuration), frozen.budgets.map(BigInt), frozen.criteriaHashes] });
    const receipt = await chain.client.waitForTransactionReceipt({ hash: txHash }); assert.equal(receipt.status, 'success');
    await request('GET', '/v1/advance/public/campaigns', undefined, 503);
    await indexer.runOnce();
    view = api.advanceOwnerWorkflowSchema.parse((await request('GET', `/v1/advance/campaigns/${draft.id}/workflow`)).data);
    assert.equal(view.workflow.state, 'DRAFT'); assert.equal(view.indexer.status, 'ready');
    assert.equal(view.reviewAccess.canSign, false);
    assert.match(view.reviewAccess.blockedReason, /OWNER/);
    await request('POST', route, input, 409);
    const cancellation = { ...input, action: 'CANCEL_CAMPAIGN', expectedState: 'DRAFT', expectedCheckpoint: view.checkpoint };
    const cancel = api.advanceActionPreparationSchema.parse((await request('POST', route, cancellation, 201)).data);
    const cancelHash = await wallet.writeContract({ address: cancel.contractAddress, abi: chain.abi, functionName: cancel.functionName,
      args: [BigInt(view.workflow.campaignId), frozen.planHash] });
    assert.equal((await chain.client.waitForTransactionReceipt({ hash: cancelHash })).status, 'success');
    await indexer.runOnce();
    const terminal = api.advanceOwnerWorkflowSchema.parse((await request('GET', `/v1/advance/campaigns/${draft.id}/workflow`)).data);
    assert.equal(terminal.workflow.state, 'STOPPED'); assert.equal(terminal.workflow.custody, '0');
    api.advanceRefundsSchema.parse((await request('GET', '/v1/advance/refunds')).data);
    // Grant only this newly created synthetic account its staff fixture role in B.
    const db = app.get(from('database/database.constants').DRIZZLE_DB), schema = from('database/schema');
    await db.insert(schema.platformRoles).values({ userId: session.data.userId, roles: ['ADMIN'] })
      .onConflictDoUpdate({ target: schema.platformRoles.userId, set: { roles: ['ADMIN'] } });
    const verificationQueue = (await request('GET', '/v1/advance/internal/organizations')).data;
    assert.ok(verificationQueue.some(item => item.id === org.id));
    await request('POST', `/v1/advance/internal/organizations/${org.id}/verifications`, { status: 'VERIFIED', summary: 'Synthetic self-review prohibition', reason: 'Test only',
      sources: [{ description: 'Synthetic', reference: 'controlled-fixture' }], scope: 'Local test', limits: 'Not real verification', validUntil: '2027-01-01T00:00:00Z' }, 403);
    const logout = await request('POST', '/auth/logout', {}, 204);
    assert.ok(logout.response.headers.get('set-cookie').startsWith('ft_workflow_b_session='));
    assert.equal(logout.response.headers.get('set-cookie').includes('ft_session='), false);
    await request('GET', '/auth/session', undefined, 401);
    atomicWrite(path.join(root, '.local/workflow-b/http-report.json'), { testedAt: new Date().toISOString(), context: chain.context,
      metadataId: draft.id, campaignId: terminal.workflow.campaignId, transactionHash: txHash, cancelHash, statuses,
      contractSchemas: 'PASS', cookieIsolation: 'PASS', checkpointStateContext: 'PASS', noManualExtension: true });
    console.log('Workflow B HTTP/auth/schema/action smoke PASS:', statuses.length, 'HTTP assertions; synthetic submit/cancel indexed');
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
