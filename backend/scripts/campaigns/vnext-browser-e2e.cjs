// Local-only VNext browser acceptance. It uses Anvil's unlocked test wallets,
// real SIWE, the real Nest API, the real Vite app and the real indexer.
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const net = require('node:net');
const { Client } = require('pg');
const { PDFDocument } = require('pdf-lib');
const { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, getAddress, http, keccak256, parseEventLogs, toHex } = require('viem');
const { SiweMessage } = require('siwe');
const { loadPolicy, resolvePass } = require('./vnext-acceptance.cjs');

const root = path.resolve(__dirname, '../../..');
const envFile = process.env.FUNDTOGETHER_VNEXT_ENV_PATH
  || path.join(root, '.local/fundtogether/vnext-demo.env');
const env = require('dotenv').parse(fs.readFileSync(envFile));
const { migrateVNextDemoDatabase } = require('./migrate-isolated.cjs');
const manifestPath = process.env.FUNDTOGETHER_VNEXT_MANIFEST_PATH
  || path.join(root, '.local/fundtogether/generated/vnext-deployment.local.json');
let webOrigin;
const rpcUrl = process.env.FUNDTOGETHER_RPC_URL || env.FUNDTOGETHER_RPC_URL || 'http://127.0.0.1:9548';
const chain = defineChain({
  id: 31339,
  name: 'FundTogether VNext browser test',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100 });
const wallet = account => createWalletClient({ account, chain, transport: http(rpcUrl) });
const campaignArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/CampaignEscrowVNext.sol/CampaignEscrowVNext.json')));
const registryArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/JuryRegistry.sol/JuryRegistry.json')));
const reviewArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/JuryReview.sol/JuryReview.json')));
const tokenArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/MockUSDC.sol/MockUSDC.json')));
const databaseName = `fundtogether_vnext_browser_${randomUUID().replaceAll('-', '')}`;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const measurements = { receiptConfirmationMs: [], canonicalIndexingMs: [], apiReadResponseMs: [], uiReceipts: [], directReceipts: [] };
let admin;
let databaseCreated = false;
let app;
let db;
let vite;
let browser;
let activePage;
let currentStep = 'initializing isolated VNext runtime';
let progressHeartbeat;
const sensitiveValues = new Set();

function markStep(step) {
  currentStep = step;
  console.log(`[VNext browser] ${step}`);
}

function canonicalEvent(receipt, abi, eventName) {
  const events = parseEventLogs({ abi, logs: receipt.logs, eventName, strict: true });
  assert.equal(events.length, 1, `expected one canonical ${eventName} event`);
  return events[0].args;
}

async function sendDirect(account, request) {
  const startedAt = performance.now();
  const hash = await wallet(account).writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  assert.equal(receipt.status, 'success', `VNext direct transaction reverted: ${request.functionName}`);
  measurements.directReceipts.push({
    functionName: request.functionName,
    transactionHash: hash,
    gasUsed: receipt.gasUsed.toString(),
    confirmationMs: Math.round(performance.now() - startedAt),
  });
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
  const startedAt = performance.now();
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/transactions/${transactionHash}`, { timeout: 5_000 });
    if (response.ok()) {
      const status = await response.json();
      if (status.state === 'ON_CHAIN_CONFIRMED') {
        measurements.canonicalIndexingMs.push({ transactionHash, milliseconds: Math.round(performance.now() - startedAt) });
        return status;
      }
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForCampaignProjection(context, apiUrl, campaignId, expectedState) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/campaigns/${campaignId}`, { timeout: 5_000 });
    if (response.ok()) {
      const projection = await response.json();
      if (Number(projection.state) === expectedState) return projection;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForMilestoneProjection(context, apiUrl, campaignId, predicate) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/campaigns/${campaignId}/milestones`, { timeout: 5_000 });
    if (response.ok()) {
      const milestones = await response.json();
      const milestone = milestones.find(item => String(item.milestoneId) === '0');
      if (milestone && predicate(milestone)) return milestone;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForReviewOutcome(context, apiUrl, reviewCaseId, expectedOutcome) {
  let latest;
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews`, { timeout: 5_000 });
    if (response.ok()) {
      const reviews = await response.json();
      latest = reviews.find(review => review.reviewCaseId.toLowerCase() === reviewCaseId.toLowerCase());
      if (Number(latest?.finalOutcome) === expectedOutcome) return latest;
    }
    await wait(1000);
  }
  const [finalOutcome, settlementComplete] = await Promise.all([
    client.readContract({ address: JSON.parse(fs.readFileSync(manifestPath, 'utf8')).juryReview, abi: reviewArtifact.abi, functionName: 'finalOutcome', args: [reviewCaseId] }),
    client.readContract({ address: JSON.parse(fs.readFileSync(manifestPath, 'utf8')).juryReview, abi: reviewArtifact.abi, functionName: 'settlementComplete', args: [reviewCaseId] }),
  ]);
  throw new Error(`VNext review projection did not reach final outcome ${expectedOutcome}: ${JSON.stringify({ latest, onchainFinalOutcome: Number(finalOutcome), onchainSettlementComplete: settlementComplete })}`);
}

async function waitForEvidence(context, apiUrl, reviewCaseId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/evidence`, { timeout: 5_000 });
    if (response.ok()) {
      const evidence = await response.json();
      if (evidence.availabilityPolicy?.status === 'READY' && evidence.evidence?.some(item => item.availability === 'AVAILABLE')) return evidence;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForAssignments(context, apiUrl, reviewCaseId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/assignments`, { timeout: 5_000 });
    if (response.ok()) {
      const assignments = await response.json();
      if (assignments.length === 3) return assignments;
    }
    await wait(1000);
  }
  return undefined;
}

async function waitForUiReceipt(page) {
  const startedAt = performance.now();
  const knownHashes = new Set(measurements.uiReceipts.map(receipt => receipt.transactionHash.toLowerCase()));
  const receiptStatus = [
    page.locator('[role="status"], [data-vnext-funding-checkout] code, [data-vnext-refund-dashboard] code').filter({ hasText: /0x[0-9a-fA-F]{64}/ }),
    page.locator('[data-vnext-evidence-wizard] p').filter({ hasText: /^Transaction 0x[0-9a-fA-F]{64}$/ }),
  ];
  let transactionText;
  let transactionHash;
  for (let attempt = 0; attempt < 120 && !transactionHash; attempt++) {
    for (const statusGroup of receiptStatus) {
      for (let index = 0; index < await statusGroup.count(); index++) {
        const candidate = statusGroup.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) continue;
        const text = await candidate.innerText();
        const hash = text.match(/0x[0-9a-fA-F]{64}/)?.[0];
        if (hash && !knownHashes.has(hash.toLowerCase())) {
          transactionText = text;
          transactionHash = hash;
          break;
        }
      }
      if (transactionHash) break;
    }
    if (!transactionHash) await wait(250);
  }
  if (!transactionHash) {
    throw new Error(`missing new transaction hash in UI status. Page: ${(await page.locator('body').innerText()).slice(-1800)}`);
  }
  measurements.receiptConfirmationMs.push({ transactionHash, milliseconds: Math.round(performance.now() - startedAt) });
  const receipt = await client.getTransactionReceipt({ hash: transactionHash });
  assert.equal(receipt.status, 'success', `UI transaction reverted: ${transactionHash}`);
  measurements.uiReceipts.push({ transactionHash, gasUsed: receipt.gasUsed.toString(), blockNumber: receipt.blockNumber.toString() });
  return { transactionHash, transactionText };
}

function trackApiReads(page) {
  const started = new WeakMap();
  page.on('request', request => {
    if (request.method() === 'GET' && /\/v1\/fundtogether\/vnext\//.test(request.url())) started.set(request, performance.now());
  });
  page.on('response', response => {
    const request = response.request();
    const start = started.get(request);
    if (start === undefined) return;
    measurements.apiReadResponseMs.push({ status: response.status(), milliseconds: Math.round(performance.now() - start) });
    started.delete(request);
  });
}

async function waitForEnabled(locator, page, label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await locator.count() && await locator.isEnabled({ timeout: 1_000 }).catch(() => false)) return;
    await wait(1000);
  }
  throw new Error(`VNext browser ${label} stayed disabled:\n${await page.locator('body').innerText({ timeout: 5_000 })}`);
}

async function waitForCampaignPageState(page, campaignUrl, expectedState) {
  if (page.url() === campaignUrl) {
    await page.reload();
    await connectWallet(page);
  }
  await page.goto(campaignUrl);
  for (let attempt = 0; attempt < 30; attempt++) {
    const visibleLines = (await page.locator('body').innerText().catch(() => '')).split(/\r?\n/).map(line => line.trim());
    if (visibleLines.includes(expectedState)) return;
    await wait(1000);
  }
  throw new Error(`VNext browser UI did not render ${expectedState}:\n${await page.locator('body').innerText()}`);
}

async function connectWallet(page) {
  await page.goto(`${webOrigin}/#/account`);
  const connectButton = page.getByRole('button', { name: /Connect Wallet|Kết nối ví/ }).first();
  const connectedButton = page.getByRole('button', { name: 'FundTogether VNext', exact: true });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await connectedButton.isVisible().catch(() => false)) return;
    if (await connectButton.isVisible().catch(() => false)) break;
    await wait(250);
  }
  if (await connectedButton.isVisible().catch(() => false)) return;
  await connectButton.waitFor({ state: 'visible', timeout: 10_000 });
  await connectButton.click();
  const testWallet = page.getByRole('button', { name: /FundTogether VNext Test Wallet/ });
  await testWallet.waitFor({ state: 'visible', timeout: 10_000 });
  await testWallet.click();
  try {
    await connectedButton.waitFor({ timeout: 15_000 });
  } catch (error) {
    const body = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => 'unavailable');
    const requests = await page.evaluate(() => window.__vnextTestWalletRequests || []).catch(() => []);
    throw new Error(`VNext test wallet did not connect: ${error.message}\nProvider requests: ${JSON.stringify(requests)}\nPage: ${body}`);
  }
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
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webOrigin });
  await context.addInitScript(providerScript(getAddress(account)), { account: getAddress(account), rpcUrl });
  await login(context, apiUrl, getAddress(account));
  const page = await context.newPage();
  activePage = page;
  trackApiReads(page);
  page.setDefaultTimeout(30_000);
  await connectWallet(page);
  await page.goto(`${webOrigin}/#/campaigns/vnext/judge`);
  await page.getByRole('heading', { name: 'Judge workspace' }).waitFor();
  const caseCard = page.locator(`article[data-vnext-judge-case="${reviewCaseId}"]`);
  await caseCard.getByText(reviewCaseId, { exact: true }).waitFor();
  return { context, page, caseCard };
}

async function inspectAuthorizedEvidence({ page, caseCard }, reviewCaseId, expectedHash) {
  const evidencePanel = caseCard.locator(`[data-vnext-evidence-case="${reviewCaseId}"]`);
  await evidencePanel.locator('p').filter({ hasText: `Evidence ${expectedHash} ·` }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await evidencePanel.getByRole('button', { name: 'Tải evidence', exact: true }).click();
  const download = await downloadPromise;
  const downloadedFile = await download.path();
  assert.ok(downloadedFile, 'Assigned Judge could not download the authorized evidence');
  const actualHash = `0x${createHash('sha256').update(fs.readFileSync(downloadedFile)).digest('hex')}`;
  assert.equal(actualHash, expectedHash.toLowerCase(), 'Judge evidence bytes did not match the canonical SHA-256');
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
        (window.__vnextTestWalletRequests ||= []).push(method);
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') {
          return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [account] }] }];
        }
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
  assert.equal(challengeResponse.status(), 200, `SIWE challenge endpoint returned HTTP ${challengeResponse.status()}`);
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
  assert.equal(localVerification.success, true, 'local SIWE message verification failed');
  const loginResponse = await context.request.post(`${apiUrl}/auth/verify`, {
    headers: { Origin: webOrigin },
    data: { message, signature },
  });
  assert.equal(loginResponse.status(), 200, `SIWE verification failed with HTTP ${loginResponse.status()}`);
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const scenarioStartedAt = performance.now();
  progressHeartbeat = setInterval(() => console.log(`[VNext browser] waiting in ${currentStep}`), 30_000);
  progressHeartbeat.unref();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.protocolKind, 'FUNDTOGETHER_VNEXT');
  assert.equal(manifest.chainId, 31339);
  assert.equal(manifest.rpcUrl, rpcUrl, 'VNext manifest RPC must match the isolated test endpoint');
  assert.equal(await client.getChainId(), 31339);
  const accounts = (await client.request({ method: 'eth_accounts' })).map(value => value.toLowerCase());
  assert.ok(accounts.length >= 9, 'VNext browser acceptance requires a deployer, Backer and six funded Judges');
  markStep('preparing isolated test database and MinIO bucket');
  const creator = getAddress(accounts[0]);
  const backer = getAddress(accounts[1]);
  await sendDirect(accounts[0], { address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'mint', args: [backer, 200000000n] });
  for (const judge of accounts.slice(3, 6)) {
    await sendDirect(accounts[0], { address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'mint', args: [judge, 200000000n] });
    await sendDirect(judge, { address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'approve', args: [manifest.juryRegistry, 200000000n] });
    await sendDirect(judge, { address: manifest.juryRegistry, abi: registryArtifact.abi, functionName: 'depositStake', args: [100000000n] });
  }

  const database = new URL(env.DATABASE_URL);
  database.pathname = '/postgres';
  const adminDatabase = new Client({ connectionString: database.toString() });
  admin = adminDatabase;
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  database.pathname = `/${databaseName}`;
  const databaseUrl = database.toString();
  await migrateVNextDemoDatabase(root, { databaseUrl, expectedDatabaseName: databaseName, expectedPort: database.port });

  const webPort = await findFreePort();
  webOrigin = `http://127.0.0.1:${webPort}`;

  Object.assign(process.env, env, {
    DATABASE_URL: databaseUrl,
    FUNDTOGETHER_VNEXT_DATABASE_URL: databaseUrl,
    FUNDTOGETHER_VNEXT_ENV_PATH: envFile,
    FUNDTOGETHER_RPC_URL: rpcUrl,
    FUNDTOGETHER_PROTOCOL: 'FUNDTOGETHER_VNEXT',
    WEB_ORIGIN: webOrigin,
    AUTH_DOMAIN: `127.0.0.1:${webPort}`,
    AUTH_CHAIN_ID: '31339',
    AUTH_SESSION_COOKIE_NAME: `ft_vnext_browser_${process.pid}`,
    NODE_ENV: 'development',
    FUNDTOGETHER_VNEXT_MANIFEST_PATH: manifestPath,
    FUNDTOGETHER_VNEXT_INDEXER_ENABLED: 'true',
    S3_BUCKET: `${env.S3_BUCKET}-e2e-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
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
    server: { host: '127.0.0.1', port: webPort, strictPort: true },
    logLevel: 'error',
  });
  await vite.listen();

  const playwright = require('playwright');
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHANNEL) launchOptions.channel = process.env.PLAYWRIGHT_CHANNEL;
  browser = await playwright.chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webOrigin });
  await context.addInitScript(providerScript(creator), { account: creator, rpcUrl });
  await login(context, apiUrl, creator);

  const page = await context.newPage();
  activePage = page;
  trackApiReads(page);
  markStep('Creator creates the campaign in the VNext UI');
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
  const createTransaction = await waitForUiReceipt(page);
  const createReceipt = await client.getTransactionReceipt({ hash: createTransaction.transactionHash });
  const createdEvent = canonicalEvent(createReceipt, campaignArtifact.abi, 'CampaignCreated');
  assert.equal(createdEvent.creator.toLowerCase(), creator.toLowerCase());
  assert.equal(createdEvent.goal, 100000000n);
  const campaignId = createdEvent.campaignId.toString();
  markStep('waiting for the campaign transaction to become canonical');
  const canonicalStatus = await waitForCanonical(context, apiUrl, createTransaction.transactionHash);
  assert.equal(canonicalStatus?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm the browser transaction');

  const creatorBalanceBefore = await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [creator] });
  markStep('opening the canonical campaign projection');
  await page.goto(`${webOrigin}/#/campaigns/vnext/${campaignId}`);
  await page.getByText('CANONICAL PROJECTION', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'CREATED', exact: true }).waitFor();
  assert.ok(!requests.some(url => url.includes('/v1/fundtogether/public/campaigns/vnext')));

  const publicationCaseId = await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'publicationReviewCase', args: [BigInt(campaignId)] });
  assert.match(publicationCaseId, /^0x[0-9a-f]{64}$/i);
  const judgeWallets = Object.fromEntries(accounts.map(address => [address, wallet(address)]));
  markStep('resolving the publication case with direct contract calls');
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
  const publicationProjection = await waitForReviewOutcome(context, apiUrl, publicationCaseId, 1);
  console.log(`[VNext browser] publication outcome indexed at block ${publicationProjection.lastBlockNumber}`);

  await waitForCampaignPageState(page, `${webOrigin}/#/campaigns/vnext/${campaignId}`, 'CREATED');
  markStep('finalizing publication through the VNext UI');
  const finalizePublicationButton = page.getByRole('button', { name: 'Finalize publication', exact: true });
  await waitForEnabled(finalizePublicationButton, page, 'publication finalization');
  await finalizePublicationButton.click();
  const publicationTransaction = await waitForUiReceipt(page);
  const publicationReceipt = await client.getTransactionReceipt({ hash: publicationTransaction.transactionHash });
  const publicationEvent = canonicalEvent(publicationReceipt, campaignArtifact.abi, 'PublicationFinalized');
  assert.equal(publicationEvent.successful, true);
  assert.equal((await waitForCanonical(context, apiUrl, publicationTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED');
  const fundingProjection = await waitForCampaignProjection(context, apiUrl, campaignId, 1);
  assert.equal(Number(fundingProjection?.state), 1, 'VNext indexer did not project FUNDING after publication finalization');
  const campaignUrl = `${webOrigin}/#/campaigns/vnext/${campaignId}`;
  await waitForCampaignPageState(page, campaignUrl, 'FUNDING');

  const backerContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await backerContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webOrigin });
  await backerContext.addInitScript(providerScript(backer), { account: backer, rpcUrl });
  await login(backerContext, apiUrl, backer);
  const backerPage = await backerContext.newPage();
  activePage = backerPage;
  trackApiReads(backerPage);
  markStep('Backer funds the successful campaign in the VNext UI');
  backerPage.setDefaultTimeout(30_000);
  await connectWallet(backerPage);
  await waitForCampaignPageState(backerPage, campaignUrl, 'FUNDING');
  await backerPage.getByLabel('Số MockUSDC muốn đóng góp').fill('100');
  await backerPage.getByRole('button', { name: /^Approve / }).click();
  await waitForUiReceipt(backerPage);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'allowance', args: [backer, manifest.campaignEscrow] }), 100000000n);
  await backerPage.getByRole('button', { name: 'Contribute', exact: true }).click();
  const contributionTransaction = await waitForUiReceipt(backerPage);
  const contributionReceipt = await client.getTransactionReceipt({ hash: contributionTransaction.transactionHash });
  const contributionEvent = canonicalEvent(contributionReceipt, campaignArtifact.abi, 'ContributionReceived');
  assert.equal(contributionEvent.backer.toLowerCase(), backer.toLowerCase());
  assert.equal(contributionEvent.amount, 100000000n);
  assert.equal(contributionEvent.cumulativeRaised, 100000000n);
  assert.equal((await waitForCanonical(backerContext, apiUrl, contributionTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm Backer contribution');
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignRaised', args: [BigInt(campaignId)] }), 100000000n);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [manifest.campaignEscrow] }), 100000000n);

  await client.request({ method: 'evm_increaseTime', params: [7 * 24 * 60 * 60 + 1] });
  await client.request({ method: 'evm_mine' });
  await waitForCampaignPageState(backerPage, campaignUrl, 'FUNDING');
  await backerPage.getByRole('button', { name: 'Chốt funding sau deadline', exact: true }).click();
  const fundingTransaction = await waitForUiReceipt(backerPage);
  const fundingReceipt = await client.getTransactionReceipt({ hash: fundingTransaction.transactionHash });
  const fundingEvent = canonicalEvent(fundingReceipt, campaignArtifact.abi, 'FundingFinalized');
  assert.equal(fundingEvent.successful, true);
  assert.equal((await waitForCanonical(backerContext, apiUrl, fundingTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm funding finalization');
  assert.equal(Number((await waitForCampaignProjection(backerContext, apiUrl, campaignId, 3))?.state), 3, 'VNext indexer did not project MILESTONES_RUNNING after funding finalization');
  assert.equal(Number(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignState', args: [BigInt(campaignId)] })), 3);
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignPaidOut', args: [BigInt(campaignId)] }), 0n);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [creator] }), creatorBalanceBefore);
  await waitForCampaignPageState(backerPage, campaignUrl, 'MILESTONES_RUNNING');

  const evidenceDocument = await PDFDocument.create();
  const evidencePage = evidenceDocument.addPage([300, 180]);
  evidencePage.drawText('FundTogether VNext milestone evidence');
  const evidenceBuffer = Buffer.from(await evidenceDocument.save());
  const milestoneEvidenceHash = `0x${createHash('sha256').update(evidenceBuffer).digest('hex')}`;
  await waitForCampaignPageState(page, campaignUrl, 'MILESTONES_RUNNING');
  await connectWallet(page);
  await page.goto(campaignUrl);
  await page.getByRole('button', { name: 'Mở Milestone Dashboard', exact: true }).click();
  await page.getByLabel('Evidence file for milestone 0').setInputFiles({ name: 'milestone.pdf', mimeType: 'application/pdf', buffer: evidenceBuffer });
  await page.getByRole('button', { name: 'Calculate SHA-256', exact: true }).click();
  await page.getByText(`SHA-256 ${milestoneEvidenceHash}`, { exact: true }).waitFor();
  await page.getByLabel(/Commit this exact SHA-256 on-chain/).check();
  await page.getByRole('button', { name: 'Submit on-chain', exact: true }).click();
  const milestoneEvidenceTransaction = await waitForUiReceipt(page);
  const milestoneEvidenceReceipt = await client.getTransactionReceipt({ hash: milestoneEvidenceTransaction.transactionHash });
  const milestoneEvidenceEvent = canonicalEvent(milestoneEvidenceReceipt, campaignArtifact.abi, 'MilestoneEvidenceSubmitted');
  assert.equal(milestoneEvidenceEvent.evidenceHash.toLowerCase(), milestoneEvidenceHash.toLowerCase());
  assert.equal((await waitForCanonical(context, apiUrl, milestoneEvidenceTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm milestone evidence submission');
  const milestoneProjection = await waitForMilestoneProjection(context, apiUrl, campaignId, item => item.reviewCaseId && Number(item.state) === 2);
  assert.ok(milestoneProjection?.reviewCaseId, 'VNext indexer did not project the milestone review case');
  const milestoneCaseId = String(milestoneEvidenceEvent.reviewCaseId).toLowerCase();
  assert.equal(milestoneProjection.reviewCaseId.toLowerCase(), milestoneCaseId);
  await page.locator('[data-vnext-evidence-wizard]').getByLabel('Evidence summary').fill('Browser acceptance milestone evidence');
  await page.getByRole('button', { name: 'Upload exact file', exact: true }).click();
  const evidenceStatus = await waitForEvidence(context, apiUrl, milestoneCaseId);
  if (!evidenceStatus) {
    const evidenceDebug = await context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(milestoneCaseId)}/evidence`);
    console.error(`VNext evidence status endpoint returned HTTP ${evidenceDebug.status()}`);
  }
  assert.equal(evidenceStatus?.availabilityPolicy?.status, 'READY', 'VNext evidence did not become READY');
  assert.equal(evidenceStatus?.evidence.find(item => item.evidenceHash.toLowerCase() === milestoneEvidenceHash.toLowerCase())?.availability, 'AVAILABLE');

  const court = await prepareThreeJudgeCourt({ accounts, manifest, reviewCaseId: milestoneCaseId });
  const assignments = await waitForAssignments(context, apiUrl, milestoneCaseId);
  assert.equal(assignments?.length, 3, 'VNext browser milestone assignments were not indexed');
  const judgePages = [];
  for (const judge of court.courtJudges) {
    markStep(`Judge ${judge} commits a vote through the workspace`);
    const opened = await openJudgePage({ browser, account: judge, apiUrl, reviewCaseId: milestoneCaseId });
    await inspectAuthorizedEvidence(opened, milestoneCaseId, milestoneEvidenceHash);
    await opened.caseCard.getByRole('group', { name: 'Vote selection' }).getByRole('button', { name: 'PASS', exact: true }).click();
    await opened.caseCard.getByRole('button', { name: 'Generate secret salt', exact: true }).click();
    await opened.caseCard.getByRole('button', { name: 'Copy secret backup', exact: true }).click();
    const backup = await opened.page.evaluate(() => navigator.clipboard.readText());
    sensitiveValues.add(backup);
    sensitiveValues.add(JSON.parse(backup).salt);
    const backupData = JSON.parse(backup);
    assert.equal(backupData.reviewCaseId, milestoneCaseId.toLowerCase());
    assert.equal(backupData.judgeAddress, judge.toLowerCase());
    assert.equal(backupData.vote, 'PASS');
    const expectedCommitment = voteCommitment({
      campaignId: BigInt(campaignId),
      milestoneId: 0n,
      evidenceRevision: 1n,
      caseNumber: court.caseNumber,
      roundId: court.roundId,
      courtId: 0n,
      judge,
      vote: 1n,
      salt: backupData.salt,
      protocolVersion: court.protocolVersion,
    });
    await opened.caseCard.getByText(`Computed commitment: ${expectedCommitment}`, { exact: true }).waitFor();
    const commitButton = opened.caseCard.getByRole('button', { name: 'Commit vote', exact: true });
    try {
      await waitForEnabled(commitButton, opened.page, `Judge commit for ${judge}`);
    } catch (error) {
      const judgeEvidenceDebug = await opened.context.request.get(`${apiUrl}/v1/fundtogether/vnext/reviews/${encodeURIComponent(milestoneCaseId)}/evidence`);
      console.error(`Judge evidence endpoint returned HTTP ${judgeEvidenceDebug.status()} for assigned Judge ${judge}`);
      throw error;
    }
    await commitButton.click();
    const commitTransaction = await waitForUiReceipt(opened.page);
    const commitReceipt = await client.getTransactionReceipt({ hash: commitTransaction.transactionHash });
    const committedEvent = canonicalEvent(commitReceipt, reviewArtifact.abi, 'VoteCommitted');
    assert.equal(committedEvent.reviewCaseId.toLowerCase(), milestoneCaseId.toLowerCase());
    assert.equal(committedEvent.judge.toLowerCase(), judge.toLowerCase());
    assert.equal(committedEvent.commitment.toLowerCase(), expectedCommitment.toLowerCase());
    assert.equal((await waitForCanonical(opened.context, apiUrl, commitTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', `VNext Judge commit was not canonical for ${judge}`);
    judgePages.push({ ...opened, judge, backup, expectedCommitment });
  }

  await advanceChain(court.policy.commitWindowSeconds + 1);
  for (const judgePage of judgePages) {
    await judgePage.page.reload();
    await connectWallet(judgePage.page);
    await judgePage.page.goto(`${webOrigin}/#/campaigns/vnext/judge`);
    await judgePage.caseCard.getByText(milestoneCaseId, { exact: true }).waitFor();
    const saltInput = judgePage.caseCard.getByLabel('Secret salt · bytes32');
    await saltInput.waitFor();
    assert.equal(await saltInput.inputValue(), '', 'new Judge salts must not persist in browser storage');
    await judgePage.caseCard.getByLabel('Reveal recovery backup').fill(judgePage.backup);
    await judgePage.caseCard.getByRole('button', { name: 'Import backup', exact: true }).click();
    await judgePage.caseCard.getByRole('status').filter({ hasText: 'Backup hợp lệ' }).waitFor();
    await judgePage.caseCard.getByText(`Computed commitment: ${judgePage.expectedCommitment}`, { exact: true }).waitFor();
    const revealButton = judgePage.caseCard.getByRole('button', { name: 'Reveal vote', exact: true });
    await waitForEnabled(revealButton, judgePage.page, `Judge reveal for ${judgePage.judge}`);
    await revealButton.click();
    const revealTransaction = await waitForUiReceipt(judgePage.page);
    const revealReceipt = await client.getTransactionReceipt({ hash: revealTransaction.transactionHash });
    const revealedEvent = canonicalEvent(revealReceipt, reviewArtifact.abi, 'VoteRevealed');
    assert.equal(revealedEvent.reviewCaseId.toLowerCase(), milestoneCaseId.toLowerCase());
    assert.equal(revealedEvent.judge.toLowerCase(), judgePage.judge.toLowerCase());
    assert.equal(Number(revealedEvent.vote), 1);
    assert.equal((await waitForCanonical(judgePage.context, apiUrl, revealTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', `VNext Judge reveal was not canonical for ${judgePage.judge}`);
  }

  markStep('Judges recover their vote backups and reveal');
  await advanceChain(court.policy.revealWindowSeconds + 1);
  const finalizingJudge = judgePages[0];
  await finalizingJudge.page.reload();
  await connectWallet(finalizingJudge.page);
  await finalizingJudge.page.goto(`${webOrigin}/#/campaigns/vnext/judge`);
  await finalizingJudge.caseCard.getByText(milestoneCaseId, { exact: true }).waitFor();
  await finalizingJudge.caseCard.getByRole('button', { name: 'Finalize court 0', exact: true }).click();
  const finalCourtTransaction = await waitForUiReceipt(finalizingJudge.page);
  const finalCourtReceipt = await client.getTransactionReceipt({ hash: finalCourtTransaction.transactionHash });
  canonicalEvent(finalCourtReceipt, reviewArtifact.abi, 'CourtFinalized');
  assert.equal((await waitForCanonical(finalizingJudge.context, apiUrl, finalCourtTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext Judge court finalization was not canonical');

  await advanceChain(court.policy.appealWindowSeconds + 1);
  await sendDirect(accounts[0], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'finalizeNoAppeal', args: [milestoneCaseId] });
  for (let attempt = 0; attempt < 64; attempt++) {
    if (await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'settlementComplete', args: [milestoneCaseId] })) break;
    await sendDirect(accounts[0], { address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'settleFinalRuling', args: [milestoneCaseId, 32n] });
  }
  assert.equal(await client.readContract({ address: manifest.juryReview, abi: reviewArtifact.abi, functionName: 'settlementComplete', args: [milestoneCaseId] }), true, 'VNext milestone settlement did not complete');

  activePage = page;
  await waitForCampaignPageState(page, campaignUrl, 'MILESTONES_RUNNING');
  await page.getByRole('button', { name: 'Mở Milestone Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Sync final ruling to milestone', exact: true }).click();
  const syncTransaction = await waitForUiReceipt(page);
  assert.equal((await waitForCanonical(context, apiUrl, syncTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext milestone final ruling sync was not canonical');
  assert.equal(Number((await waitForMilestoneProjection(context, apiUrl, campaignId, item => Number(item.state) === 9))?.state), 9, 'VNext indexer did not project the challenge window');

  markStep('paying the milestone and checking contract conservation');
  await advanceChain(court.policy.challengeWindowSeconds + 1);
  await waitForCampaignPageState(page, campaignUrl, 'MILESTONES_RUNNING');
  await page.getByRole('button', { name: 'Mở Milestone Dashboard', exact: true }).click();
  const creatorBalanceBeforePayout = await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [creator] });
  const escrowBalanceBeforePayout = await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [manifest.campaignEscrow] });
  assert.equal(escrowBalanceBeforePayout, 100000000n);
  await page.getByRole('button', { name: 'Pay milestone 0', exact: true }).click();
  const payoutTransaction = await waitForUiReceipt(page);
  const payoutReceipt = await client.getTransactionReceipt({ hash: payoutTransaction.transactionHash });
  const paidEvent = canonicalEvent(payoutReceipt, campaignArtifact.abi, 'MilestonePaid');
  assert.equal(paidEvent.campaignId, BigInt(campaignId));
  assert.equal(paidEvent.milestoneId, 0n);
  assert.equal(paidEvent.creator.toLowerCase(), creator.toLowerCase());
  assert.equal(paidEvent.amount, 100000000n);
  canonicalEvent(payoutReceipt, campaignArtifact.abi, 'CampaignCompleted');
  assert.equal((await waitForCanonical(context, apiUrl, payoutTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext payout was not canonical');
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignPaidOut', args: [BigInt(campaignId)] }), 100000000n);
  assert.equal(Number(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignState', args: [BigInt(campaignId)] })), 4);
  assert.equal(Number((await waitForCampaignProjection(context, apiUrl, campaignId, 4))?.state), 4, 'VNext indexer did not project COMPLETED after payout');
  const successfulCampaignBalances = await Promise.all([
    client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignRaised', args: [BigInt(campaignId)] }),
    client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignPaidOut', args: [BigInt(campaignId)] }),
    client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignRefunded', args: [BigInt(campaignId)] }),
    client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [manifest.campaignEscrow] }),
    client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [creator] }),
  ]);
  assert.deepEqual(successfulCampaignBalances.slice(0, 4), [100000000n, 100000000n, 0n, 0n]);
  assert.equal(successfulCampaignBalances[4], creatorBalanceBeforePayout + 100000000n);
  assert.equal(successfulCampaignBalances[0], successfulCampaignBalances[1] + successfulCampaignBalances[2] + successfulCampaignBalances[3]);

  markStep('Backer claims the underfunded campaign refund');
  activePage = backerPage;
  await connectWallet(page);
  await page.goto(`${webOrigin}/#/campaigns/vnext`);
  await page.getByRole('heading', { name: 'Tạo Campaign VNext' }).waitFor();
  await page.getByLabel('Payout wallet').fill(creator);
  await page.getByLabel(/Funding goal/).fill('100000000');
  await page.getByLabel(/Milestone acceptance criteria hash/).fill(`0x${'3'.repeat(64)}`);
  await page.getByLabel(/Publication evidence hash/).fill(`0x${'4'.repeat(64)}`);
  await page.getByRole('button', { name: 'Tạo campaign và mở Judge case' }).click();
  const refundCreateTransaction = await waitForUiReceipt(page);
  const refundCreateReceipt = await client.getTransactionReceipt({ hash: refundCreateTransaction.transactionHash });
  const refundCreatedEvent = canonicalEvent(refundCreateReceipt, campaignArtifact.abi, 'CampaignCreated');
  assert.equal(refundCreatedEvent.goal, 100000000n);
  assert.equal((await waitForCanonical(context, apiUrl, refundCreateTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund campaign creation was not canonical');
  const refundCampaignId = refundCreatedEvent.campaignId.toString();
  const refundPublicationCaseId = await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'publicationReviewCase', args: [BigInt(refundCampaignId)] });
  await resolvePass({ client, wallets: judgeWallets, addresses: { deployer: accounts[0], judges: accounts.slice(3, 6) }, manifest, policy: loadPolicy(), campaignId: BigInt(refundCampaignId), milestoneId: 2n ** 256n - 1n, evidenceRevision: 1n, caseId: refundPublicationCaseId });
  const refundCampaignUrl = `${webOrigin}/#/campaigns/vnext/${refundCampaignId}`;
  await page.goto(refundCampaignUrl);
  const refundFinalizePublication = page.getByRole('button', { name: 'Finalize publication', exact: true });
  await waitForEnabled(refundFinalizePublication, page, 'refund publication finalization');
  await refundFinalizePublication.click();
  const refundPublicationTransaction = await waitForUiReceipt(page);
  const refundPublicationReceipt = await client.getTransactionReceipt({ hash: refundPublicationTransaction.transactionHash });
  assert.equal(canonicalEvent(refundPublicationReceipt, campaignArtifact.abi, 'PublicationFinalized').successful, true);
  assert.equal((await waitForCanonical(context, apiUrl, refundPublicationTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED');
  assert.equal(Number((await waitForCampaignProjection(context, apiUrl, refundCampaignId, 1))?.state), 1, 'VNext refund campaign did not enter FUNDING');
  await waitForCampaignPageState(backerPage, refundCampaignUrl, 'FUNDING');
  await backerPage.getByLabel('Số MockUSDC muốn đóng góp').fill('50');
  await backerPage.getByRole('button', { name: /^Approve / }).click();
  await waitForUiReceipt(backerPage);
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'allowance', args: [backer, manifest.campaignEscrow] }), 50000000n);
  await backerPage.getByRole('button', { name: 'Contribute', exact: true }).click();
  const refundContributionTransaction = await waitForUiReceipt(backerPage);
  const refundContributionReceipt = await client.getTransactionReceipt({ hash: refundContributionTransaction.transactionHash });
  const refundContributionEvent = canonicalEvent(refundContributionReceipt, campaignArtifact.abi, 'ContributionReceived');
  assert.equal(refundContributionEvent.amount, 50000000n);
  assert.equal(refundContributionEvent.cumulativeRaised, 50000000n);
  assert.equal((await waitForCanonical(backerContext, apiUrl, refundContributionTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund contribution was not canonical');
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [manifest.campaignEscrow] }), 50000000n);
  await advanceChain(7 * 24 * 60 * 60 + 1);
  await waitForCampaignPageState(backerPage, refundCampaignUrl, 'FUNDING');
  await backerPage.getByRole('button', { name: 'Chốt funding sau deadline', exact: true }).click();
  const refundOpenTransaction = await waitForUiReceipt(backerPage);
  const refundOpenReceipt = await client.getTransactionReceipt({ hash: refundOpenTransaction.transactionHash });
  const refundOpenEvent = canonicalEvent(refundOpenReceipt, campaignArtifact.abi, 'FundingFinalized');
  assert.equal(refundOpenEvent.successful, false);
  assert.equal(refundOpenEvent.raised, 50000000n);
  const refundsOpenedEvent = canonicalEvent(refundOpenReceipt, campaignArtifact.abi, 'CampaignRefundsOpened');
  assert.equal(refundsOpenedEvent.refundPool, 50000000n);
  assert.equal((await waitForCanonical(backerContext, apiUrl, refundOpenTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund opening was not canonical');
  assert.equal(Number((await waitForCampaignProjection(backerContext, apiUrl, refundCampaignId, 5))?.state), 5, 'VNext indexer did not project REFUNDING');
  const balanceBeforeRefund = await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer] });
  await waitForCampaignPageState(backerPage, refundCampaignUrl, 'REFUNDING');
  const freezeButton = backerPage.getByRole('button', { name: /^Xử lý allocation batch/ });
  await waitForEnabled(freezeButton, backerPage, 'bounded refund allocation');
  await freezeButton.click();
  const freezeTransaction = await waitForUiReceipt(backerPage);
  const freezeReceipt = await client.getTransactionReceipt({ hash: freezeTransaction.transactionHash });
  canonicalEvent(freezeReceipt, campaignArtifact.abi, 'RefundAllocationsFrozen');
  assert.equal((await waitForCanonical(backerContext, apiUrl, freezeTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund allocation freeze was not canonical');
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'refundAllocationsFrozen', args: [BigInt(refundCampaignId)] }), true);
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'refundEntitlement', args: [BigInt(refundCampaignId), backer] }), 50000000n);
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignPaidOut', args: [BigInt(refundCampaignId)] }), 0n);
  await waitForCampaignPageState(backerPage, refundCampaignUrl, 'REFUNDING');
  await backerPage.getByRole('button', { name: 'Claim Refund', exact: true }).click();
  const claimTransaction = await waitForUiReceipt(backerPage);
  const claimReceipt = await client.getTransactionReceipt({ hash: claimTransaction.transactionHash });
  const refundClaimedEvent = canonicalEvent(claimReceipt, campaignArtifact.abi, 'BackerRefundClaimed');
  assert.equal(refundClaimedEvent.campaignId, BigInt(refundCampaignId));
  assert.equal(refundClaimedEvent.backer.toLowerCase(), backer.toLowerCase());
  assert.equal(refundClaimedEvent.amount, 50000000n);
  assert.equal((await waitForCanonical(backerContext, apiUrl, claimTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext refund claim was not canonical');
  assert.equal(await client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [backer] }), balanceBeforeRefund + 50000000n);
  assert.equal(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'refundClaimed', args: [BigInt(refundCampaignId), backer] }), true);
  const refundConservation = await Promise.all([
    client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignRaised', args: [BigInt(refundCampaignId)] }),
    client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignPaidOut', args: [BigInt(refundCampaignId)] }),
    client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignRefunded', args: [BigInt(refundCampaignId)] }),
    client.readContract({ address: manifest.tokenAddress, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [manifest.campaignEscrow] }),
  ]);
  assert.deepEqual(refundConservation, [50000000n, 0n, 50000000n, 0n]);
  assert.equal(refundConservation[0], refundConservation[1] + refundConservation[2] + refundConservation[3]);
  await assert.rejects(client.simulateContract({
    address: manifest.campaignEscrow,
    abi: campaignArtifact.abi,
    functionName: 'claimRefund',
    args: [BigInt(refundCampaignId)],
    account: backer,
  }), /RefundAlreadyClaimed|revert/i);

  measurements.scenarioDurationMs = Math.round(performance.now() - scenarioStartedAt);
  measurements.transactionHashes = {
    campaignCreated: createTransaction.transactionHash,
    publicationFinalized: publicationTransaction.transactionHash,
    contributionReceived: contributionTransaction.transactionHash,
    fundingFinalized: fundingTransaction.transactionHash,
    evidenceSubmitted: milestoneEvidenceTransaction.transactionHash,
    payout: payoutTransaction.transactionHash,
    refundCampaignCreated: refundCreateTransaction.transactionHash,
    refundOpened: refundOpenTransaction.transactionHash,
    refundClaimed: claimTransaction.transactionHash,
  };

  const reportPath = path.join(root, '.local/fundtogether/runtime', 'vnext-browser-e2e.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const result = {
    status: 'PASS',
    protocolKind: manifest.protocolKind,
    chainId: manifest.chainId,
    genesisHash: manifest.genesisHash,
    campaignId,
    backerContribution: '100000000',
    finalState: 'COMPLETED',
    payout: '100000000',
    refundCampaignId,
    refundContribution: '50000000',
    refundClaimed: '50000000',
    measurements,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} 

async function cleanup() {
  if (progressHeartbeat) clearInterval(progressHeartbeat);
  await browser?.close().catch(() => undefined);
  await vite?.close().catch(() => undefined);
  await app?.close().catch(() => undefined);
  await db?.$client.end().catch(() => undefined);
  if (admin && databaseCreated) {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`).catch(() => undefined);
  }
  if (admin) {
    await admin.end().catch(() => undefined);
  }
}

async function captureFailure(error) {
  const reportDirectory = path.join(root, '.local/fundtogether/runtime');
  fs.mkdirSync(reportDirectory, { recursive: true });
  let screenshot;
  if (activePage && !activePage.isClosed()) {
    screenshot = path.join(reportDirectory, 'vnext-browser-e2e-failure.png');
    try {
      await activePage.evaluate(() => {
        for (const field of document.querySelectorAll('input, textarea, [contenteditable="true"]')) {
          if ('value' in field) field.value = '[REDACTED]';
          else field.textContent = '[REDACTED]';
        }
      });
      await activePage.screenshot({ path: screenshot, fullPage: true, timeout: 10000 });
    } catch {
      screenshot = undefined;
    }
  }
  let details = String(error?.stack || error?.message || error);
  for (const value of sensitiveValues) if (value) details = details.split(value).join('[REDACTED]');
  const result = { status: 'FAIL', failedStep: currentStep, error: details, screenshot, measurements };
  fs.writeFileSync(path.join(reportDirectory, 'vnext-browser-e2e-failure.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.error(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(async error => {
    await captureFailure(error);
    process.exitCode = 1;
  }).finally(cleanup);
}

module.exports = { main, providerScript };
