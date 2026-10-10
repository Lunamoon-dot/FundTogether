import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { sha256, toHex } from 'viem'

const server = await createServer({ mode: 'workflow-b', server: { middlewareMode: true }, logLevel: 'error' })
after(() => server.close())
const { OrganizationVerificationRequest, OrganizationVerificationBadge, VerificationRequestDetails } = await server.ssrLoadModule('/src/features/organizations/OrganizationVerificationRequest.tsx')
const { AdvanceOrganizationVerification, AdvanceVerificationHistory } = await server.ssrLoadModule('/src/features/review/AdvanceOrganizationVerification.tsx')
const { ApprovedOrganizationRequest } = await server.ssrLoadModule('/src/features/review/ApprovedOrganizationRequest.tsx')
const { InternalArea } = await server.ssrLoadModule('/src/features/review/InternalArea.tsx')
const { approvedOrganizationRequestKey, validateApprovedOrganizationRequest } = await server.ssrLoadModule('/src/features/review/approved-organization-request.ts')
const { organizationRequestsKey, organizationRequestRefreshInterval } = await server.ssrLoadModule('/src/features/organizations/organization-requests.ts')
const { default: deployment } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const userId = 'owner', organizationId = 'org', key = organizationRequestsKey(userId, organizationId)
const verification = { status: 'UNVERIFIED', verifiedAt: null, verificationExpiresAt: null, recordId: null, requiresReverification: false, error: null }
const profile = { kind: 'VOLUNTEER_GROUP', legalName: 'Sample organization', registrationNumber: '', address: 'Synthetic address', activityScope: 'Gift pilot',
  representativeName: 'Sample representative', representativeRole: 'Coordinator', authorityBasis: 'Appointment', identitySource: 'Registry', activityEvidence: 'Report', contact: 'sample@example.test' }
const draft = { id: 'request', organizationId, status: 'DRAFT', revision: 2, content: { profile, documentIds: ['document'], responseToReview: '' },
  documents: [{ id: 'document', originalName: 'private.pdf', byteSize: 800, kind: 'REPRESENTATION' }], submittedAt: null, reviewedAt: null, reviewNote: null, missingItems: [] }
const data = { organization: { id: organizationId, name: profile.legalName, verificationStatus: 'unverified' }, requests: [draft], audit: [], verification, isOwner: true }
function render(Component, props, entries, failKey) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [queryKey, value] of entries) client.setQueryData(queryKey, value)
  if (failKey) client.getQueryCache().find({ queryKey: failKey }).setState({ status: 'error', error: new Error('Unavailable service') })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Component, props))); client.clear(); return html
}
const owner = (patch = {}, fail = false) => render(OrganizationVerificationRequest, { userId, organizationId, representativeWalletSelected: true }, [[key, { ...data, ...patch }]], fail ? key : undefined)

test('B milestone deep links never silently open another stage decision', () => {
  const session = { userId: 'resolver', roles: ['RESOLVER'], wallets: [] }
  const planBytes = JSON.stringify({ stages: [{ title: 'First' }, { title: 'Second' }] })
  const workflow = { metadataId: 'campaign', plan: { planBytes, planHash: sha256(toHex(planBytes)) },
    snapshot: { campaign: { currentStage: '1' }, stages: [{}, {}] } }
  const entries = [[['advance-review-workflow', deployment.deploymentId, session.userId, 'campaign'], workflow]]
  const old = render(InternalArea, { session, sessionLoading: false, path: '/internal/milestones/campaign/0' }, entries)
  assert.match(old, /Đợt trong đường dẫn không phải đợt hiện tại/)
  assert.match(old, /href="#\/internal\/campaigns\/campaign"/)
  assert.doesNotMatch(old, /Quyết định resolver|<form/)
  for (const index of ['2', '9007199254740993']) {
    const invalid = render(InternalArea, { session, sessionLoading: false, path: `/internal/milestones/campaign/${index}` }, entries)
    assert.match(invalid, /Không tìm thấy đợt/)
    assert.doesNotMatch(invalid, /Quyết định resolver|<form/)
  }
})

test('submitted requests refresh decisions without polling editable drafts or retrying failed reads', () => {
  const query = (status, error = false) => ({ state: { status: error ? 'error' : 'success', data: { requests: [{ status }] } } })
  assert.equal(organizationRequestRefreshInterval(query('UNDER_REVIEW')), 10_000)
  for (const status of ['DRAFT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED'])
    assert.equal(organizationRequestRefreshInterval(query(status)), false)
  assert.equal(organizationRequestRefreshInterval(query('UNDER_REVIEW', true)), false)
  assert.equal(organizationRequestRefreshInterval({ state: { status: 'pending' } }), false)
})

test('ADMIN landing opens organization queue with an explicit dossier action', () => {
  const session = { userId: 'admin', roles: ['ADMIN'], wallets: [] }
  const html = render(InternalArea, { session, sessionLoading: false, path: '/internal' }, [[['advance-verification-queue', deployment.deploymentId, session.userId, 'UNDER_REVIEW', 0],
    { items: [{ id: draft.id, organizationId, name: profile.legalName, status: 'UNDER_REVIEW', submittedAt: '2026-10-10T00:00:00Z' }], nextOffset: null }]])
  assert.match(html, /Xem hồ sơ/)
  assert.match(html, /#\/internal\/organizations\/org\/requests\/request/)
  assert.match(html, /Làm mới danh sách/)
})

test('historical request selection cannot display a decision for the latest pending request', () => {
  const session = { userId: 'admin', roles: ['ADMIN'], wallets: [] }
  const entries = [[organizationRequestsKey(session.userId, organizationId), { ...data, isOwner: false,
    requests: [{ ...draft, status: 'UNDER_REVIEW' }, { ...draft, id: 'old', status: 'REJECTED' }] }]]
  const html = render(InternalArea, { session, sessionLoading: false, path: '/internal/organizations/org/requests/old' }, entries)
  assert.match(html, /Đang xem hồ sơ đã chọn/)
  assert.doesNotMatch(html, /Ghi quyết định/)
  const missing = render(AdvanceOrganizationVerification, { session, organizationId, requestId: 'missing' }, entries)
  assert.match(missing, /Không tìm thấy yêu cầu/)
  assert.doesNotMatch(missing, /Ghi quyết định/)
})

test('unbound organization explains why its saved draft has not reached ADMIN', () => {
  const html = render(OrganizationVerificationRequest, { userId, organizationId, representativeWalletSelected: false }, [[key, data]])
  assert.match(html, /Chưa gửi đến ADMIN: tổ chức này chưa có ví đại diện/)
  assert.match(html, /Chọn ví đại diện cho tổ chức/)
  assert.match(html, /Lưu bản nháp/)
  assert.doesNotMatch(owner(), /Chưa gửi đến ADMIN: tổ chức này chưa có ví đại diện/)
})

test('B internal navigation separates ADMIN and RESOLVER duties', () => {
  for (const roles of [['ADMIN'], ['RESOLVER'], ['ADMIN', 'RESOLVER']]) {
    const html = render(InternalArea, { session: { userId: 'staff', roles, wallets: [] }, sessionLoading: true, path: '/internal/organizations' }, [])
    const nav = html.match(/<nav[^>]*>(.*?)<\/nav>/s)[1]
    assert.equal(nav.includes('Hồ sơ campaign'), roles.includes('RESOLVER'))
    assert.equal(nav.includes('Hồ sơ milestone và phản đối'), roles.includes('RESOLVER'))
    assert.equal(nav.includes('Xác thực tổ chức'), roles.includes('ADMIN'))
  }
})
test('draft supports incomplete save but requires declaration before submission; private file and no version numbers', () => {
  const html = owner()
  assert.match(html, /Lưu bản nháp/); assert.match(html, /Tải tài liệu lên/); assert.match(html, /disabled="">Gửi xác thực/)
  assert.match(html, /không tốn gas/); assert.match(html, /Tải tài liệu/); assert.doesNotMatch(html, /Version \d|Phiên bản \d/)
})
test('submitted profile is read-only, exposes cancel and keeps organization verification independent', () => {
  const html = owner({ requests: [{ ...draft, status: 'UNDER_REVIEW', submittedAt: '2026-10-10T00:00:00Z' }], verification: { ...verification, status: 'VERIFIED', verificationExpiresAt: '2027-01-01T00:00:00Z' } })
  assert.match(html, /Đang xét duyệt/); assert.match(html, /Đã xác minh hồ sơ tổ chức/); assert.match(html, /Hủy yêu cầu để chỉnh sửa/)
  assert.doesNotMatch(html, /<textarea|Tải tài liệu lên|Gửi xác thực<\/button>/)
})
test('changes requested retains specific feedback and allows a new request', () => {
  const previous = { ...draft, id: 'previous', status: 'CHANGES_REQUESTED', reviewNote: 'Check authority', missingItems: ['Appointment letter'] }
  const html = owner({ requests: [previous] })
  assert.match(html, /Appointment letter/); assert.match(html, /Chỉnh sửa và gửi yêu cầu mới/)
  const editing = owner({ requests: [draft, previous] })
  assert.match(editing, /Nội dung cần bổ sung/); assert.match(editing, /Trả lời yêu cầu bổ sung<textarea[^>]*required/)
})
test('failed reload hides cached profile actions; badge never uses cached VERIFIED as a successful check', () => {
  const html = owner({}, true); assert.match(html, /Tải lại hồ sơ trước khi tiếp tục/); assert.doesNotMatch(html, /Gửi xác thực|Sample organization/)
  const badge = render(OrganizationVerificationBadge, { userId, organizationId }, [[key, { ...data, verification: { ...verification, status: 'VERIFIED' } }]], key)
  assert.match(badge, /Chưa kiểm tra được xác minh/); assert.doesNotMatch(badge, /Đã xác minh/)
})
test('expiry and suspension render independent from the last approved request', () => {
  for (const [status, label] of [['EXPIRED', 'Xác minh đã hết hạn'], ['SUSPENDED', 'Đã đình chỉ xác minh']]) {
    const html = owner({ requests: [{ ...draft, status: 'APPROVED' }], verification: { ...verification, status } })
    assert.match(html, new RegExp(label)); assert.match(html, /Đã duyệt/)
  }
})
test('ADMIN queue contains submitted requests; resolver cannot enter staff verification', () => {
  const session = { userId: 'admin', roles: ['ADMIN'], wallets: [] }
  const html = render(AdvanceOrganizationVerification, { session }, [[['advance-verification-queue', deployment.deploymentId, session.userId, 'UNDER_REVIEW', 0],
    { items: [{ id: draft.id, organizationId, name: profile.legalName, status: 'UNDER_REVIEW', submittedAt: '2026-10-10T00:00:00Z' }], nextOffset: null }]])
  assert.match(html, /Sample organization/); assert.match(html, /Đang xét duyệt/); assert.doesNotMatch(html, />Bản nháp<\/option>/)
  const denied = render(AdvanceOrganizationVerification, { session: { ...session, roles: ['RESOLVER'] } }, [])
  assert.match(denied, /cần account role ADMIN/); assert.doesNotMatch(denied, /Ghi quyết định/)
})
test('reviewer reads a frozen profile and self-owned organization never exposes decision controls', () => {
  const session = { userId: 'admin', roles: ['ADMIN'], wallets: [] }, staffKey = organizationRequestsKey(session.userId, organizationId)
  const pending = { ...data, requests: [{ ...draft, status: 'UNDER_REVIEW' }], isOwner: false }
  const renderReview = isOwner => render(AdvanceOrganizationVerification, { session, organizationId }, [[staffKey, { ...pending, isOwner }]])
  const html = renderReview(false); assert.match(html, /Ghi quyết định/); assert.match(html, /Yêu cầu bổ sung/); assert.match(html, /Từ chối/)
  assert.doesNotMatch(html, /Lưu bản nháp|Thông tin xét duyệt<\/legend>/)
  const denied = renderReview(true); assert.match(denied, /không thể tự xét duyệt/); assert.doesNotMatch(denied, /Ghi quyết định|Đình chỉ có lý do/)
})

const resolver = { userId: 'resolver', roles: ['RESOLVER'], wallets: [] }
const historyKey = ['advance-verification-history', deployment.deploymentId, resolver.userId, organizationId]
const record = { id: 'verification-record', status: 'VERIFIED', validUntil: '2027-01-01T00:00:00Z', hash: 'report-hash',
  report: { summary: 'Private verification report', reason: 'Checked', scope: 'Pilot', limits: 'Synthetic', sources: [], request: { id: draft.id, snapshotHash: 'snapshot-hash' } } }
test('resolver can open the approved organization dossier from verification history', () => {
  const html = render(AdvanceVerificationHistory, { session: resolver, organizationId }, [[historyKey, [record]]])
  assert.match(html, /Xem hồ sơ đã được duyệt/)
  assert.doesNotMatch(html, /Ghi quyết định|Lưu bản nháp/)
})
test('removing reviewer roles hides cached private verification history', () => {
  const html = render(AdvanceVerificationHistory, { session: { ...resolver, roles: [] }, organizationId }, [[historyKey, [record]]])
  assert.doesNotMatch(html, /Private verification report|Xem hồ sơ đã được duyệt/)
})

const snapshotBytes = JSON.stringify({ requestId: draft.id, organizationId, content: draft.content })
const approved = { ...draft, status: 'APPROVED', verificationRecordId: record.id, snapshotBytes, snapshotHash: sha256(toHex(snapshotBytes)) }
const binding = { organizationId, verificationRecordId: record.id, requestId: draft.id, snapshotHash: approved.snapshotHash }
const approvedKey = approvedOrganizationRequestKey(resolver.userId, binding)
test('approved dossier is read-only and offers private document downloads', () => {
  const html = render(VerificationRequestDetails, { request: approved }, [])
  assert.match(html, /Đã duyệt/); assert.match(html, /Sample organization/); assert.match(html, /private.pdf|Tải tài liệu/)
  assert.match(html, /private.pdf · Đại diện \/ ủy quyền · 1 KiB/)
  assert.doesNotMatch(html, /Ghi quyết định|Lưu bản nháp|Tải tài liệu lên|<textarea/)
})
test('opening a cached dossier checks fresh authorization before rendering private fields', () => {
  const html = render(ApprovedOrganizationRequest, { session: resolver, binding }, [[approvedKey, approved]])
  assert.match(html, /Đang kiểm tra quyền đọc hồ sơ/); assert.doesNotMatch(html, /Sample organization|private.pdf/)
})
test('record binding rejects another organization, decision, request, pending dossier or changed bytes', () => {
  assert.equal(validateApprovedOrganizationRequest(approved, binding), approved)
  for (const patch of [{ id: 'other' }, { organizationId: 'other' }, { status: 'UNDER_REVIEW' }, { verificationRecordId: 'other' },
    { snapshotHash: '0x' + '0'.repeat(64) }, { snapshotBytes: snapshotBytes + ' ' }, { snapshotBytes: null }]) {
    assert.throws(() => validateApprovedOrganizationRequest({ ...approved, ...patch }, binding), /không khớp/)
    const html = render(ApprovedOrganizationRequest, { session: resolver, binding }, [[approvedKey, { ...approved, ...patch }]])
    assert.match(html, /không khớp/); assert.doesNotMatch(html, /Sample organization|Tải tài liệu<\/button>/)
  }
})
test('failed fetch, role removal and account switch never render a cached approved dossier', () => {
  const failure = render(ApprovedOrganizationRequest, { session: resolver, binding }, [[approvedKey, approved]], approvedKey)
  assert.match(failure, /Tải lại hồ sơ/); assert.doesNotMatch(failure, /Sample organization|private.pdf/)
  for (const session of [{ ...resolver, roles: [] }, { ...resolver, userId: 'other-reviewer' }]) {
    const html = render(ApprovedOrganizationRequest, { session, binding }, [[approvedKey, approved]])
    assert.doesNotMatch(html, /Sample organization|private.pdf/)
  }
})
test('legacy reports stay readable without inventing a linked request; history errors hide cached links', () => {
  const html = render(AdvanceVerificationHistory, { session: resolver, organizationId }, [[historyKey, [{ ...record, report: { ...record.report, request: undefined } }]]])
  assert.match(html, /Xác minh trước luồng hồ sơ/); assert.doesNotMatch(html, /Xem hồ sơ đã được duyệt/)
  const failure = render(AdvanceVerificationHistory, { session: resolver, organizationId }, [[historyKey, [record]]], historyKey)
  assert.doesNotMatch(failure, /Private verification report|Xem hồ sơ đã được duyệt/)
})
