// Local-only VNext browser acceptance. It uses Anvil's unlocked test wallets,
// real SIWE, the real Nest API, the real Vite app and the real indexer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Client } = require('pg');
const { createPublicClient, createWalletClient, defineChain, getAddress, http } = require('viem');
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
const tokenArtifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/MockUSDC.sol/MockUSDC.json')));
const databaseName = `fundtogether_vnext_browser_${process.pid}`;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let admin;
let app;
let db;
let vite;
let browser;

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
  await waitForCampaignPageState(backerPage, campaignUrl, 'FUNDING');
  await connectWallet(backerPage);
  await backerPage.goto(campaignUrl);
  await backerPage.getByText('FUNDING', { exact: true }).waitFor();
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
  await connectWallet(backerPage);
  await waitForCampaignPageState(backerPage, campaignUrl, 'FUNDING');
  await backerPage.getByRole('button', { name: 'Chốt funding sau deadline', exact: true }).click();
  const fundingTransaction = await waitForUiReceipt(backerPage);
  assert.equal((await waitForCanonical(backerContext, apiUrl, fundingTransaction.transactionHash))?.state, 'ON_CHAIN_CONFIRMED', 'VNext indexer did not confirm funding finalization');
  assert.equal(Number((await waitForCampaignProjection(backerContext, apiUrl, campaignId, 3))?.state), 3, 'VNext indexer did not project MILESTONES_RUNNING after funding finalization');
  assert.equal(Number(await client.readContract({ address: manifest.campaignEscrow, abi: campaignArtifact.abi, functionName: 'campaignState', args: [BigInt(campaignId)] })), 3);
  await waitForCampaignPageState(backerPage, campaignUrl, 'MILESTONES_RUNNING');

  console.log(JSON.stringify({ status: 'PASS', protocolKind: manifest.protocolKind, chainId: manifest.chainId, campaignId, backerContribution: '100000000', finalState: 'MILESTONES_RUNNING' }, null, 2));
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
