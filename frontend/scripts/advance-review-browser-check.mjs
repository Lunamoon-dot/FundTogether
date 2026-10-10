import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const fixture = JSON.parse(fs.readFileSync(new URL('../../.local/workflow-b/browser-fixture.json', import.meta.url)))
const { profile, checks, documentBytes } = createRequire(import.meta.url)('../../backend/scripts/workflow-b/organization-onboarding-fixture.cjs')
const hash = bytes => '0x' + createHash('sha256').update(bytes).digest('hex')
const approvedRecord = fixture.verificationHistory.find(record => record.status === 'VERIFIED')
if (!approvedRecord) throw new Error('Browser fixture needs a synthetic verification record')
const submittedAt = '2026-10-09T00:00:00Z', requestId = '00000000-0000-4000-8000-000000000011', documentId = '00000000-0000-4000-8000-000000000020'
const document = { id: documentId, organizationId: fixture.draft.organizationId, requestId, kind: 'IDENTITY', originalName: 'synthetic-organization.pdf',
  mediaType: 'application/pdf', byteSize: documentBytes().length, hash: hash(documentBytes()), uploadedBy: fixture.session.userId, createdAt: submittedAt }
const content = { profile, documentIds: [documentId], responseToReview: 'Synthetic authority source checked' }
const snapshotBytes = JSON.stringify({ schema: 'organization-request.v1', requestId, organizationId: fixture.draft.organizationId,
  policyId: 'organization-local-pilot-v1', submittedAt, submittedBy: fixture.session.userId, declaration: true, content,
  wallet: { address: fixture.workflow.plan.organizer, chainId: '31338' }, documents: [document] })
fixture.approvedOrganizationRequest = { id: requestId, organizationId: fixture.draft.organizationId, status: 'APPROVED', revision: 4, content,
  policyId: 'organization-local-pilot-v1', snapshotBytes, snapshotHash: hash(snapshotBytes), submittedAt, reviewedAt: submittedAt,
  reviewedBy: approvedRecord.checkedBy, reviewNote: 'Synthetic dossier accepted', missingItems: [], verificationRecordId: approvedRecord.id,
  createdBy: fixture.session.userId, createdAt: submittedAt, updatedAt: submittedAt, documents: [document] }
fixture.organizationDocumentBytes = documentBytes().toString('base64')
const reportBytes = JSON.stringify({ ...JSON.parse(approvedRecord.reportBytes), schemaVersion: 'advance.organization-verification.v2', request: { id: requestId, snapshotHash: hash(snapshotBytes), checks } })
fixture.verificationHistory = [{ ...approvedRecord, reportBytes, hash: hash(reportBytes) }]
fixture.pendingOrganizationRequest = { ...fixture.approvedOrganizationRequest, id: '00000000-0000-4000-8000-000000000012', status: 'UNDER_REVIEW',
  reviewedAt: null, reviewedBy: null, reviewNote: null, verificationRecordId: null }
fixture.pendingOrganizationRequest.snapshotBytes = JSON.stringify({ ...JSON.parse(snapshotBytes), requestId: fixture.pendingOrganizationRequest.id })
fixture.pendingOrganizationRequest.snapshotHash = hash(fixture.pendingOrganizationRequest.snapshotBytes)
async function check(page, f) {
  const checks = [], errors = [], writes = [], unmocked = []
  const assert = (value, label) => { if (!value) throw new Error(label); checks.push(label) }
  page.on('pageerror', error => errors.push(error.message))
  let session = f.resolverSession, workflow = JSON.parse(JSON.stringify(f.resolverWorkflow)), detail = f.publicDetail, rights = { context: f.workflow.plan.context, items: [] }, outage = false
  let dossierFailure = '', dossierReads = 0
  let releaseDossier
  const approved = f.approvedOrganizationRequest
  const cors = { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true' }
  workflow.snapshot.campaign.state = 'EVIDENCE_REVIEW'; workflow.workflow.state = 'EVIDENCE_REVIEW'; workflow.snapshot.stages[0].state = 'EVIDENCE_REVIEW'
  await page.unroute('http://localhost:3001/**')
  await page.route('http://localhost:3001/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    let body, status = 200
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' } })
    if (path === '/auth/session') body = session
    else if (path.endsWith('/workflow')) body = workflow
    else if (path.endsWith('/verifications')) body = f.verificationHistory
    else if (path === '/v1/advance/internal/verification-requests') body = { items: [{ ...f.pendingOrganizationRequest, name: f.organizations[0].name }], nextOffset: null }
    else if (path === `/v1/advance/organizations/${approved.organizationId}/verification-requests`) body = {
      organization: f.organizations[0], requests: [f.pendingOrganizationRequest, approved], audit: [], isOwner: false,
      verification: { status: 'VERIFIED', verifiedAt: approved.reviewedAt, verificationExpiresAt: f.verificationHistory[0].validUntil,
        recordId: approved.verificationRecordId, requiresReverification: false, error: null } }
    else if (path === `/v1/advance/verification-requests/${approved.id}`) {
      dossierReads++
      if (dossierFailure === 'hold') await new Promise(resolve => { releaseDossier = resolve })
      if (dossierFailure === 'unavailable') { status = 503; body = { message: 'Synthetic approved dossier unavailable' } }
      else if (dossierFailure === 'forbidden') { status = 403; body = { message: 'Synthetic review access revoked' } }
      else body = dossierFailure === 'mismatch' ? { ...approved, snapshotBytes: approved.snapshotBytes + ' ' } : approved
    }
    else if (path === `/v1/advance/verification-requests/${approved.id}/files/${approved.documents[0].id}/download`) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(f.organizationDocumentBytes, 'base64'), headers: { ...cors, 'Cache-Control': 'private, no-store' } })
    }
    else if (path.endsWith('/original')) body = f.original
    else if (path.endsWith('/redacted')) body = f.publication
    else if (path.includes('/public/records/')) body = f.publicRecord
    else if (path.endsWith('/events')) body = f.events
    else if (path.includes('/refunds')) body = rights
    else if (path.includes('/public/evidence/')) { body = outage ? { message: 'Synthetic storage unavailable' } : { publicHash: f.publication.hash, manifestBytes: f.publication.manifestBytes }; status = outage ? 503 : 200 }
    else if (path === '/v1/advance/public/campaigns') body = { context: workflow.plan.context, items: [{ campaignId: detail.snapshot.campaignId, metadataId: detail.metadataId, title: detail.title, workflow: detail.workflow }] }
    else if (path.includes('/v1/advance/public/campaigns/')) body = detail
    else { status = 501; body = { message: `Unmocked ${method} ${path}` }; unmocked.push(body.message) }
    if (method !== 'GET') writes.push({ method, path })
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': 'http://localhost:5174', 'Access-Control-Allow-Credentials': 'true' } })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('about:blank'); await page.goto(`http://localhost:5174/#/internal/milestones/${workflow.metadataId}/99`)
  await page.getByRole('heading', { name: 'Không tìm thấy đợt', exact: true }).waitFor({ timeout: 5000 })
  assert(await page.getByRole('button', { name: 'Chuẩn bị quyết định', exact: true }).count() === 0, 'invalid milestone route cannot open current-stage decision')
  await page.goto(`http://localhost:5174/#/internal/milestones/${workflow.metadataId}/0`)
  await page.getByRole('heading', { name: 'Quyết định resolver', exact: true }).waitFor()
  const history = page.getByRole('heading', { name: 'Lịch sử xác thực tổ chức', exact: true }).locator('..')
  await history.getByRole('button', { name: 'Xem hồ sơ đã được duyệt', exact: true }).waitFor()
  assert(dossierReads === 0, 'Approved dossier is loaded only when reviewer opens its report link')
  await history.getByRole('button', { name: 'Xem hồ sơ đã được duyệt', exact: true }).click()
  await history.getByRole('heading', { name: 'Hồ sơ tại thời điểm duyệt', exact: true }).waitFor()
  assert(dossierReads > 0 && await history.getByText(approved.content.profile.legalName, { exact: true }).isVisible(), 'Resolver opens the approved snapshot bound to the ADMIN report')
  assert(await history.locator('textarea').count() === 0 && await history.getByRole('button', { name: 'Ghi quyết định', exact: true }).count() === 0, 'Resolver dossier view is read-only')
  const downloading = page.waitForEvent('download')
  const downloadResponse = page.waitForResponse(response => response.url().endsWith(`/files/${approved.documents[0].id}/download`))
  await history.getByRole('button', { name: 'Tải tài liệu', exact: true }).click()
  const download = await downloading, response = await downloadResponse
  await download.saveAs('C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-approved-document.pdf')
  assert(download.suggestedFilename() === approved.documents[0].originalName && (await response.body()).equals(Buffer.from(f.organizationDocumentBytes, 'base64')), 'Private document download preserves filename and exact bytes')
  await history.getByRole('button', { name: 'Ẩn hồ sơ', exact: true }).click(); dossierFailure = 'hold'
  await history.getByRole('button', { name: 'Xem hồ sơ đã được duyệt', exact: true }).click()
  await history.getByText('Đang kiểm tra quyền đọc hồ sơ đã được duyệt…', { exact: true }).waitFor()
  assert(await history.getByText(approved.content.profile.legalName, { exact: true }).count() === 0, 'Cached private content stays hidden during fresh authorization')
  dossierFailure = 'unavailable'; releaseDossier()
  await history.getByText('Synthetic approved dossier unavailable', { exact: true }).waitFor()
  assert(await history.getByRole('heading', { name: 'Hồ sơ tại thời điểm duyệt', exact: true }).count() === 0, 'Failed refetch hides cached dossier')
  dossierFailure = ''; await history.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click()
  await history.getByRole('heading', { name: 'Hồ sơ tại thời điểm duyệt', exact: true }).waitFor()
  assert(true, 'Explicit retry recovers approved dossier after network failure')
  await history.getByRole('button', { name: 'Ẩn hồ sơ', exact: true }).click(); dossierFailure = 'forbidden'
  await history.getByRole('button', { name: 'Xem hồ sơ đã được duyệt', exact: true }).click()
  await history.getByText('Synthetic review access revoked', { exact: true }).waitFor()
  assert(await history.getByRole('button', { name: 'Tải tài liệu', exact: true }).count() === 0, 'Server permission revocation hides the cached dossier even when session still lists RESOLVER')
  dossierFailure = ''; await history.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click()
  await history.getByRole('heading', { name: 'Hồ sơ tại thời điểm duyệt', exact: true }).waitFor()
  await history.getByRole('button', { name: 'Ẩn hồ sơ', exact: true }).click(); dossierFailure = 'mismatch'
  await history.getByRole('button', { name: 'Xem hồ sơ đã được duyệt', exact: true }).click()
  await history.getByText('Hồ sơ không khớp với quyết định xác thực. Cần tải lại lịch sử trước khi tiếp tục.', { exact: true }).waitFor()
  assert(await history.getByRole('button', { name: 'Tải tài liệu', exact: true }).count() === 0, 'Snapshot mismatch removes download controls')
  dossierFailure = ''; await history.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click()
  await history.getByRole('heading', { name: 'Hồ sơ tại thời điểm duyệt', exact: true }).waitFor()
  await history.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-approved-dossier.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Approved dossier mobile layout has no horizontal overflow')
  await page.setViewportSize({ width: 1280, height: 800 })
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
  session = { ...f.resolverSession, roles: [] }; await page.reload()
  await page.getByText('Cần account role RESOLVER. ADMIN xác thực tổ chức ở mục riêng.', { exact: true }).waitFor()
  assert(await page.getByRole('heading', { name: 'Lịch sử xác thực tổ chức', exact: true }).count() === 0, 'Refreshed account without RESOLVER cannot retain private verification history')
  session = f.resolverSession; await page.reload()
  await page.goto('http://localhost:5174/#/internal/organizations')
  await page.getByText('Thao tác này cần account role ADMIN. RESOLVER không tự có quyền staff.', { exact: true }).waitFor()
  assert(true, 'RESOLVER account does not get ADMIN verification form')
  session = { ...f.resolverSession, roles: ['ADMIN'] }; await page.reload()
  await page.getByRole('link', { name: f.organizations[0].name, exact: true }).click()
  await page.getByRole('heading', { name: f.organizations[0].name, exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Ghi quyết định', exact: true }).count() === 1, 'ADMIN decides a submitted request instead of editing organization data')
  assert(await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).count() === 0, 'ADMIN cannot edit the organizer profile')
  await page.getByRole('combobox', { name: 'Quyết định', exact: true }).selectOption('APPROVE')
  assert(await page.getByRole('checkbox', { name: /Đã kiểm tra/ }).count() === 4, 'ADMIN approval requires four verification checks')
  assert(await page.getByRole('button', { name: 'Connect Wallet', exact: true }).count() === 0, 'Staff verification has no wallet-sign transaction')
  await page.screenshot({ path: 'C:/Users/dell/Desktop/FundTogether/.local/workflow-b/ui-verification.png' })
  session = { ...f.session, userId: 'synthetic-donor-browser', wallets: [] }
  await page.goto(`http://localhost:5174/#/campaigns/${detail.snapshot.campaignId}`); await page.reload()
  await page.getByRole('heading', { name: 'Bằng chứng và quyết định', exact: true }).waitFor()
  await page.getByText('Dòng tiền và thông tin mạng', { exact: true }).click()
  assert(await page.getByText('Còn trong escrow', { exact: true }).locator('..').innerText() === 'Còn trong escrow\n0 MockUSDC', 'G1 after advance public escrow is0')
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
  assert(unmocked.length === 0, `Every browser API request is covered: ${unmocked.join(', ')}`)
  assert(errors.length === 0, 'No React runtime errors in staff/reviewer/public/refund')
  return { checkedAt: new Date().toISOString(), deploymentId: f.workflow.plan.context.deploymentId,
    kind: 'mocked-API-browser-F4-F6', status: 'PASS', checks, sourceChainWrites: 0, realWalletSigning: false, realReviewDecision: false }
}
fs.writeFileSync(new URL('../../.local/workflow-b/ui-review-check.js', import.meta.url), `async page => (${check.toString()})(page, ${JSON.stringify(fixture)})`)
console.log('Reviewer/public/refund fixture script prepared')
