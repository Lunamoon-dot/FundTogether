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
const { migrateCampaignDatabase } = require('./migrate-isolated.cjs');
const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.local/fundtogether/backend.env')));
const output = path.join(root, '.local/fundtogether/verification/campaign-browser');
const databaseName = `fundtogether_browser_test_${process.pid}`;
const webOrigin = 'http://127.0.0.1:5186';
const chain = defineChain({ id: 31339, name: 'Campaign test', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:9548'] } } });
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
  await migrateCampaignDatabase(root, { databaseUrl: database.toString(), expectedDatabaseName: databaseName });
  const accounts = (await wallet(`0x${'0'.repeat(40)}`).getAddresses()).map(value => value.toLowerCase());
  const token = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/MockUSDC.sol/MockUSDC.json')));
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out/FundTogetherCampaign.sol/FundTogetherCampaign.json')));
  const tokenReceipt = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: token.abi, bytecode: token.bytecode.object }) });
  const tokenAddress = tokenReceipt.contractAddress;
  const receipt = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: contract.abi, bytecode: contract.bytecode.object, args: [tokenAddress, accounts[1], accounts[2]] }) });
  const address = receipt.contractAddress;
  const { campaignAbiHash, campaignPolicyHash, parseDeploymentManifest } = require('../../dist/src/blockchain/deployment');
  const manifest = parseDeploymentManifest({ protocolKind: 'CAMPAIGNS', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548', abiVersion: 'campaigns-local-v6', abiHash: campaignAbiHash, policyHash: campaignPolicyHash,
    tokenDecimals: 6, confirmations: 1, contractAddress: address, tokenAddress, resolver: accounts[1], backupResolver: accounts[2], genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
    contractCodeHash: keccak256(await client.getCode({ address })), tokenCodeHash: keccak256(await client.getCode({ address: tokenAddress })), deploymentBlockNumber: String(receipt.blockNumber), deploymentBlockHash: receipt.blockHash });
  const manifestPath = path.join(output, 'deployment.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  Object.assign(process.env, env, { DATABASE_URL: database.toString(), WEB_ORIGIN: webOrigin, AUTH_DOMAIN: '127.0.0.1:5186', AUTH_CHAIN_ID: '31339',
    AUTH_SESSION_COOKIE_NAME: 'ft_campaigns_browser_test', NODE_ENV: 'test', FUNDTOGETHER_INDEXER_POLL_ENABLED: 'false', CAMPAIGNS_INDEXER_POLL_ENABLED: 'false', CAMPAIGNS_MANIFEST_PATH: manifestPath,
    S3_BUCKET: `${env.S3_BUCKET}-browser-test-${process.pid}`, LOG_LEVEL: 'silent' });
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../dist/src/app.module');
  app = await NestFactory.create(AppModule, { logger: false }); app.enableCors({ origin: webOrigin, credentials: true }); await app.listen(0, '127.0.0.1');
  const apiUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  db = app.get(require('../../dist/src/database/database.constants').DRIZZLE_DB);
  const schema = require('../../dist/src/database/schema');
  storage = app.get(require('../../dist/src/modules/evidence/evidence-storage.service').EvidenceStorageService);
  const password = 'local-browser-fixture-password';
  const passwordHash = await require('argon2').hash(password);
  const actors = await db.insert(schema.users).values(['creator', 'resolver', 'backer', 'backer2', 'community'].map(name => ({ email: `${name}@browser.test`, passwordHash }))).returning();
  await db.insert(schema.platformRoles).values({ userId: actors[1].id, roles: ['RESOLVER'] });
  process.env.VITE_FUNDTOGETHER_API_URL = apiUrl;
  const viteModule = await import(pathToFileURL(require.resolve('vite', { paths: [path.join(root, 'frontend')] })).href);
  vite = await viteModule.createServer({ root: path.join(root, 'frontend'), mode: 'fundtogether', server: { host: '127.0.0.1', port: 5186, strictPort: true }, logLevel: 'error' }); await vite.listen();
  const playwright = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli')] }));
  browser = await playwright.chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const pages = [];
  for (const [index, actor] of actors.entries()) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    if (index < 4) {
      const account = accounts[index === 0 ? 3 : index === 1 ? 1 : index === 2 ? 4 : 5];
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
        const info = { uuid: '6b83c7b8-477b-4fd5-9f5a-497014850dd2', name: 'Campaign Test Wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'test.campaign.wallet' };
        const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }));
        window.addEventListener('eip6963:requestProvider', announce); announce();
      }, { account });
    }
    const login = await context.request.post(`${apiUrl}/auth/login`, { headers: { Origin: webOrigin }, data: { email: actor.email, password } }); assert.equal(login.status(), 200, await login.text());
    const page = await context.newPage(); page.setDefaultTimeout(20000); pages.push(page);
    await page.goto(`${webOrigin}/#/account`);
    await page.getByRole('button', { name: /Đăng xuất/ }).waitFor();
    if (index < 4) {
      await page.getByRole('button', { name: /Connect Wallet|Kết nối ví/ }).click();
      await page.getByRole('button', { name: /Campaign Test Wallet/ }).click();
      await page.getByRole('button', { name: /Liên kết ví/ }).click();
      await page.getByRole('heading', { name: /Ví đã liên kết với tài khoản/ }).waitFor();
    }
  }
  checked('Browser accounts link their exact discovered test wallet through real SIWE signatures');
  const [creator, resolver, backer, backer2, community] = pages;
  const campaignWorkflowService = app.get(require('../../dist/src/modules/campaigns/workflow/campaign.service').CampaignWorkflowService);
  const campaignService = app.get(require('../../dist/src/modules/campaigns/services/campaign.service').CampaignService);
  const [creatorWalletLink] = await db.select().from(schema.walletLinks).where(eq(schema.walletLinks.userId, actors[0].id));
  await db.insert(schema.creatorProfiles).values({ userId: actors[0].id, displayName: 'Browser Test Artist', bio: 'Test-only creator fixture', ipDeclaration: 'Test-only publication rights declaration', originalWorkPledge: true, studioWalletLinkId: creatorWalletLink.id, status: 'VERIFIED' });
  const draft = require('../../dist/src/modules/campaigns/tests/fixtures/draft.fixture').campaignDraft(); draft.goal = '20000000'; draft.fundingDuration = 86400;
  const campaign = await campaignWorkflowService.createDraft(actors[0].id, draft);
  const sample = await campaignService.uploadSample(campaign.id, actors[0].id, { buffer: png, mimetype: 'image/png', originalname: 'sample.png' });
  const linked = creatorWalletLink;
  const now = (await client.getBlock()).timestamp;
   await campaignService.update(campaign.id, actors[0].id, { revision: 0, config: draft, preparation: { payoutWalletLinkId: linked.id, sampleIds: [sample.id],
     contentOutline: 'A comic with twelve illustrated chapters.', budgetPlan: 'Self-funded drawing and editorial work.', evidencePlan: 'Page proof followed by the complete final PDF.' } });
  await campaignService.freeze(campaign.id, actors[0].id, { revision: 1 }); await campaignService.submit(campaign.id, actors[0].id, { revision: 2 });
  await campaignService.openCommunityReview(campaign.id, actors[1].id);
  for (const page of [creator, backer, backer2]) {
    for (const route of [`creator/campaigns/${campaign.id}/batches`, `backer/entitlements/${campaign.id}/shipping`, `creator/entitlements/${campaign.id}/shipping`, `creator/entitlements/${campaign.id}/delivered`, `backer/entitlements/${campaign.id}/confirm`]) {
      const response = await page.request.post(`${apiUrl}/v1/fundtogether/${route}`, { headers: { Origin: webOrigin }, data: { address: 'Rejected test address', tracking: 'Rejected test tracking' } });
      assert.equal(response.status(), 404);
    }
  }
  const physicalColumns = await db.$client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='historical_entitlements' AND column_name ~ 'shipping|tracking|delivered_at'");
  assert.equal(physicalColumns.rowCount, 0);
  checked('Authenticated browser requests cannot invoke retired physical APIs; active schema has no shipping or tracking columns');
  const publicCampaign = id => `/campaigns/${encodeURIComponent(id)}`;
  const creatorCampaign = (id, tab) => `/campaigns/creator/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`;
  const resolverCampaign = (id, tab) => `/campaigns/resolver/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`;
  const adminCampaign = (id, tab) => `/admin/campaigns/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`;
  assert.deepEqual(
    [publicCampaign(campaign.id), creatorCampaign(campaign.id), resolverCampaign(campaign.id), adminCampaign(campaign.id)],
    [`/campaigns/${campaign.id}`, `/campaigns/creator/${campaign.id}`, `/campaigns/resolver/${campaign.id}`, `/admin/campaigns/${campaign.id}`],
  );
  async function navigate(page, route = publicCampaign(campaign.id)) {
    await page.evaluate(hash => { location.hash = hash; }, route);
    try {
      await page.getByRole('tab', { name: 'Tổng quan (Folio)', exact: true }).waitFor();
    } catch (error) {
      await page.screenshot({ path: path.join(output, 'navigation-failure.png'), fullPage: true });
      fs.writeFileSync(path.join(output, 'navigation-failure.txt'), await page.locator('body').innerText());
      throw error;
    }
  }
  async function refreshPrivateCampaign(page, workspace = 'public', tab) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => { location.hash = '/account'; });
    await page.getByText('Ví đã liên kết với tài khoản', { exact: true }).waitFor();
    const connect = page.getByRole('button', { name: /Connect Wallet|Kết nối ví/ });
    if (await connect.count() && await connect.first().isVisible()) {
      await connect.click();
      await page.getByRole('button', { name: /Campaign Test Wallet/ }).click();
    }
    await page.getByText('Ví đã liên kết với tài khoản', { exact: true }).waitFor();
    const route = workspace === 'creator'
      ? creatorCampaign(campaign.id, tab)
      : workspace === 'resolver'
        ? resolverCampaign(campaign.id, tab)
        : workspace === 'admin'
          ? adminCampaign(campaign.id, tab)
          : publicCampaign(campaign.id);
    await navigate(page, route);
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
  await navigate(community);
  await community.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  const feedbackDialog = community.getByRole('dialog');
  await feedbackDialog.getByLabel('Nội dung góp ý').fill('Please verify the promised twelve chapters.');
  await feedbackDialog.getByRole('button', { name: 'Gửi góp ý', exact: true }).click();
  await community.getByText('Please verify the promised twelve chapters.', { exact: true }).waitFor();
  await resolver.evaluate(() => { location.hash = '/campaigns/resolver'; });
  await resolver.locator('summary').filter({ hasText: 'Phản hồi cộng đồng' }).click();
  await resolver.getByText('Please verify the promised twelve chapters.', { exact: true }).waitFor();
  await resolver.getByLabel(/Nhận xét thẩm định/).fill('Reviewed the frozen PDF terms, sample and community comment.');
  await resolver.getByRole('button', { name: 'Duyệt hồ sơ PDF', exact: true }).click();
  await resolver.getByRole('link', { name: 'Mở trang xử lý on-chain →' }).click();
  await transact(resolver, 'Ký duyệt đúng commitment trên chain');
  await navigate(creator, creatorCampaign(campaign.id)); await transact(creator, 'Tạo campaign trên chain');
  checked('Community feedback is visible before Resolver approves exact terms and Creator publishes a separate local campaign');
  const mintBacker1 = await wallet(accounts[0]).writeContract({ address: tokenAddress, abi: token.abi, functionName: 'mint', args: [accounts[4], 10000000n] }); await client.waitForTransactionReceipt({ hash: mintBacker1 });
  const mintBacker2 = await wallet(accounts[0]).writeContract({ address: tokenAddress, abi: token.abi, functionName: 'mint', args: [accounts[5], 20000000n] }); await client.waitForTransactionReceipt({ hash: mintBacker2 });
  await navigate(backer); await transact(backer, 'Bắt đầu approve rồi pledge');
  await navigate(backer2); await backer2.getByRole('spinbutton').fill('2'); await transact(backer2, 'Bắt đầu approve rồi pledge');
  assert.equal(await backer.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).count(), 0);
  await client.request({ method: 'evm_increaseTime', params: [86401] }); await client.request({ method: 'evm_mine' });
  await refreshPrivateCampaign(resolver, 'resolver'); await transact(resolver, 'Chốt kết quả khi hết hạn gây quỹ');
  checked('Unequal canonical pledges produce rights without premature download');
  await refreshPrivateCampaign(creator, 'creator'); await creator.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  await creator.getByLabel(/Bằng chứng sản xuất riêng tư/).setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
  await creator.getByLabel(/Tóm tắt công khai/).fill('All twelve chapters are drawn and edited.');
  await creator.getByRole('button', { name: 'Lưu file và hash' }).click();
  await transact(creator, 'Gửi đúng hash này để Resolver duyệt');
  await refreshPrivateCampaign(resolver, 'resolver'); await resolver.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  await transact(resolver, 'Duyệt bằng chứng sản xuất');
  await refreshPrivateCampaign(creator, 'creator'); await creator.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  const releaseTimestamp = Number((await client.getBlock()).timestamp) + 7 * 86400;
  const releaseDate = new Date(releaseTimestamp * 1000).toISOString().slice(0, 10);
  await creator.getByLabel('Hạn cam kết phát hành PDF (UTC)').fill(releaseDate);
  await transact(creator, 'Xác nhận hoàn thành campaign');
  await refreshPrivateCampaign(creator, 'creator'); await creator.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click();
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('Twelve-chapter local comic acceptance fixture'); const pdfBytes = Buffer.from(await pdf.save());
  await creator.getByLabel(/PDF cuối riêng tư/).setInputFiles({ name: 'comic.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await creator.getByLabel(/Tóm tắt công khai/).fill('Final PDF includes the complete twelve-chapter comic.');
  await creator.getByRole('button', { name: 'Lưu file và hash' }).click();
  await transact(creator, 'Gửi đúng hash này để Resolver duyệt');
  await refreshPrivateCampaign(resolver, 'resolver'); await resolver.getByRole('tab', { name: 'Sản xuất & Bằng chứng', exact: true }).click(); await transact(resolver, 'Duyệt PDF cuối');
  await refreshPrivateCampaign(backer);
  await backer.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await backer.getByText('Trao đổi thẩm định sau funding', { exact: true }).waitFor();
  await backer.getByLabel('Nội dung cần Creator làm rõ').fill('Please clarify how the final delivery evidence maps to the promised chapter sequence.');
  await backer.getByRole('button', { name: 'Mở trao đổi với Creator', exact: true }).click();
  await backer.getByText('Please clarify how the final delivery evidence maps to the promised chapter sequence.', { exact: true }).waitFor();
  await refreshPrivateCampaign(creator, 'creator'); await creator.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await creator.getByText('Trao đổi thẩm định sau funding', { exact: true }).waitFor();
  await creator.getByLabel('Phản hồi trong trao đổi').fill('I have checked the final delivery evidence and will clarify the chapter mapping in the release notes.');
  await creator.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await creator.getByText('I have checked the final delivery evidence and will clarify the chapter mapping in the release notes.', { exact: true }).waitFor();
  await refreshPrivateCampaign(backer); await backer.getByRole('tab', { name: 'Góp ý & Thẩm định', exact: true }).click();
  await backer.getByText('I have checked the final delivery evidence and will clarify the chapter mapping in the release notes.', { exact: true }).waitFor();
  await backer.getByLabel('Nếu chưa được làm rõ, gửi yêu cầu Resolver').fill('The Creator response still needs an accountable Resolver review of the evidence mapping.');
  await backer.getByRole('button', { name: 'Gửi yêu cầu Resolver', exact: true }).click();
  await backer.getByText(/Resolver case · OPEN/).waitFor();
  const beforeConversationEntitlement = (await db.select().from(schema.campaignEntitlements))[0];
  const beforeConversationChain = (await db.select().from(schema.campaignChainCampaigns)).find(item => item.campaignId === campaign.id);
  await resolver.evaluate(() => { location.hash = '/campaigns/resolver'; });
  await resolver.getByRole('heading', { name: /Resolver cases/ }).waitFor();
  await resolver.getByText('Yêu cầu của Backer: The Creator response still needs an accountable Resolver review of the evidence mapping.', { exact: true }).waitFor();
  await resolver.getByLabel('Yêu cầu Creator làm rõ').fill('Creator, please provide one clear explanation of the evidence-to-chapter mapping.');
  await resolver.getByRole('button', { name: 'Yêu cầu Creator làm rõ', exact: true }).click();
  await resolver.getByText('Creator, please provide one clear explanation of the evidence-to-chapter mapping.', { exact: true }).waitFor();
  await resolver.getByLabel('Ghi chú kết luận').fill('Resolver reviewed the thread context and recorded the outcome without changing financial eligibility.');
  await resolver.getByRole('button', { name: 'Ghi outcome Resolver', exact: true }).click();
  await resolver.getByText('RESOLVED', { exact: true }).waitFor();
  const afterConversationEntitlement = (await db.select().from(schema.campaignEntitlements))[0];
  const afterConversationChain = (await db.select().from(schema.campaignChainCampaigns)).find(item => item.campaignId === campaign.id);
  assert.equal(afterConversationEntitlement.canonical, beforeConversationEntitlement.canonical);
  assert.equal(afterConversationEntitlement.refunded, beforeConversationEntitlement.refunded);
  assert.deepEqual(afterConversationChain.snapshot, beforeConversationChain.snapshot);
  checked('Canonical funded Backer-Creator review, Resolver escalation and off-chain outcome preserve entitlement and chain state');
  await refreshPrivateCampaign(backer);
  try {
    const downloadEvent = backer.waitForEvent('download'); await backer.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).click();
    const download = await downloadEvent; const file = path.join(output, 'downloaded.pdf'); await download.saveAs(file); assert.deepEqual(fs.readFileSync(file), pdfBytes);
  } catch (error) {
    await backer.screenshot({ path: path.join(output, 'download-failure.png'), fullPage: true });
    fs.writeFileSync(path.join(output, 'download-failure.txt'), await backer.locator('body').innerText());
    throw error;
  }
  assert.equal((await db.select().from(schema.campaignEntitlements))[0].confirmedAt, null);
  await navigate(community); assert.equal(await community.getByRole('button', { name: 'Kiểm tra và tải PDF riêng tư' }).count(), 0);
  checked('Separate production/PDF reviews enable exact-byte download only for Backer, without implied acceptance');
  await client.request({ method: 'evm_increaseTime', params: [7 * 86400 + 1] }); await client.request({ method: 'evm_mine' });
  await refreshPrivateCampaign(creator, 'creator');
  await creator.getByRole('heading', { name: 'Gửi hồ sơ hoàn thành', exact: true }).waitFor();
  await creator.getByPlaceholder('Tiêu đề hồ sơ').fill('Completion dossier for reviewed PDF');
  await creator.getByPlaceholder('Tóm tắt kết quả hoàn thành').fill('The reviewed PDF is complete and ready for Resolver completion review.');
  await creator.getByPlaceholder('Lý do đề nghị chốt hoàn thành').fill('The production evidence and final PDF were reviewed; the campaign is ready to settle the frozen goal.');
  await creator.locator('input[type="file"]').last().setInputFiles({ name: 'completion-evidence.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await transact(creator, 'Lưu hồ sơ và ký requestCompletion');
  await creator.getByText(/Đã gửi canonical|Chờ Resolver xem hồ sơ/, { exact: false }).waitFor();
  await refreshPrivateCampaign(backer);
  await backer.getByText('Completion dossier for reviewed PDF', { exact: true }).waitFor();
  const completionDownloadEvent = backer.waitForEvent('download'); await backer.getByRole('button', { name: /Xem file completion-evidence\.pdf/ }).click();
  const completionDownload = await completionDownloadEvent; const completionStream = await completionDownload.createReadStream(); const completionChunks = []; for await (const chunk of completionStream) completionChunks.push(chunk);
  assert.deepEqual(Buffer.concat(completionChunks), pdfBytes);
  assert.equal(await backer.getByText(/Không nhập số tiền hoặc địa chỉ nhận/).count(), 0, 'Backer must not see Creator-only completion form');
  checked('Creator submits a private completion dossier without amount/destination; Backer can inspect and download it');
  await refreshPrivateCampaign(resolver, 'resolver');
  await resolver.getByRole('heading', { name: 'Quyết định Resolver', exact: true }).waitFor();
  await resolver.getByPlaceholder('Lý do quyết định').fill('Resolver verified the completion dossier and supporting file; settlement may proceed.');
  await transact(resolver, 'Ghi quyết định và ký on-chain');
  await resolver.getByText(/Campaign đã hoàn thành canonical/, { exact: false }).waitFor();
  const settled = await client.readContract({ address, abi: contract.abi, functionName: 'campaign', args: [0n] });
  assert.equal(Number(settled.state), 6, 'Campaign must be COMPLETED after canonical completion approval');
  assert.equal(settled.raised, 30000000n, 'Raised amount must preserve both unequal pledges');
  assert.equal(settled.goal, 20000000n, 'Goal must remain frozen');
  assert.equal(settled.surplusPool, 10000000n, 'Surplus must equal raised minus goal');
  assert.equal(settled.escrowed, 10000000n, 'Completion must leave surplus escrowed for claims');
  const creatorBalanceAfterCompletion = await client.readContract({ address: tokenAddress, abi: token.abi, functionName: 'balanceOf', args: [accounts[3]] });
  assert.equal(creatorBalanceAfterCompletion, 20000000n, 'Creator must receive exactly goal');
  await refreshPrivateCampaign(backer); await transact(backer, 'Nhận về ví của tôi');
  await refreshPrivateCampaign(backer2); await transact(backer2, 'Gửi cho Creator');
  const settledAfterClaims = await client.readContract({ address, abi: contract.abi, functionName: 'campaign', args: [0n] });
  assert.equal(settledAfterClaims.surplusClaimed, 10000000n, 'All surplus must be claimed exactly once');
  assert.equal(settledAfterClaims.escrowed, 0n, 'Escrow must be empty after all surplus claims');
  checked('Resolver approval pays exactly goal; unequal Backers claim the full raised-minus-goal surplus pro-rata with refund or Creator donation choices');
  await backer.screenshot({ path: path.join(output, 'backer-release.png'), fullPage: true });
  assert.equal(contract.abi.some(item => item.type === 'function' && item.name === 'payout'), false, 'Generic permissionless payout must not exist in the ABI');
  checked('The browser path has no generic payout action; refund/challenge branches remain covered by the contract suite');
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
        for (const item of [...await db.select().from(schema.campaignEvidence), ...await db.select().from(schema.campaignSamples)]) await storage.remove(item.objectId);
      }
      await app?.close(); await db?.$client.end();
      if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
    } finally {
      assert.equal(await client.request({ method: 'evm_revert', params: [snapshot] }), true, 'Browser E2E must restore the shared local chain');
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
