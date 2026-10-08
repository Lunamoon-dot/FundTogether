// Disposable users/wallets on local Anvil; exercises the real API, DB and escrow.
require('dotenv').config({ quiet: true });
process.env.LOG_LEVEL = 'silent';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { Pool } = require('pg');
const { SiweMessage } = require('siwe');
const { createPublicClient, createWalletClient, http, erc20Abi } = require('viem');
const { foundry } = require('viem/chains');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const { AppModule } = require('../dist/src/app.module');
const manifest = require('../src/blockchain/generated/deployment.local.json');
const abi = require('../src/blockchain/generated/fund-together.abi.json');
const tokenAbi = require('../src/blockchain/generated/mock-usdc.abi.json');
async function main() {
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const emails = [1,2].map(n => 'submission-' + randomUUID() + '-' + n + '@example.invalid');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const publicClient = createPublicClient({ chain: foundry, transport: http(manifest.rpcUrl), pollingInterval: 100 });
  const signer = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({ account: signer, chain: foundry, transport: http(manifest.rpcUrl) });
  const operator = createWalletClient({ account: manifest.resolver, chain: foundry, transport: http(manifest.rpcUrl) });
  let app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  let campaignId, organizationId, onchainId, count = 0;
  async function receipt(hash) { const r = await publicClient.waitForTransactionReceipt({ hash }); assert.equal(r.status, 'success'); count++; }
  async function write(client, functionName, args, token = false) { await receipt(await client.writeContract({ address: token ? manifest.tokenAddress : manifest.contractAddress, abi: token ? tokenAbi : abi, functionName, args })); }
  try {
    await app.listen(0, '127.0.0.1'); let base = await app.getUrl();
    async function request(path, cookie, method = 'GET', body, expected = 200) {
      const response = await fetch(base + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text(); assert.equal(response.status, expected, method + ' ' + path + ': ' + text); count++;
      return { data: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    const owner = await request('/auth/register', null, 'POST', { email: emails[0], password: randomBytes(24).toString('base64url') }, 201);
    const outsider = await request('/auth/register', null, 'POST', { email: emails[1], password: randomBytes(24).toString('base64url') }, 201);
    const { data: challenge } = await request('/auth/wallets/nonce', owner.cookie, 'POST', undefined, 200);
    const { data: session } = await request('/auth/session', owner.cookie);
    const message = new SiweMessage({ ...challenge, address: signer.address, scheme: new URL(origin).protocol.slice(0,-1), version: '1', statement: 'Link this wallet to FundTogether account ' + session.userId + '.', issuedAt: new Date().toISOString() }).prepareMessage();
    await request('/auth/wallets/link', owner.cookie, 'POST', { message, signature: await signer.signMessage({ message }) }, 200);
    const { data: organization } = await request('/organizations', owner.cookie, 'POST', { name: 'Submission test', description: 'Disposable local organization' }, 201); organizationId = organization.id;
    await request('/organizations/' + organizationId + '/wallet', owner.cookie, 'PUT', { address: signer.address, chainId: manifest.chainId });
    const input = { title: 'Submission test', description: 'Test bond custody', milestones: [1000001, 2000002].map((n,i) => ({ title: 'M' + i, description: 'Work ' + i, budgetUnits: String(n), acceptanceCriteria: [{ criterionId: 'C' + i, description: 'Result ' + i }] })) };
    const { data: campaign } = await request('/organizations/' + organizationId + '/campaigns', owner.cookie, 'POST', input, 201); campaignId = campaign.id;
    assert.equal(campaign.milestones[1].budgetUnits, '2000002');
    await request('/campaigns/' + campaignId + '/submission', outsider.cookie, 'GET', undefined, 403);
    const deadline = Number((await publicClient.getBlock()).timestamp) + 86400;
    await request('/campaigns/' + campaignId + '/submission', owner.cookie, 'POST', { expectedRevision: campaign.revision, fundingDeadline: 1 }, 400);
    await request('/campaigns/' + campaignId + '/submission', owner.cookie, 'POST', { expectedRevision: campaign.revision + 1, fundingDeadline: deadline }, 409);
    const preparation = { expectedRevision: campaign.revision, fundingDeadline: deadline };
    const { data: plan } = await request('/campaigns/' + campaignId + '/submission', owner.cookie, 'POST', preparation, 201);
    assert.equal(plan.goalUnits, '3000003'); assert.equal(plan.bondUnits, '2000002');
    const duplicate = await request('/campaigns/' + campaignId + '/submission', owner.cookie, 'POST', preparation, 201); assert.deepEqual(duplicate.data, plan);
    const oldPool = app.get(require('../dist/src/database/database.constants').DRIZZLE_DB).$client;
    await app.close(); await oldPool.end();
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
    assert.deepEqual((await request('/campaigns/' + campaignId + '/submission', owner.cookie)).data, plan);
    await request('/campaigns/' + campaignId, owner.cookie, 'PATCH', { ...input, expectedRevision: campaign.revision }, 409);
    await publicClient.request({ method: 'anvil_setBalance', params: [signer.address, '0x8AC7230489E80000'] });
    await write(wallet, 'createCampaignForDraft', [plan.draftKey, plan.title, BigInt(plan.fundingDeadline), plan.budgetUnits.map(BigInt)]);
    const read = (functionName, args) => publicClient.readContract({ address: manifest.contractAddress, abi, functionName, args });
    onchainId = (await read('campaignForDraft', [signer.address, plan.draftKey])) - 1n;
    await assert.rejects(publicClient.simulateContract({ account: signer.address, address: manifest.contractAddress, abi, functionName: 'createCampaignForDraft', args: [plan.draftKey, plan.title, BigInt(plan.fundingDeadline), plan.budgetUnits.map(BigInt)] })); count++;
    let synced = await request('/campaigns/' + campaignId + '/submission/sync', owner.cookie, 'POST', undefined, 201); assert.equal(synced.data.stage, 'created');
    for (let i=0; i<plan.criteriaHashes.length; i++) await write(wallet, 'configureMilestoneCriteria', [onchainId, BigInt(i), plan.criteriaHashes[i]]);
    await write(operator, 'mint', [signer.address, 2000002n], true);
    await write(wallet, 'approve', [manifest.contractAddress, 2000002n], true);
    await write(wallet, 'transfer', [manifest.resolver, 2000002n], true);
    await assert.rejects(publicClient.simulateContract({ account: signer.address, address: manifest.contractAddress, abi, functionName: 'lockBond', args: [onchainId] })); count++;
    synced = await request('/campaigns/' + campaignId + '/submission/sync', owner.cookie, 'POST', undefined, 201); assert.equal(synced.data.bondLocked, false); assert.equal(synced.data.stage, 'criteria_ready');
    await write(operator, 'mint', [signer.address, 4000004n], true);
    await write(wallet, 'lockBond', [onchainId]);
    await write(wallet, 'transfer', [manifest.resolver, 2000002n], true);
    const chainCampaign = await read('campaigns', [onchainId]); assert.equal(chainCampaign[5], true); assert.equal(chainCampaign[6], 2000002n);
    assert.equal(await publicClient.readContract({ address: manifest.tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [signer.address] }), 0n);
    synced = await request('/campaigns/' + campaignId + '/submission/sync', owner.cookie, 'POST', undefined, 201); assert.equal(synced.data.stage, 'bond_locked');
    const saved = await request('/campaigns/' + campaignId, owner.cookie); assert.equal(saved.data.status, 'awaiting_review');
    assert.equal(await read('campaignState', [onchainId]), 0); // Bond does not approve or publish.
    const list = await request('/organizations/' + organizationId + '/campaigns', owner.cookie); assert(list.data.some(item => item.id === campaignId));
    const reopened = await request('/campaigns/' + campaignId + '/submission', owner.cookie); assert.deepEqual(reopened.data, plan);
    console.log('PASS: ' + count + ' real API/transaction checks; freeze, authorization, retry key, criteria, exact bond, wallet-drain rejection and escrow custody.');
  } finally {
    if (onchainId !== undefined) { try { await write(wallet, 'cancelCampaign', [onchainId]); } catch {} }
    if (campaignId) { await pool.query('DELETE FROM campaign_submissions WHERE campaign_metadata_id = $1', [campaignId]); await pool.query('DELETE FROM campaign_milestone_drafts WHERE campaign_metadata_id = $1', [campaignId]); await pool.query('DELETE FROM campaign_metadata WHERE id = $1', [campaignId]); }
    if (organizationId) { await pool.query('DELETE FROM organization_members WHERE organization_id = $1', [organizationId]); await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]); }
    await pool.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
    await pool.query('DELETE FROM wallet_links WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    await app.close(); await app.get(require('../dist/src/database/database.constants').DRIZZLE_DB).$client.end(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
