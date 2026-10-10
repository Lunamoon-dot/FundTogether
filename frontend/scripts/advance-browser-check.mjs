import fs from 'node:fs'
const fixture = JSON.parse(fs.readFileSync(new URL('../../.local/workflow-b/browser-fixture.json', import.meta.url)))
async function check(page, f) {
  let workflow = f.workflow, draft = f.draft, savedEvidence = f.evidence, posts = [], scenario = 'plan'
  const errors = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  const assert = (ok, message) => { if (!ok) throw new Error(message); checks.push(message) }
  await page.route('http://localhost:3001/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method()
    let body, status = 200
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' } })
    if (path === '/auth/session') body = f.session
    else if (path === '/organizations') body = f.organizations
    else if (path.endsWith('/workflow')) body = workflow
    else if (path.endsWith('/original')) body = f.original
    else if (path.endsWith('/redacted')) body = f.publication
    else if (path.endsWith('/evidence')) {
      if (method === 'PATCH') { posts.push(req.postDataJSON()); status = 409; body = { message: 'Evidence revision changed; reload' } }
      else body = savedEvidence
    } else if (path.includes('/v1/advance/organizations/') && path.endsWith('/campaigns')) {
      if (method === 'POST') {
        const content = req.postDataJSON(); posts.push(content); status = 201
        draft = { ...f.draft, content, title: content.title, description: content.description, frozen: false, submissionPlan: null, goalUnits: '3300000000' }; body = draft
      } else body = [{ id: draft.id, title: draft.title, revision: draft.revision, status: draft.status, createdAt: draft.createdAt, frozenAt: draft.frozen ? draft.updatedAt : null }]
    } else if (path === `/v1/advance/campaigns/${f.draft.id}`) body = draft
    else { status = 501; body = { message: `Unmocked UI request ${method} ${path}` } }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true' } })
  })
  const base = `http://localhost:5174/#/organizations/${f.draft.organizationId}/workspace/campaigns`
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto('about:blank'); await page.goto(base + '/new')
  await page.getByRole('heading', { name: 'Tạo campaign mua và trao quà' }).waitFor()
  assert(await page.getByLabel('Ngân sách (USDC)', { exact: true }).inputValue() === '2200', 'G1 budget2200 visible')
  assert(await page.getByRole('combobox', { name: 'Kênh tiếp nhận', exact: true }).inputValue() === 'INSTITUTION', 'G1 institution channel')
  const checkbox = await page.locator('.advance-checks input[type=checkbox]').first().boundingBox()
  assert(checkbox.width === 18 && checkbox.height === 18, 'Checklist checkbox size18px')
  await page.getByLabel('Mẫu khởi đầu').selectOption('3')
  assert(await page.getByLabel('Ngân sách (USDC)', { exact: true }).count() === 3, 'G2 three stages')
  assert(await page.getByRole('combobox', { name: 'Kênh tiếp nhận', exact: true }).inputValue() === 'DIRECT', 'G2 direct channel')
  await page.getByLabel('Tên campaign', { exact: true }).fill('Synthetic browser G2')
  await page.getByLabel('Mục tiêu và hoạt động', { exact: true }).fill('Synthetic UI check only')
  await page.getByLabel('Phạm vi đối tượng nhận', { exact: true }).fill('Three synthetic cohorts')
  await page.getByLabel('Căn cứ tổ chức đủ điều kiện thực hiện', { exact: true }).fill('Controlled fixture')
  for (const field of await page.getByRole('textbox', { name: 'Công việc cần hoàn thành', exact: true }).all()) await field.fill('Purchase and handover on a separate date')
  await page.getByRole('heading', { name: 'Tạo campaign mua và trao quà' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-g2-wizard.png' })
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click()
  await page.getByRole('heading', { name: 'Synthetic browser G2', exact: true }).waitFor()
  assert(posts[0].stages.every(s => s.budgetUnits === '1100000000' && s.targetPackages === 50), 'Wizard posts integer base units and G2 counts')
  draft = f.draft; scenario = 'frozen'; await page.reload()
  await page.getByRole('heading', { name: 'Hồ sơ thực hiện' }).waitFor()
  await page.getByText(/Hash bản đã che:/).waitFor()
  assert(await page.getByRole('button', { name: 'Nhận 2200 USDC cho đợt 1', exact: true }).isDisabled(), 'Claim blocked without connected linked wallet/eligibility')
  assert(await page.getByRole('button', { name: /Nộp hồ sơ version/ }).count() === 0, 'Submitted version has no duplicate submit CTA')
  assert(await page.getByRole('link', { name: 'Sửa kế hoạch', exact: true }).count() === 0, 'Frozen plan is read-only')
  await page.getByRole('heading', { name: 'Hồ sơ thực hiện' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-frozen-evidence.png' })
  workflow = JSON.parse(JSON.stringify(f.workflow)); workflow.snapshot.campaign.state = 'EXECUTING'; workflow.workflow.state = 'EXECUTING'
  workflow.snapshot.stages[0].latestVersion = '0'; workflow.snapshot.stages[0].state = 'ADVANCED'; workflow.snapshot.stages[0].submissions = []; workflow.packages = []
  scenario = 'editing'; await page.reload()
  await page.getByRole('button', { name: 'Lưu báo cáo', exact: true }).waitFor()
  await page.getByRole('textbox', { name: 'Tóm tắt thực hiện', exact: true }).fill('UNSAVED_SYNTHETIC_EDIT')
  await page.getByRole('button', { name: 'Lưu báo cáo', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Evidence revision changed; reload' }).waitFor()
  assert(posts.at(-1).expectedRevision === f.evidence.revision, 'Evidence save uses expected revision')
  assert(posts.at(-1).content.documents.every(d => d.relatesToCriterionIds.length > 0), 'Evidence references derive from selected original documents')
  await page.getByRole('button', { name: 'Bỏ chỉnh sửa chưa lưu và tải lại revision' }).click()
  await page.waitForFunction(summary => document.querySelector('form.advance-plan-form textarea')?.value === summary, f.evidence.content.report.summary)
  assert(await page.getByRole('textbox', { name: 'Tóm tắt thực hiện', exact: true }).inputValue() === f.evidence.content.report.summary, 'Conflict reload discards unsaved input')
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('heading', { name: 'Hồ sơ thực hiện' }).scrollIntoViewIfNeeded()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile page has no horizontal overflow')
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-evidence-mobile.png' })
  assert(errors.length === 0, `No React runtime errors (${scenario})`)
  return { checkedAt: new Date().toISOString(), deploymentId: f.workflow.plan.context.deploymentId,
    kind: 'mocked-API-browser-UI', status: 'PASS', checks, manualWalletSigning: false, realFinancialWrites: false }
}
fs.writeFileSync(new URL('../../.local/workflow-b/ui-check.js', import.meta.url), `async page => (${check.toString()})(page, ${JSON.stringify(fixture)})`)
console.log('UI fixture script prepared in ignored .local/workflow-b/ui-check.js')
