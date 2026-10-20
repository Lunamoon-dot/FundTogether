// Local-only VNext browser acceptance. It uses Anvil's unlocked test wallets,
// real SIWE, the real Nest API, the real Vite app and the real indexer.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Client } = require('pg');
const { PDFDocument } = require('pdf-lib');
const { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, getAddress, http, keccak256, toHex } = require('viem');
const { SiweMessage } = require('siwe');
const { loadPolicy, resolvePass } = require('./vnext-acceptance.cjs');

const root = path.resolve(__dirname, '../../..');
const envFile = path.join(root, '.local/fundtogether/backend.env');
const env = require('dotenv').parse(fs.readFileSync(envFile));
const { migrateCampaignDatabase } = require('./migrate-isolated.cjs');
const manifestPath = process.env.FUNDTOGETHER_VNEXT_MANIFEST_PATH
  || path.join(root, '.local/fundtogether/generated/vnext-deployment.local.json');
const webOrigin = 'http://127.0.0.1:5187';
const chain = defineChain({
  id: 31339,
  name: 'FundTogether VNext browser test',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:9548'] } },
});
const rpcUrl = 'http://127.0.0.1:9548';
const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });
const wallet = account => createWalletClient({ account, chain, transport: http(rpcUrl) });
const campaignArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/CampaignEscrowVNext.sol/CampaignEscrowVNext.json')));
const registryArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/JuryRegistry.sol/JuryRegistry.json')));
const reviewArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/JuryReview.sol/JuryReview.json')));
const tokenArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/MockUSDC.sol/MockUSDC.json')));
const databaseName = `fundtogether_vnext_browser_${process.pid}`;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let admin;
let app;
let db;
let vite;
let browser;

async function sendDirect(account, request) {
  const hash = await wallet(account).writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  assert.equal(receipt.status, 'success', `VNext direct transaction reverted: ${request.functionName}`);
  return receipt;
}

async function advanceChain(seconds) {
  await client.request({ method: 'evm_increaseTime', params: [seconds] });
  await client.request({ method: 'evm_mine' });
}

function voteCommitment({ campaignId, milestoneId, evidenceRevision, caseNumber, roundId, courtId, judge, vote, salt, protocolVersion }) {
  return keccak256(encodeAbiParameters([
    { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
    { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
    { type: 'address' }, { type: 'uint8' }, { type: 'bytes32' },
  ], [31339n, protocolVersion, campaignId, milestoneId, evidenceRevision, caseNumber, roundId, courtId, judge, vote, salt]));
}

async function waitForCanonical(context, apiUrl, transactionHash) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/transactions/${transactionHash}`);
    if (response.ok()) {
      const status = await response.json();
      if (status.state === 'ON_CHAIN_CONFIRMED') return status;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForCampaignProjection(context, apiUrl, campaignId, expectedState) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/campaigns/${campaignId}`);
    if (response.ok()) {
      const projection = await response.json();
      if (Number(projection.state) === expectedState) return projection;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForMilestoneProjection(context, apiUrl, campaignId, predicate) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/campaigns/${campaignId}/milestones`);
    if (response.ok()) {
      const milestones = await response.json();
      const milestone = milestones.find(item => String(item.milestoneId) === '0');
      if (milestone && predicate(milestone)) return milestone;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForEvidence(context, apiUrl, reviewCaseId) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/evidence`);
    if (response.ok()) {
      const evidence = await response.json();
      if (evidence.availabilityPolicy?.status === 'READY' && evidence.evidence?.some(item => item.availability === 'AVAILABLE')) return evidence;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForAssignments(context, apiUrl, reviewCaseId) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/assignments`);
    if (response.ok()) {
      const assignments = await response.json();
      if (assignments.length === 3) return assignments;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForUiReceipt(page) {
  const receiptStatus = page.getByRole('status').filter({ hasText: /Receipt on-chain đã thành công|Indexer đã xác nhận canonical/ });
  try {
    await receiptStatus.waitFor();
  } catch (error) {
    console.error(`VNext browser transaction status timeout:\n${await page.locator('body').innerText()}`);
    throw error;
  }
  const transactionText = (await receiptStatus.allTextContents()).join(' ');
  const transactionHash = transactionText.match(/0x[0-9a-fA-F]{64}/)?.[0];
  assert.ok(transactionHash, `missing transaction hash in UI status: ${transactionText}`);
  return { transactionHash, transactionText };
}

async function waitForEnabled(locator, page, label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await locator.isEnabled().catch(() => false)) return;
    await wait(1000);
  }
  throw new Error(`VNext browser ${label} stayed disabled:\n${await page.locator('body').innerText()}`);
}

async function waitForCampaignPageState(page, campaignUrl, expectedState) {
  const state = page.getByText(expectedState, { exact: true });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (page.url() === campaignUrl) await page.reload();
    else await page.goto(campaignUrl);
    if (await state.isVisible().catch(() => false)) return;
    await wait(1000);
  }
  throw new Error(`VNext browser UI did not render ${expectedState}:\n${await page.locator('body').innerText()}`);
}

async function connectWallet(page) {
  await page.goto(`${webOrigin}/#/account`);
  const connectButton = page.getByRole('button', { name: /Connect Wallet|Kết nối ví/ });
  const linkedHeading = page.getByRole('heading', { name: /Ví đã liên kết với tài khoản/ });
  try {
    await connectButton.waitFor({ state: 'visible', timeout: 5_000 });
    await connectButton.click();
    await page.getByRole('button', { name: /FundTogether VNext Test Wallet/ }).click();
  } catch (error) {
    if (!(await linkedHeading.isVisible().catch(() => false))) throw error;
  }
  await linkedHeading.waitFor();
}

async function connectWalletOnCampaignPage(page, campaignUrl, expectedState) {
  await waitForCampaignPageState(page, campaignUrl, expectedState);
  await connectWallet(page);
  await page.goto(campaignUrl);
  await page.getByText(expectedState, { exact: true }).waitFor();
}

async function prepareThreeJudgeCourt({ accounts, manifest, campaignId, milestoneId, evidenceRevision, reviewCaseId }) {
  const policy = loadPolicy();
  const requiredStake = await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'requiredCaseStake', args: [reviewCaseId] });
  for (const judge of accounts.slice(3, 6)) {
    await sendDirect(judge, { address: manifest.juryRegistry, abi: registryArtifact.abi, functionName: 'reserveCaseStake', args: [reviewCaseId, requiredStake] });
    await sendDirect(judge, { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'enroll', args: [reviewCaseId] });
  }
  await advanceChain(policy.judgeEnrollmentWindowSeconds + 1);
  await sendDirect(accounts[0], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeSnapshot', args: [reviewCaseId] });
  await sendDirect(accounts[0], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'assignCourt', args: [reviewCaseId, 0n] });
  const caseNumber = await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'caseNumber', args: [reviewCaseId] });
  const roundId = await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'reviewRound', args: [reviewCaseId] });
  const protocolVersion = await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'protocolVersion' });
  const courtJudges = [];
  for (let slot = 0; slot < 3; slot++) {
    courtJudges.push((await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'courtJudge', args: [reviewCaseId, 0n, BigInt(slot)] })).toLowerCase());
  }
  assert.equal(new Set(courtJudges).size, 3, 'browser milestone court must have three unique Judges');
  assert.ok(courtJudges.every(judge => accounts.slice(3, 6).includes(judge)), 'browser milestone court must use the enrolled Judges');
  return { policy, requiredStake, caseNumber, roundId, protocolVersion, courtJudges };
}

async function openJudgePage({ browser, account, apiUrl, reviewCaseId }) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await context.addInitScript(providerScript(getAddress(account)), { account: getAddress(account), rpcUrl });
  await login(context, apiUrl, getAddress(account));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await connectWallet(page);
  await page.goto(`${webOrigin}/#/campaigns/vnext/judge`);
  await page.getByRole('heading', { name: 'Judge workspace' }).waitFor();
  const caseCard = page.locator(`article[data-vnext-judge-case="${reviewCaseId}"]`);
  await caseCard.getByRole('heading', { name: `Case ${reviewCaseId}` }).waitFor();
  return { context, page, caseCard };
}

function providerScript(account) {
  return ({ account, rpcUrl }) => {
    const listeners = new Map();
    const provider = {
      isMetaMask: true,
      on(name, listener) {
        const current = listeners.get(name) || [];
        listeners.set(name, [...current, listener]);
      },
      removeListener(name, listener) {
        listeners.set(name, (listeners.get(name) || []).filter(item => item !== listener));
      },
      async request({ method, params = [] }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'wallet_switchEthereumChain') {
          if (params[0]?.chainId !== '0x7a6b') throw new Error('VNext browser test requires chain 31339');
          return null;
        }
        if (method === 'wallet_getCapabilities') return {};
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const result = await response.json();
        if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
        return result.result;
      },
    };
    const info = {
      uuid: 'f3ce5b40-8d44-4a17-9be4-7b08f873f6b6',
      name: 'FundTogether VNext Test Wallet',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      rdns: 'test.fundtogether.vnext',
    };
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  };
}

async function login(context, apiUrl, account) {
  const challengeResponse = await context.request.get(`${apiUrl}/auth/nonce`, { headers: { Origin: webOrigin } });
  assert.equal(challengeResponse.status(), 200, await challengeResponse.text());
  const challenge = await challengeResponse.json();
  const message = new SiweMessage({
    scheme: 'http',
    domain: challenge.domain,
    address: account,
    statement: 'Sign in to FundTogether.',
    uri: challenge.uri,
    version: '1',
    chainId: challenge.chainId,
    nonce: challenge.nonce,
  }).prepareMessage();
  const signature = await wallet(account).signMessage({ message });
  const localVerification = await new SiweMessage(message).verify({
    signature,
    nonce: challenge.nonce,
    domain: challenge.domain,
    scheme: 'http',
  }, { suppressExceptions: true });
  assert.equal(localVerification.success, true, JSON.stringify(localVerification));
  const loginResponse = await context.request.post(`${apiUrl}/auth/verify`, {
    headers: { Origin: webOrigin },
    data: { message, signature },
  });
  assert.equal(loginResponse.status(), 200, `${await loginResponse.text()}\nSIWE challenge=${JSON.stringify(challenge)}\nSIWE message=${message}`);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.protocolKind, 'FUNDTOGETHER_VNEXT');
  assert.equal(manifest.chainId, 31339);
  assert.equal(await client.getChainId(), 31339);
  const accounts = (await client.request({ method: 'eth_accounts' })).map(value => value.toLowerCase());
  assert.ok(accounts.length >= 9, 'VNext browser acceptance requires a deployer, Backer and six funded Judges');
  const creator = getAddress(accounts[0]);
  const backer = getAddress(accounts[1]);
  const mintHash = await wallet(accounts[0]).writeContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'mint', args: [backer, 200000000n] });
  const mintReceipt = await client.waitForTransactionReceipt({ hash: mintHash, confirmations: 1 });
  assert.equal(mintReceipt.status, 'success', 'VNext browser local Backer token mint failed');
  for (const judge of accounts.slice(3, 6)) {
    const judgeMintHash = await wallet(accounts[0]).writeContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'mint', args: [judge, 200000000n] });
    const judgeMintReceipt = await client.waitForTransactionReceipt({ hash: judgeMintHash, confirmations: 1 });
    assert.equal(judgeMintReceipt.status, 'success', `VNext browser local Judge token mint failed for ${judge}`);
    await sendDirect(judge, { address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'approve', args: [manifest.juryRegistry, 200000000n] });
    await sendDirect(judge, { address: manifest.juryRegistry, abi: registryArtifact.abi, functionName: 'depositStake', args: [100000000n] });
  }

  const database = new URL(env.DATABASE_URL);
  const adminDatabase = new Client({ connectionString: database.toString() });
  admin = adminDatabase;
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  database.pathname = `/${databaseName}`;
  const databaseUrl = database.toString();
  await migrateCampaignDatabase(root, { databaseUrl, expectedDatabaseName: databaseName });

  Object.assign(process.env, env, {
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: webOrigin,
    AUTH_DOMAIN: '127.0.0.1:5187',
    AUTH_CHAIN_ID: '31339',
    AUTH_SESSION_COOKIE_NAME: `ft_vnext_browser_${process.pid}`,
    NODE_ENV: 'development',
    FUNDTOGETHER_VNEXT_MANIFEST_PATH: manifestPath,
    FUNDTOGETHER_VNEXT_INDEXER_ENABLED: 'true',
    LOG_LEVEL: 'silent',
  });

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../dist/src/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({ origin: webOrigin, credentials: true });
  await app.listen(0, '127.0.0.1');
  db = app.get(require('../../dist/src/database/database.constants').DRIZZLE_DB);
  const apiUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

  process.env.VITE_FUNDTOGETHER_API_URL = apiUrl;
  const viteModule = await import(pathToFileURL(require.resolve('vite', { paths: [path.join(root, 'frontend')] })).href);
  vite = await viteModule.createServer({
    root: path.join(root, 'frontend'),
    mode: 'fundtogether',
    define: { 'import.meta.env.VITE_FUNDTOGETHER_API_URL': JSON.stringify(apiUrl) },
    server: { host: '127.0.0.1', port: 5187, strictPort: true },
    logLevel: 'error',
  });
  await vite.listen();

  const playwright = require(require.resolve('playwright', {
    paths: [process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli')],
  }));
  browser = await playwright.chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await context.addInitScript(providerScript(creator), { account: creator, rpcUrl });
  await login(context, apiUrl, creator);

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await connectWallet(page);

  await page.goto(`${webOrigin}/#/campaigns/vnext`);
  await page.getByRole('heading', { name: 'Tạo Campaign VNext' }).waitFor();
  await page.getByLabel('Payout wallet').fill(creator);
  await page.getByLabel(/Funding goal/).fill('100000000');
  await page.getByLabel(/Milestone acceptance criteria hash/).fill(`0x${'1'.repeat(64)}`);
  await page.getByLabel(/Publication evidence hash/).fill(`0x${'2'.repeat(64)}`);
  await page.getByRole('button', { name: 'Tạo campaign và mở Judge case' }).click();
  const { transactionHash } = await waitForUiReceipt(page);
  const canonicalStatus = await waitForCanonical(context, apiUrl, transactionHash);
  assert.equal(canonicalStatus?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm the browser transaction');

  const campaignCount = await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignCount' });
  const campaignId = (BigInt(campaignCount) - 1n).toString();
  await page.goto(`${webOrigin}/#/campaigns/vnext/${campaignId}`);
  await page.getByText('CANONICAL PROJECTION', { exact: true }).waitFor();
  await page.getByText('CREATED', { exact: true }).waitFor();
  assert.ok(!requests.some(url => url.includes('/v1/fundtogether/public/campaigns/vnext')));

  const publicationCaseId = await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'publicationReviewCase', args: [BigInt(campaignId)] });
  const judgeWallets = Object.fromEntries(accounts.map(address => [address, wallet(address)]));
  await resolvePass({
    client,
    wallets: judgeWallets,
    addresses: { deployer: accounts[0], judges: accounts.slice(3, 6) },
    manifest,
    policy: loadPolicy(),
    campaignId: BigInt(campaignId),
    milestoneId: 2n ** 256n - 1n,
    evidenceRevision: 1n,
    caseId: publicationCaseId,
  });

  const publicationHash = await wallet(creator).writeContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizePublication', args: [BigInt(campaignId)] });
  const publicationReceipt = await client.waitForTransactionReceipt({ hash: publicationHash, confirmations: 1 });
  assert.equal(publicationReceipt.status, 'success', 'VNext direct publication finalization reverted');
  const fundingProjection = await waitForCampaignProjection(context, apiUrl, campaignId, 1);
  assert.equal(Number(fundingProjection?.state), 1, 'VNext indexer did not project FUNDING after publication finalization');
  const campaignUrl = `${webOrigin}/#/campaigns/vnext/${campaignId}`;
  await waitForCampaignPageState(page, campaignUrl, 'FUNDING');

  const backerContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await backerContext.addInitScript(providerScript(backer), { account: backer, rpcUrl });
  await login(backerContext, apiUrl, backer);
  const backerPage = await backerContext.newPage();
  backerPage.setDefaultTimeout(30_000);
  await connectWalletOnCampaignPage(backerPage, campaignUrl, 'FUNDING');
  await backerPage.getByLabel(/Góp vốn/).fill('100000000');
  await backerPage.getByRole('button', { name: 'Approve MockUSDC', exact: true }).click();
  await waitForUiReceipt(backerPage);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'allowance', args: [backer, manifest.campaignEscrow] }), 100000000n);
  await backerPage.getByRole('button', { name: 'Góp vốn', exact: true }).click();
  const contributionTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, contributionTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm Backer contribution');
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignRaised', args: [BigInt(campaignId)] }), 100000000n);

  await client.request({ method: 'evm_increaseTime', params: [7 * 24 * 60 * 60 + 1] });
  await client.request({ method: 'evm_mine' });
  await connectWalletOnCampaignPage(backerPage, campaignUrl, 'FUNDING');
  await backerPage.getByRole('button', { name: 'Chốt funding sau deadline', exact: true }).click();
  const fundingTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, fundingTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm funding finalization');
  assert.equal(Number((await waitForCampaignProjection(backerContext, apiUrl, campaignId, 3))?.state), 3, 'VNext indexer did not project MILESTONES_RUNNING after funding finalization');
  assert.equal(Number(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignState', args: [BigInt(campaignId)] })), 3);
  await waitForCampaignPageState(backerPage, campaignUrl, 'MILESTONES_RUNNING');

  const evidenceDocument = await PDFDocument.create();
  const evidencePage = evidenceDocument.addPage([300, 180]);
  evidencePage.drawText('FundTogether VNext milestone evidence');
  const evidenceBuffer = Buffer.from(await evidenceDocument.save());
  const milestoneEvidenceHash = `0x${createHash('sha256').update(evidenceBuffer).digest('hex')}`;
  await waitForCampaignPageState(page, campaignUrl, 'MILESTONES_RUNNING');
  await connectWallet(page);
  await page.goto(campaignUrl);
  const evidenceHashInput = page.getByLabel('Evidence hash cho milestone 0');
  try {
    await evidenceHashInput.waitFor({ state: 'visible', timeout: 5_000 });
  } catch (error) {
    const milestoneDebug = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/campaigns/${campaignId}/milestones`);
    console.error(`VNext browser milestone action missing. API=${await milestoneDebug.text()}\nUI=${await page.locator('body').innerText()}`);
    throw error;
  }
  await evidenceHashInput.fill(milestoneEvidenceHash);
  await page.getByRole('button', { name: 'Submit evidence revision', exact: true }).click();
  const milestoneEvidenceTransaction = await waitForUiReceipt(page);
  assert.equal((await waitForCanonical(context, apiUrl, milestoneEvidenceTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm milestone evidence submission');
  const milestoneProjection = await waitForMilestoneProjection(context, apiUrl, campaignId, item => item.reviewCaseId && Number(item.state) === 2);
  assert.ok(milestoneProjection?.reviewCaseId, 'VNext indexer did not project the milestone review case');
  const milestoneCaseId = milestoneProjection.reviewCaseId;
  const evidencePanel = page.locator(`section[data-vnext-evidence-case="${milestoneCaseId}"]`);
  await evidencePanel.getByLabel('Evidence summary').fill('Browser acceptance milestone evidence');
  await evidencePanel.locator('input[type="file"]').setInputFiles({ name: 'milestone.pdf', mimeType: 'application/pdf', buffer: evidenceBuffer });
  await evidencePanel.getByRole('button', { name: 'Upload private evidence', exact: true }).click();
  const evidenceStatus = await waitForEvidence(context, apiUrl, milestoneCaseId);
  if (!evidenceStatus) {
    const evidenceDebug = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(milestoneCaseId)}/evidence`);
    console.error(`VNext evidence did not become READY: ${await evidenceDebug.text()}\nUI=${await page.locator('body').innerText()}`);
  }
  assert.equal(evidenceStatus?.availabilityPolicy?.status, 'READY', 'VNext evidence did not become READY');

  const court = await prepareThreeJudgeCourt({ accounts, manifest, reviewCaseId: milestoneCaseId });
  const assignments = await waitForAssignments(context, apiUrl, milestoneCaseId);
  assert.equal(assignments?.length, 3, 'VNext browser milestone assignments were not indexed');
  const judgePages = [];
  for (const judge of court.courtJudges) {
    const opened = await openJudgePage({ browser, account: judge, apiUrl, reviewCaseId: milestoneCaseId });
    const salt = `0x${createHash('sha256').update(`browser-milestone:${campaignId}:${judge}`).digest('hex')}`;
    await opened.caseCard.getByLabel('Salt bytes32').fill(salt);
    const commitButton = opened.caseCard.getByRole('button', { name: 'Commit vote', exact: true });
    try {
      await waitForEnabled(commitButton, opened.page, `Judge commit for ${judge}`);
    } catch (error) {
      const judgeEvidenceDebug = await opened.context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(milestoneCaseId)}/evidence`);
      console.error(`Judge evidence debug for ${judge}: ${await judgeEvidenceDebug.text()}`);
      throw error;
    }
    await commitButton.click();
    const commitTransaction = await waitForUiReceipt(opened.page);
    assert.equal((await waitForCanonical(opened.context, apiUrl, commitTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', `VNext Judge commit was not canonical for ${judge}`);
    judgePages.push({ ...opened, judge, salt });
  }

  await advanceChain(court.policy.commitWindowSeconds + 1);
  for (const judgePage of judgePages) {
    await judgePage.page.reload();
    await connectWallet(judgePage.page);
    await judgePage.page.goto(`${webOrigin}/#/campaigns/vnext/judge`);
    await judgePage.caseCard.getByRole('heading', { name: `Case ${milestoneCaseId}` }).waitFor();
    await judgePage.caseCard.getByLabel('Salt bytes32').fill(judgePage.salt);
    const revealButton = judgePage.caseCard.getByRole('button', { name: 'Reveal vote', exact: true });
    await waitForEnabled(revealButton, judgePage.page, `Judge reveal for ${judgePage.judge}`);
    await revealButton.click();
    const revealTransaction = await waitForUiReceipt(judgePage.page);
    assert.equal((await waitForCanonical(judgePage.context, apiUrl, revealTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', `VNext Judge reveal was not canonical for ${judgePage.judge}`);
  }

  await advanceChain(court.policy.revealWindowSeconds + 1);
  const finalizingJudge = judgePages[0];
  await finalizingJudge.page.reload();
  await connectWallet(finalizingJudge.page);
  await finalizingJudge.page.goto(`${webOrigin}/#/campaigns/vnext/judge`);
  await finalizingJudge.caseCard.getByRole('heading', { name: `Case ${milestoneCaseId}` }).waitFor();
  await finalizingJudge.caseCard.getByRole('button', { name: 'Finalize court', exact: true }).click();
  const finalCourtTransaction = await waitForUiReceipt(finalizingJudge.page);
  assert.equal((await waitForCanonical(finalizingJudge.context, apiUrl, finalCourtTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext Judge court finalization was not canonical');

  await advanceChain(court.policy.appealWindowSeconds + 1);
  await sendDirect(accounts[0], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeNoAppeal', args: [milestoneCaseId] });
  for (let attempt = 0; attempt < 64; attempt++) {
    if (await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'settlementComplete', args: [milestoneCaseId] })) break;
    await sendDirect(accounts[0], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'settleFinalRuling', args: [milestoneCaseId, 32n] });
  }
  assert.equal(await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'settlementComplete', args: [milestoneCaseId] }), true, 'VNext milestone settlement did not complete');

  await connectWalletOnCampaignPage(page, campaignUrl, 'MILESTONES_RUNNING');
  await page.getByRole('button', { name: 'Sync final ruling', exact: true }).click();
  const syncTransaction = await waitForUiReceipt(page);
  assert.equal((await waitForCanonical(context, apiUrl, syncTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext milestone final ruling sync was not canonical');
  assert.equal(Number((await waitForMilestoneProjection(context, apiUrl, campaignId, item => Number(item.state) === 9))?.state), 9, 'VNext indexer did not project the challenge window');

  await advanceChain(court.policy.challengeWindowSeconds + 1);
  await connectWalletOnCampaignPage(page, campaignUrl, 'MILESTONES_RUNNING');
  await page.getByRole('button', { name: 'Payout milestone 0', exact: true }).click();
  const payoutTransaction = await waitForUiReceipt(page);
  assert.equal((await waitForCanonical(context, apiUrl, payoutTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext payout was not canonical');
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignPaidOut', args: [BigInt(campaignId)] }), 100000000n);
  assert.equal(Number(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignState', args: [BigInt(campaignId)] })), 4);
  assert.equal(Number((await waitForCampaignProjection(context, apiUrl, campaignId, 4))?.state), 4, 'VNext indexer did not project COMPLETED after payout');

  await connectWallet(page);
  await page.goto(`${webOrigin}/#/campaigns/vnext`);
  await page.getByRole('heading', { name: 'Tạo Campaign VNext' }).waitFor();
  await page.getByLabel('Payout wallet').fill(creator);
  await page.getByLabel(/Funding goal/).fill('100000000');
  await page.getByLabel(/Milestone acceptance criteria hash/).fill(`0x${'3'.repeat(64)}`);
  await page.getByLabel(/Publication evidence hash/).fill(`0x${'4'.repeat(64)}`);
  await page.getByRole('button', { name: 'Tạo campaign và mở Judge case' }).click();
  const refundCreateTransaction = await waitForUiReceipt(page);
  assert.equal((await waitForCanonical(context, apiUrl, refundCreateTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund campaign creation was not canonical');
  const refundCampaignId = (BigInt(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignCount' })) - 1n).toString();
  const refundPublicationCaseId = await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'publicationReviewCase', args: [BigInt(refundCampaignId)] });
  await resolvePass({ client, wallets: judgeWallets, addresses: { deployer: accounts[0], judges: accounts.slice(3, 6) }, manifest, policy: loadPolicy(), campaignId: BigInt(refundCampaignId), milestoneId: 2n ** 256n - 1n, evidenceRevision: 1n, caseId: refundPublicationCaseId });
  await sendDirect(accounts[0], { address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'finalizePublication', args: [BigInt(refundCampaignId)] });
  assert.equal(Number((await waitForCampaignProjection(context, apiUrl, refundCampaignId, 1))?.state), 1, 'VNext refund campaign did not enter FUNDING');
  const refundCampaignUrl = `${webOrigin}/#/campaigns/vnext/${refundCampaignId}`;
  await connectWalletOnCampaignPage(backerPage, refundCampaignUrl, 'FUNDING');
  await backerPage.getByLabel(/Góp vốn/).fill('50000000');
  await backerPage.getByRole('button', { name: 'Approve MockUSDC', exact: true }).click();
  await waitForUiReceipt(backerPage);
  await backerPage.getByRole('button', { name: 'Góp vốn', exact: true }).click();
  const refundContributionTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, refundContributionTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund contribution was not canonical');
  await advanceChain(7 * 24 * 60 * 60 + 1);
  await connectWalletOnCampaignPage(backerPage, refundCampaignUrl, 'FUNDING');
  await backerPage.getByRole('button', { name: 'Chốt funding sau deadline', exact: true }).click();
  const refundOpenTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, refundOpenTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund opening was not canonical');
  assert.equal(Number((await waitForCampaignProjection(backerContext, apiUrl, refundCampaignId, 5))?.state), 5, 'VNext indexer did not project REFUNDING');
  const balanceBeforeRefund = await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer] });
  await connectWalletOnCampaignPage(backerPage, refundCampaignUrl, 'REFUNDING');
  await backerPage.getByRole('button', { name: 'Chuẩn bị entitlement refund', exact: true }).click();
  const freezeTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, freezeTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund allocation freeze was not canonical');
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'refundAllocationsFrozen', args: [BigInt(refundCampaignId)] }), true);
  await connectWalletOnCampaignPage(backerPage, refundCampaignUrl, 'REFUNDING');
  await backerPage.getByRole('button', { name: 'Claim refund', exact: true }).click();
  const claimTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, claimTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund claim was not canonical');
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer] }), balanceBeforeRefund + 50000000n);

  console.log(JSON.stringify({ status: 'PASS', protocolKind: manifest.protocolKind, chainId: manifest.chainId, campaignId, backerContribution: '100000000', finalState: 'COMPLETED', payout: '100000000', refundCampaignId, refundContribution: '50000000', refundClaimed: '50000000' }, null, 2));
} 

async function cleanup() {
  await browser?.close().catch(() => undefined);
  await vite?.close().catch(() => undefined);
  await db?.$client.end().catch(() => undefined);
  await app?.close().catch(() => undefined);
  if (admin) {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }).finally(cleanup);
}

module.exports = { main, providerScript };
