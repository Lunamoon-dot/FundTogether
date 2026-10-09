import fs from 'node:fs'
const fixture = JSON.parse(fs.readFileSync(new URL('../../.local/workflow-b/browser-fixture.json', import.meta.url)))
async function check(page, f) {
  const checks = [], errors = [], writes = []
  const assert = (value, label) => { if (!value) throw new Error(label); checks.push(label) }
  page.on('pageerror', error => errors.push(error.message))
  let session = f.resolverSession, workflow = JSON.parse(JSON.stringify(f.resolverWorkflow)), detail = f.publicDetail, rights = { context: f.workflow.plan.context, items: [] }, outage = false
  workflow.snapshot.campaign.state = 'EVIDENCE_REVIEW'; workflow.workflow.state = 'EVIDENCE_REVIEW'; workflow.snapshot.stages[0].state = 'EVIDENCE_REVIEW'
  await page.unroute('http://localhost:3001/**')
  await page.route('http://localhost:3001/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    let body, status = 200
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' } })
    if (path === '/auth/session') body = session
    else if (path.endsWith('/workflow')) body = workflow
    else if (path.endsWith('/verifications')) body = f.verificationHistory
    else if (path === '/v1/advance/internal/organizations') body = f.organizations.map(o => ({ id: o.id, name: o.name, description: o.description, verificationStatus: o.verificationStatus }))
    else if (path.endsWith('/original')) body = f.original
    else if (path.endsWith('/redacted')) body = f.publication
    else if (path.includes('/public/records/')) body = f.publicRecord
    else if (path.endsWith('/events')) body = f.events
    else if (path.includes('/refunds')) body = rights
    else if (path.includes('/public/evidence/')) { body = outage ? { message: 'Synthetic storage unavailable' } : { publicHash: f.publication.hash, manifestBytes: f.publication.manifestBytes }; status = outage ? 503 : 200 }
    else if (path === '/v1/advance/public/campaigns') body = { context: workflow.plan.context, items: [{ campaignId: detail.snapshot.campaignId, metadataId: detail.metadataId, title: detail.title, workflow: detail.workflow }] }
    else if (path.includes('/v1/advance/public/campaigns/')) body = detail
    else { status = 501; body = { message: `Unmocked ${method} ${path}` } }
    if (method !== 'GET') writes.push({ method, path })
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true' } })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('about:blank'); await page.goto(`http://localhost:5174/#/internal/campaigns/${workflow.metadataId}`)
  await page.getByRole('heading', { name: 'Quyết định resolver', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Đọc bản gốc', exact: true }).first().waitFor()
  assert(await page.getByRole('button', { name: 'Đọc bản gốc', exact: true }).count() === 5, 'Reviewer sees five private originals')
  assert(await page.getByRole('button', { name: 'Đọc bản đã che', exact: true }).count() === 5, 'Reviewer sees corresponding redacted files')
  await page.getByRole('combobox', { name: 'Kết luận tổng hợp', exact: true }).selectOption('MET')
  await page.getByRole('textbox', { name: 'Chi từ campaign được chấp nhận (USDC)', exact: true }).fill('2150')
  await page.getByRole('textbox', { name: 'Lý do quyết định', exact: true }).fill('Synthetic review fixture')
  await page.getByRole('textbox', { name: 'Nguồn kiểm tra · mỗi dòng: căn cứ | tham chiếu', exact: true }).fill('Control | fixture-source')
  await page.getByRole('textbox', { name: 'Phạm vi kết luận', exact: true }).fill('Synthetic planned cohort')
  await page.getByRole('textbox', { name: 'Giới hạn kiểm tra', exact: true }).fill('UI fixture only')
  await page.getByRole('checkbox', { name: 'Tôi đã kiểm tra và không có xung đột lợi ích với campaign.' }).check()
  await page.getByRole('checkbox', { name: 'Nội dung quyết định được công khai; tôi đã loại dữ liệu nhạy cảm khỏi lý do và nguồn tham chiếu.' }).check()
  for (const group of await page.locator('.advance-plan-form fieldset').all()) {
    await group.getByRole('textbox', { name: 'Lý do theo tiêu chí', exact: true }).fill('Observed source')
    await group.getByRole('textbox', { name: 'Giới hạn theo tiêu chí', exact: true }).fill('Controlled sample')
    await group.getByRole('textbox', { name: 'Nguồn đối chiếu · mỗi dòng một nguồn', exact: true }).fill('Source checked')
    for (const checkbox of await group.getByRole('checkbox').all()) await checkbox.check()
  }
  await page.getByText('Chỉ kết luận đạt khi mọi tiêu chí đều đạt.', { exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Kết luận hồ sơ thực hiện', exact: true }).isDisabled(), 'MET blocked when criterion remains INCONCLUSIVE')
  for (const select of await page.getByRole('combobox', { name: 'Kết luận tiêu chí', exact: true }).all()) await select.selectOption('MET')
  assert(await page.getByText('Chỉ kết luận đạt khi mọi tiêu chí đều đạt.', { exact: true }).count() === 0, 'All-MET assessment clears criterion gate')
  assert(await page.getByRole('button', { name: 'Kết luận hồ sơ thực hiện', exact: true }).isDisabled(), 'Even all-MET cannot sign without linked connected resolver wallet')
  await page.getByRole('heading', { name: 'Quyết định resolver', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-review.png' })
  await page.goto('http://localhost:5174/#/internal/organizations')
  await page.getByText('Thao tác này cần account role ADMIN. RESOLVER không tự có quyền staff.', { exact: true }).waitFor()
  assert(true, 'RESOLVER account does not get ADMIN verification form')
  session = { ...f.resolverSession, roles: ['ADMIN'] }; await page.reload()
  await page.getByRole('link', { name: f.organizations[0].name, exact: true }).click()
  await page.getByRole('heading', { name: 'Hồ sơ xác thực tổ chức', exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Lưu hồ sơ xác thực off-chain', exact: true }).count() === 1, 'ADMIN sees off-chain verification form')
  assert(await page.getByRole('button', { name: 'Connect Wallet', exact: true }).count() === 0, 'Staff verification has no wallet-sign transaction')
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-verification.png' })
  session = { ...f.session, userId: 'synthetic-donor-browser', wallets: [] }
  await page.goto(`http://localhost:5174/#/campaigns/${detail.snapshot.campaignId}`); await page.reload()
  await page.getByRole('heading', { name: 'Bằng chứng và quyết định', exact: true }).waitFor()
  assert(await page.getByText('Escrow còn giữ · E', { exact: true }).locator('..').innerText() === 'Escrow còn giữ · E\n0 USDC', 'G1 after advance public escrow is0')
  assert(await page.getByRole('button', { name: /Tài liệu công khai 1/ }).count() === 1, 'Public reader gets redacted evidence')
  assert(await page.getByRole('button', { name: 'Đọc bản gốc', exact: true }).count() === 0, 'Public page exposes no original download')
  assert(await page.getByRole('button', { name: 'Mở case', exact: true }).isDisabled(), 'Non-contributor case button disabled')
  outage = true; await page.reload()
  await page.getByText(/Storage không sẵn sàng không tự chứng minh đạt/).waitFor()
  assert(true, 'Public storage outage gives version-bound case/STOP guidance')
  outage = false; detail = JSON.parse(JSON.stringify(f.publicDetail)); detail.snapshot.campaign.state = 'STOPPED'; detail.snapshot.campaign.refundSnapshotted = true
  detail.workflow.state = 'STOPPED'; rights.items = [{ campaignId: detail.snapshot.campaignId, metadataId: detail.metadataId, wallet: f.workflow.plan.organizer,
    contribution: '2200000000', base: '0', supplement: '0', baseConsumed: false, supplementPaid: '0', basePool: '0', supplementPool: '0', claimable: true, checkpoint: detail.snapshot.checkpoint }]
  await page.reload(); await page.getByRole('heading', { name: 'Hoàn tiền sau kết thúc', exact: true }).waitFor()
  await page.getByText(/Hiện không có token để nhận/).waitFor()
  assert(await page.getByRole('button', { name: 'Ghi nhận quyền base bằng 0', exact: true }).isDisabled(), 'Zero base is labelled with no promise of returning2200')
  detail.snapshot.campaign.returned = '110000000'; detail.snapshot.campaign.custody = '110000000'; detail.snapshot.campaign.supplementPool = '110000000'
  rights.items[0] = { ...rights.items[0], baseConsumed: true, supplementPool: '110000000', supplement: '110000000' }
  await page.reload(); await page.getByRole('button', { name: 'Nhận 110 USDC refund', exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Nhận 110 USDC refund', exact: true }).isDisabled(), 'Late supplement shown after consumed base; wrong/unconnected wallet cannot claim')
  await page.getByRole('heading', { name: 'Hoàn tiền sau kết thúc', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-refund.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Public/refund mobile layout has no horizontal overflow')
  assert(writes.length === 0, 'No financial/API mutation submitted from blocked controls')
  assert(errors.length === 0, 'No React runtime errors in staff/reviewer/public/refund')
  return { kind: 'mocked-API-browser-F4-F6', status: 'PASS', checks, realWalletSigning: false, realReviewDecision: false }
}
fs.writeFileSync(new URL('../../.local/workflow-b/ui-review-check.js', import.meta.url), `async page => (${check.toString()})(page, ${JSON.stringify(fixture)})`)
console.log('Reviewer/public/refund fixture script prepared')
