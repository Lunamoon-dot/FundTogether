// Local-only acceptance. Uses real auth/API/DB/storage/contract and an explicitly
// injected Anvil test wallet; it is not manual MetaMask or real creator verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Client } = require('pg');
const { eq } = require('drizzle-orm');
const { createPublicClient, createWalletClient, defineChain, http, keccak256 } = require('viem');
const { PDFDocument } = require('pdf-lib');
const root = path.resolve(__dirname, '../../..');
const { migrateRewardDatabase } = require('./migrate-isolated.cjs');
const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.local/reward/backend.env')));
const output = path.join(root, '.local/reward/verification/editions-browser');
const databaseName = `fundtogether_reward_browser_test_${process.pid}`;
const webOrigin = 'http://127.0.0.1:5186';
const chain = defineChain({ id: 31339, name: 'Editions test', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:9548'] } } });
const client = createPublicClient({ chain, transport: http(), pollingInterval: 30 });
const wallet = account => createWalletClient({ chain, transport: http(), account });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64');
let app, vite, browser, admin, db, storage;
const observations = [];
function checked(message) { observations.push(message); console.log(`PASS ${message}`); }

async function runBrowserScenario() {
  assert.equal(await client.getChainId(), 31339);
  fs.mkdirSync(output, { recursive: true });
  const database = new URL(env.DATABASE_URL); database.pathname = '/postgres';
  admin = new Client({ connectionString: database.toString() }); await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`); database.pathname = `/${databaseName}`;
  await migrateRewardDatabase(root, { databaseUrl: database.toString(), expectedDatabaseName: databaseName });
  const accounts = (await wallet(`0x${'0'.repeat(40)}`).getAddresses()).map(value => value.toLowerCase());
  const token = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/MockUSDC.sol/MockUSDC.json')));
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/FundTogetherEditions.sol/FundTogetherEditions.json')));
  const tokenReceipt = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: token.abi, bytecode: token.bytecode.object }) });
  const tokenAddress = tokenReceipt.contractAddress;
  const receipt = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: contract.abi, bytecode: contract.bytecode.object, args: [tokenAddress, accounts[1], accounts[2]] }) });
  const address = receipt.contractAddress;
  const { editionsAbiHash, editionsPolicyHash, parseEditionsDeployment } = require('../../dist/src/blockchain/editions-deployment');
  const manifest = parseEditionsDeployment({ protocolKind: 'EDITIONS', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548', abiVersion: 'editions-local-v1', abiHash: editionsAbiHash, policyHash: editionsPolicyHash,
    tokenDecimals: 6, confirmations: 1, contractAddress: address, tokenAddress, resolver: accounts[1], backupResolver: accounts[2], genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
    contractCodeHash: keccak256(await client.getCode({ address })), tokenCodeHash: keccak256(await client.getCode({ address: tokenAddress })), deploymentBlockNumber: String(receipt.blockNumber), deploymentBlockHash: receipt.blockHash });
  const manifestPath = path.join(output, 'deployment.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  Object.assign(process.env, env, { DATABASE_URL: database.toString(), WEB_ORIGIN: webOrigin, AUTH_DOMAIN: '127.0.0.1:5186', AUTH_CHAIN_ID: '31339',
    AUTH_SESSION_COOKIE_NAME: 'ft_editions_browser_test', NODE_ENV: 'test', REWARD_INDEXER_POLL_ENABLED: 'false', EDITIONS_INDEXER_POLL_ENABLED: 'false', EDITIONS_MANIFEST_PATH: manifestPath,
    S3_BUCKET: `${env.S3_BUCKET}-browser-test-${process.pid}`, LOG_LEVEL: 'silent' });
  const { NestFactory } = require('@nestjs/core');
  const { RewardAppModule } = require('../../dist/src/reward/reward-app.module');
  app = await NestFactory.create(RewardAppModule, { logger: false }); app.enableCors({ origin: webOrigin, credentials: true }); await app.listen(0, '127.0.0.1');
  const apiUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  db = app.get(require('../../dist/src/database/database.constants').DRIZZLE_DB);
  const schema = require('../../dist/src/database/schema');
  storage = app.get(require('../../dist/src/modules/evidence/evidence-storage.service').EvidenceStorageService);
  const password = 'local-browser-fixture-password';
  const passwordHash = await require('argon2').hash(password);
  const actors = await db.insert(schema.users).values(['creator', 'resolver', 'backer', 'community'].map(name => ({ email: `${name}@browser.test`, passwordHash }))).returning();
  await db.insert(schema.platformRoles).values({ userId: actors[1].id, roles: ['RESOLVER'] });
  await db.insert(schema.rewardCreatorProfiles).values({ userId: actors[0].id, displayName: 'Browser Test Artist', bio: 'Test-only creator fixture', ipDeclaration: 'Test-only publication rights declaration', status: 'VERIFIED' });
  process.env.VITE_REWARD_API_URL = apiUrl;
  const viteModule = await import(pathToFileURL(require.resolve('vite', { paths: [path.join(root, 'frontend')] })).href);
  vite = await viteModule.createServer({ root: path.join(root, 'frontend'), mode: 'reward', server: { host: '127.0.0.1', port: 5186, strictPort: true }, logLevel: 'error' }); await vite.listen();
  const playwright = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli')] }));
  browser = await playwright.chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const pages = [];
  for (const [index, actor] of actors.entries()) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    if (index < 3) {
      const account = accounts[index === 0 ? 3 : index === 1 ? 1 : 4];
      await context.addInitScript(({ account }) => {
        const handlers = new Map();
        const provider = { isMetaMask: true,
          on(name, fn) { const listeners = handlers.get(name) || []; listeners.push(fn); handlers.set(name, listeners); },
          removeListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter(item => item !== fn)); },
          async request({ method, params = [] }) {
            if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
            if (method === 'wallet_switchEthereumChain') { if (params[0].chainId !== '0x7a6b') throw new Error('Local test chain only'); return null; }
            if (method === 'wallet_getCapabilities') return {};
            const result = await (await fetch('http://127.0.0.1:9548', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
            if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code }); return result.result;
          } };
        const info = { uuid: '6b83c7b8-477b-4fd5-9f5a-497014850dd2', name: 'Editions Test Wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'test.editions.wallet' };
        const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }));
        window.addEventListener('eip6963:requestProvider', announce); announce();
      }, { account });
    }
    const login = await context.request.post(`${apiUrl}/auth/login`, { headers: { Origin: webOrigin }, data: { email: actor.email, password } }); assert.equal(login.status(), 200, await login.text());
    const page = await context.newPage(); page.setDefaultTimeout(20000); pages.push(page);
    await page.goto(`${webOrigin}/#/account`);
    await page.getByRole('button', { name: /Đăng xuất/ }).waitFor();
    if (index < 3) {
      await page.getByRole('button', { name: /Connect Wallet|Kết nối ví/ }).click();
      await page.getByRole('button', { name: /Editions Test Wallet/ }).click();
      await page.getByRole('button', { name: /Liên kết ví/ }).click();
      await page.getByRole('heading', { name: /Ví đã liên kết với tài khoản/ }).waitFor();
    }
  }
  checked('Browser accounts link their exact discovered test wallet through real SIWE signatures');
  const [creator, resolver, backer, community] = pages;
  const campaignService = app.get(require('../../dist/src/reward/reward-campaign.service').RewardCampaignService);
  const editions = app.get(require('../../dist/src/reward/reward-editions.service').RewardEditionsService);
  const draft = require('../../dist/src/reward/testing/editions-draft.fixture').editionsDraft(); draft.goal = '10000000'; draft.fundingDuration = 86400;
  const campaign = await campaignService.createDraft(actors[0].id, draft);
  const sample = await editions.uploadSample(campaign.id, actors[0].id, { buffer: png, mimetype: 'image/png', originalname: 'sample.png' });
  const [linked] = await db.select().from(schema.walletLinks).where(eq(schema.walletLinks.userId, actors[0].id));
  const now = (await client.getBlock()).timestamp;
  await editions.update(campaign.id, actors[0].id, { revision: 0, config: draft, preparation: { payoutWalletLinkId: linked.id, sampleIds: [sample.id],
    contentOutline: 'A comic with twelve illustrated chapters.', budgetPlan: 'Self-funded drawing and editorial work.', evidencePlan: 'Page proof followed by the complete final PDF.',
    releaseWindow: { start: new Date(Number(now + 86400n) * 1000).toISOString(), end: new Date(Number(now + 20n * 86400n) * 1000).toISOString() } } });
  await editions.freeze(campaign.id, actors[0].id, { revision: 1 }); await editions.submit(campaign.id, actors[0].id, { revision: 2 });
  await editions.openCommunityReview(campaign.id, actors[1].id);
  for (const page of [creator, backer]) {
    for (const route of [`creator/campaigns/${campaign.id}/batches`, `backer/entitlements/${campaign.id}/shipping`, `creator/entitlements/${campaign.id}/shipping`, `creator/entitlements/${campaign.id}/delivered`, `backer/entitlements/${campaign.id}/confirm`]) {
      const response = await page.request.post(`${apiUrl}/v1/reward/${route}`, { headers: { Origin: webOrigin }, data: { address: 'Rejected test address', tracking: 'Rejected test tracking' } });
      assert.equal(response.status(), 404);
    }
  }
  const physicalColumns = await db.$client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='reward_entitlements' AND column_name ~ 'shipping|tracking|delivered_at'");
  assert.equal(physicalColumns.rowCount, 0);
  checked('Authenticated browser requests cannot invoke retired physical APIs; active schema has no shipping or tracking columns');
  async function navigate(page, suffix = '') {
    await page.evaluate(hash => { location.hash = hash; }, `/reward/editions/${campaign.id}${suffix}`);
    try {
      await page.getByRole('tab', { name: 'Tổng quan (Folio)', exact: true }).waitFor();
    } catch (error) {
      await page.screenshot({ path: path.join(output, 'navigation-failure.png'), fullPage: true });
      fs.writeFileSync(path.join(output, 'navigation-failure.txt'), await page.locator('body').innerText());
      throw error;
    }
  }
  async function refreshPrivateCampaign(page, suffix = '') {
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => { location.hash = '/account'; });
    await page.getByText('Ví đã liên kết với tài khoản', { exact: true }).waitFor();
    const connect = page.getByRole('button', { name: /Connect Wallet|Kết nối ví/ });
    if (await connect.count() && await connect.first().isVisible()) {
      await connect.click();
      await page.getByRole('button', { name: /Editions Test Wallet/ }).click();
    }
    await page.getByText('Ví đã liên kết với tài khoản', { exact: true }).waitFor();
    await navigate(page, suffix);
    await page.getByRole('tab', { name: 'Tổng quan (Folio)', exact: true }).waitFor();
  }
  async function transact(page, name) {
    const previous = (await page.getByRole('status').allTextContents()).find(text => text.startsWith('Giao dịch đã được xác nhận và đồng bộ'));
    try {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(previous => [...document.querySelectorAll('[role=status]')].some(item => item.textContent.startsWith('Giao dịch đã được xác nhận và đồng bộ') && item.textContent !== previous), previous, { timeout: 30000 });
    } catch (error) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
      fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText());
      throw new Error(`${name}: ${await page.locator('[role=alert]').allTextContents()}`, { cause: error });
    }
  }
  await navigate(community); await community.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await community.getByLabel('Chi tiết cần kiểm tra').fill('Please verify the promised twelve chapters.');
  await community.getByRole('button', { name: 'Gửi phản hồi có tài khoản' }).click(); await community.getByText('Please verify the promised twelve chapters.', { exact: true }).waitFor();
  await resolver.evaluate(() => { location.hash = '/reward/resolver'; });
  await resolver.locator('summary').filter({ hasText: 'Phản hồi cộng đồng' }).click();
  await resolver.getByText('Please verify the promised twelve chapters.', { exact: true }).waitFor();
  await resolver.getByLabel(/Nhận xét thẩm định/).fill('Reviewed the frozen PDF terms, sample and community comment.');
  await resolver.getByRole('button', { name: 'Duyệt hồ sơ PDF', exact: true }).click();
  await resolver.getByRole('link', { name: 'Mở trang xử lý on-chain →' }).click();
  await transact(resolver, 'Ký duyệt đúng commitment trên chain');
  await navigate(creator, '/creator'); await transact(creator, 'Tạo campaign Editions trên chain');
  checked('Community feedback is visible before Resolver approves exact terms and Creator publishes a separate local campaign');
  const mint = await wallet(accounts[0]).writeContract({ address: tokenAddress, abi: token.abi, functionName: 'mint', args: [accounts[4], 10000000n] }); await client.waitForTransactionReceipt({ hash: mint });
  await navigate(backer); await transact(backer, 'Bắt đầu approve rồi pledge');
  assert.equal(await backer.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).count(), 0);
  await client.request({ method: 'evm_increaseTime', params: [86401] }); await client.request({ method: 'evm_mine' });
  await refreshPrivateCampaign(resolver, '/resolver'); await transact(resolver, 'Chốt kết quả khi hết hạn gây quỹ');
  checked('Browser token approval and fixed-price pledge produce canonical rights but no premature download');
  await refreshPrivateCampaign(creator, '/creator'); await creator.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  await creator.getByLabel(/Bằng chứng sản xuất riêng tư/).setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
  await creator.getByLabel(/Tóm tắt công khai/).fill('All twelve chapters are drawn and edited.');
  await creator.getByRole('button', { name: 'Lưu file và hash' }).click();
  await transact(creator, 'Gửi đúng hash này để Resolver duyệt');
  await refreshPrivateCampaign(resolver, '/resolver'); await resolver.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  await transact(resolver, 'Duyệt bằng chứng sản xuất');
  await refreshPrivateCampaign(creator, '/creator'); await creator.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('Twelve-chapter local comic acceptance fixture'); const pdfBytes = Buffer.from(await pdf.save());
  await creator.getByLabel(/PDF cuối riêng tư/).setInputFiles({ name: 'comic.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await creator.getByLabel(/Tóm tắt công khai/).fill('Final PDF includes the complete twelve-chapter comic.');
  await creator.getByRole('button', { name: 'Lưu file và hash' }).click();
  await transact(creator, 'Gửi đúng hash này để Resolver duyệt');
  await refreshPrivateCampaign(resolver, '/resolver'); await resolver.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click(); await transact(resolver, 'Duyệt PDF cuối');
  await refreshPrivateCampaign(backer);
  await backer.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await backer.getByText('Trao đổi thẩm định sau funding', { exact: true }).waitFor();
  await backer.getByLabel('Nội dung cần Creator làm rõ').fill('Please clarify how the final delivery evidence maps to the promised chapter sequence.');
  await backer.getByRole('button', { name: 'Mở trao đổi với Creator', exact: true }).click();
  await backer.getByText('Please clarify how the final delivery evidence maps to the promised chapter sequence.', { exact: true }).waitFor();
  await refreshPrivateCampaign(creator, '/creator'); await creator.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await creator.getByText('Trao đổi thẩm định sau funding', { exact: true }).waitFor();
  await creator.getByLabel('Phản hồi trong trao đổi').fill('I have checked the final delivery evidence and will clarify the chapter mapping in the release notes.');
  await creator.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await creator.getByText('I have checked the final delivery evidence and will clarify the chapter mapping in the release notes.', { exact: true }).waitFor();
  await refreshPrivateCampaign(backer); await backer.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await backer.getByText('I have checked the final delivery evidence and will clarify the chapter mapping in the release notes.', { exact: true }).waitFor();
  await backer.getByLabel('Nếu chưa được làm rõ, gửi yêu cầu Resolver').fill('The Creator response still needs an accountable Resolver review of the evidence mapping.');
  await backer.getByRole('button', { name: 'Gửi yêu cầu Resolver', exact: true }).click();
  await backer.getByText(/Resolver case · OPEN/).waitFor();
  const beforeConversationEntitlement = (await db.select().from(schema.editionsEntitlements))[0];
  const beforeConversationChain = (await db.select().from(schema.editionsChainCampaigns)).find(item => item.campaignId === campaign.id);
  await resolver.evaluate(() => { location.hash = '/reward/resolver'; });
  await resolver.getByRole('heading', { name: /Resolver cases/ }).waitFor();
  await resolver.getByText('Yêu cầu của Backer: The Creator response still needs an accountable Resolver review of the evidence mapping.', { exact: true }).waitFor();
  await resolver.getByLabel('Yêu cầu Creator làm rõ').fill('Creator, please provide one clear explanation of the evidence-to-chapter mapping.');
  await resolver.getByRole('button', { name: 'Yêu cầu Creator làm rõ', exact: true }).click();
  await resolver.getByText('Creator, please provide one clear explanation of the evidence-to-chapter mapping.', { exact: true }).waitFor();
  await resolver.getByLabel('Ghi chú kết luận').fill('Resolver reviewed the thread context and recorded the outcome without changing financial eligibility.');
  await resolver.getByRole('button', { name: 'Ghi outcome Resolver', exact: true }).click();
  await resolver.getByText('RESOLVED', { exact: true }).waitFor();
  const afterConversationEntitlement = (await db.select().from(schema.editionsEntitlements))[0];
  const afterConversationChain = (await db.select().from(schema.editionsChainCampaigns)).find(item => item.campaignId === campaign.id);
  assert.equal(afterConversationEntitlement.canonical, beforeConversationEntitlement.canonical);
  assert.equal(afterConversationEntitlement.refunded, beforeConversationEntitlement.refunded);
  assert.deepEqual(afterConversationChain.snapshot, beforeConversationChain.snapshot);
  checked('Canonical funded Backer-Creator review, Resolver escalation and off-chain outcome preserve entitlement and chain state');
  await refreshPrivateCampaign(backer);
  const downloadEvent = backer.waitForEvent('download'); await backer.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).click();
  const download = await downloadEvent; const file = path.join(output, 'downloaded.pdf'); await download.saveAs(file); assert.deepEqual(fs.readFileSync(file), pdfBytes);
  assert.equal((await db.select().from(schema.editionsEntitlements))[0].confirmedAt, null);
  await navigate(community); assert.equal(await community.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).count(), 0);
  checked('Separate production/PDF reviews enable exact-byte download only for Backer, without implied acceptance');
  await backer.screenshot({ path: path.join(output, 'backer-release.png'), fullPage: true });
  await backer.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await backer.getByLabel('Lý do / bằng chứng chi tiết gửi Resolver').fill('The last page is missing from the promised chapter sequence.');
  await transact(backer, 'Gửi báo cáo và challenge bằng ví đã pledge');
  await refreshPrivateCampaign(resolver, '/resolver'); await resolver.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await resolver.getByLabel('Lý do / bằng chứng chi tiết gửi Resolver').fill('The reported final page is missing; uphold the release challenge.');
  await transact(resolver, 'Chấp nhận: mở hoàn tiền toàn campaign');
  await refreshPrivateCampaign(backer);
  await transact(backer, 'Nhận hoàn tiền vào ví đã pledge');
  await backer.getByText('Bạn đã nhận hoàn tiền', { exact: false }).waitFor();
  assert.equal(await backer.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).count(), 0);
  checked('Browser challenge, Resolver decision and exact refund revoke download eligibility through canonical contract events');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', databaseName, deployment: address, observations, wallet: 'Injected local Anvil test wallet; not manual MetaMask', creatorVerification: 'Fixture only' }, null, 2));
}

async function main() {
  assert.match(await client.request({ method: 'web3_clientVersion' }), /anvil/i);
  const snapshot = await client.request({ method: 'evm_snapshot' });
  try {
    await runBrowserScenario();
  } finally {
    try {
      await browser?.close(); await vite?.close();
      if (db && storage) {
        const schema = require('../../dist/src/database/schema');
        for (const item of [...await db.select().from(schema.editionsEvidence), ...await db.select().from(schema.rewardEditionsSamples)]) await storage.remove(item.objectId);
      }
      await app?.close(); await db?.$client.end();
      if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
    } finally {
      assert.equal(await client.request({ method: 'evm_revert', params: [snapshot] }), true, 'Browser E2E must restore the shared local chain');
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
