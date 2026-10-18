import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { CampaignPage } = await server.ssrLoadModule('/src/features/campaigns/public/Page.tsx')
const { CommunityPanel, FeedbackComposerModal } = await server.ssrLoadModule('/src/features/campaigns/public/Community.tsx')
const { Library } = await server.ssrLoadModule('/src/features/campaigns/backer/Library.tsx')
const { ReviewThread } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ReviewThread.tsx')
const { HistoricalCampaignPage } = await server.ssrLoadModule('/src/features/campaigns/historical/HistoricalCampaignPage.tsx')
const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })
const hash = `0x${'1'.repeat(64)}`
const preview = { id: 'campaign', status: 'APPROVED', commitmentHash: hash, creatorDisplayName: 'Artist', contentOutline: 'Twelve chapters', budgetPlan: 'Self-funded production', evidencePlan: 'Page proofs and final PDF', decisions: [],
  config: { title: 'Comic', pitch: 'City story', story: 'Frozen story', goal: '9007199254740993', fundingDuration: 86400, tiers: [{ price: '10000001', benefitItems: [{ description: 'The complete PDF' }] }] } }
function render(component, props, entries = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of entries) client.setQueryData(key, data)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config }, createElement(QueryClientProvider, { client }, createElement(component, props))))
  client.clear(); return html
}
function campaign(access, state = 3, mode = 'public', snapshotOverrides = {}, previewOverrides = {}) {
  return render(CampaignPage, { id: 'campaign', session: { userId: 'owner', roles: [], wallets: [] }, mode }, [
    [['campaign-campaign-public', 'campaign'], { ...preview, ...previewOverrides }],
    [['campaign-campaign-chain', 'campaign'], { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', deployment: {}, challenges: [], snapshot: { state, raised: '10000001', escrowed: '10000001', fundingDeadline: '1791900000', releaseDeadline: '1794900000', challengeDeadline: '1795000000', openDisputes: '0', productionApproved: true, productionHash: hash, ...snapshotOverrides } }],
    [['campaign-campaign-evidence', 'campaign', 'public'], []],
    [['campaign-campaign-entitlements', 'owner'], [{ id: 'right', campaignId: 'campaign', amountPaid: '10000001', access, confirmedAt: null }]],
    [['campaign-campaign-feedback', 'campaign', 'owner'], { items: [], canSubmit: true }],
  ])
}
function publishedFundingCampaign() {
  return render(CampaignPage, { id: 'campaign', session: null, mode: 'public' }, [
    [['campaign-campaign-public', 'campaign'], { ...preview, status: 'PUBLISHED', surface: 'FUNDING' }],
    [['campaign-campaign-chain', 'campaign'], { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', deployment: {}, challenges: [], snapshot: {
      state: 0, raised: '0', escrowed: '0', goal: '100000000', price: '20000000', fundingDeadline: '1791900000', releaseDeadline: '0',
      challengeDeadline: '0', openDisputes: '0', productionApproved: false, productionHash: `0x${'0'.repeat(64)}`,
    } }],
    [['campaign-campaign-evidence', 'campaign', 'public'], []],
  ])
}
test('canonical payment and reviewed production do not render a PDF download before accepted release', () => {
  const html = campaign('PENDING_RELEASE', 1)
  assert.doesNotMatch(html, /Kiểm tra và tải PDF riêng tư|Tôi đã kiểm tra và xác nhận PDF/)
  assert.match(html, /EVIDENCE_REVIEWED/)
  assert.match(html, /9007199254\.740993/)
})
test('published funding campaign renders pledge flow instead of community review notice', () => {
  const html = publishedFundingCampaign()
  assert.match(html, /Ủng hộ gói PDF tiêu chuẩn/)
  assert.match(html, /Đăng nhập tài khoản trước khi pledge\./)
  assert.doesNotMatch(html, /Community review đang mở|Hồ sơ chưa mở pledge|Khu vực kiểm tra riêng tư chỉ dành cho Creator hoặc Resolver/)
})
test('chain deadlines render Unix seconds once instead of producing an overflow year', () => {
  const html = campaign('PENDING_RELEASE', 0, 'public', { fundingDeadline: '1794831667', releaseDeadline: '0' })
  assert.match(html, /16 Nov 2026/)
  assert.doesNotMatch(html, /58845/)
})
test('eligible download and backer acceptance are separate explicit controls', () => {
  const html = campaign('DOWNLOAD_ELIGIBLE')
  assert.match(html, /Kiểm tra và tải PDF riêng tư/)
  assert.match(html, /Tôi đã kiểm tra và xác nhận PDF/)
  assert.match(html, /Lượt tải là nhật ký truy cập/)
  assert.doesNotMatch(html, /shipping|tracking|địa chỉ nhận|mã đọc|digitalAccessCode/i)
})
test('private PDF tickets accept the canonical fundtogether download route', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/features/campaigns/api/campaigns.ts', import.meta.url), 'utf8')
  assert.ok(source.includes('fundtogether\\/campaigns\\/downloads'))
  assert.doesNotMatch(source, /\/v1\/campaigns\/campaigns\/downloads/)
})
test('refunded and orphaned entitlements never render a download control', () => {
  for (const access of ['REFUNDED', 'ORPHANED']) assert.doesNotMatch(campaign(access, 4), /Kiểm tra và tải PDF riêng tư/)
})
test('refund campaign detail shows one clear backer action and hides delivery workflow', () => {
  const eligible = campaign('REFUND_ELIGIBLE', 4, 'public', { productionApproved: false })
  assert.match(eligible, /Campaign không đạt mục tiêu — đang hoàn tiền/)
  assert.match(eligible, /Nhận hoàn tiền vào ví đã pledge/)
  assert.doesNotMatch(eligible, /Chờ hoàn tất gây quỹ/)
  assert.doesNotMatch(eligible, /Bằng chứng &amp; bản PDF cuối|Community kiểm tra cùng Resolver|REFUND_ELIGIBLE/)

  const refunded = campaign('REFUNDED', 4)
  assert.match(refunded, /Bạn đã nhận hoàn tiền/)
  assert.doesNotMatch(refunded, /Nhận hoàn tiền vào ví đã pledge|Bằng chứng &amp; bản PDF cuối|REFUNDED/)
})
test('the Campaign library explains refund entitlement instead of exposing internal access codes', () => {
  const eligible = render(Library, { userId: 'owner' }, [
    [['campaign-campaign-entitlements', 'owner'], [{ id: 'right', campaignId: 'campaign', campaignTitle: 'Comic', amountPaid: '10000001', access: 'REFUND_ELIGIBLE', confirmedAt: null }]],
  ])
  assert.match(eligible, /Có thể nhận hoàn tiền/)
  assert.match(eligible, /Mở campaign để nhận hoàn tiền/)
  assert.doesNotMatch(eligible, /REFUND_ELIGIBLE|Chưa xác nhận PDF/)

  const refunded = render(Library, { userId: 'owner' }, [
    [['campaign-campaign-entitlements', 'owner'], [{ id: 'right', campaignId: 'campaign', campaignTitle: 'Comic', amountPaid: '10000001', access: 'REFUNDED', confirmedAt: null }]],
  ])
  assert.match(refunded, /Đã hoàn tiền/)
  assert.doesNotMatch(refunded, /REFUNDED|Chưa xác nhận PDF|Nhận hoàn tiền/)
})

test('empty Campaign library keeps actions grouped in a compact hierarchy', () => {
  const html = render(Library, { userId: 'owner' }, [
    [['campaign-campaign-entitlements', 'owner'], []],
  ])

  assert.match(html, /Bộ sưu tập của tôi/)
  assert.match(html, /Chưa có tác phẩm nào trong bộ sưu tập/)
  assert.match(html, /campaign-empty-state__actions/)
  assert.match(html, /href="#\/campaigns"[^>]*>Khám phá chiến dịch/)
  assert.match(html, /href="#\/campaigns\/history\/entitlements"[^>]*>Xem quyền lợi Campaign lịch sử/)
  assert.doesNotMatch(html, /Campaign bạn pledge sẽ xuất hiện ở đây sau khi giao dịch được indexer xác nhận/)
})
test('community comments are visible while private review feedback stays scoped', () => {
  const html = render(CommunityPanel, { id: 'campaign', userId: 'new-user', commitmentHash: hash }, [
    [['campaign-campaign-feedback', 'campaign', 'new-user'], { items: [{ id: 'public-comment', authorUserId: 'other-user', targetHash: hash, kind: 'COMMENT', body: 'A public comment from another backer.', createdAt: '2026-10-16T10:30:00.000Z' }], canSubmit: true }],
  ])
  assert.match(html, /A public comment from another backer/)
  assert.match(html, /Nhận xét công khai/)
  assert.match(html, /Thành viên cộng đồng/)
  assert.match(html, /không tự khóa hay chuyển tiền/)
  assert.doesNotMatch(html, /Nội dung đang kiểm tra/)
})

test('feedback composer modal contains the community review form', () => {
  const html = render(FeedbackComposerModal, { id: 'campaign', commitmentHash: hash, evidence: [], onClose: () => {} })
  assert.match(html, /role="dialog"/)
  assert.match(html, /Gửi góp ý/)
  assert.match(html, /Góp ý cho/)
  assert.match(html, /Loại phản hồi/)
  assert.match(html, /Nội dung góp ý/)
})

test('community review campaign exposes the feedback entry point without rendering the form inline', () => {
  const html = campaign('PENDING_RELEASE', 0, 'public', {}, { status: 'COMMUNITY_REVIEW' })
  assert.match(html, /Community review đang mở/)
  assert.match(html, /Gửi góp ý/)
  assert.doesNotMatch(html, /Nội dung đang kiểm tra/)
})

test('campaign creator can respond to feedback and sees the response area', () => {
  const html = render(CommunityPanel, { id: 'campaign', userId: 'owner', viewerMode: 'creator', commitmentHash: hash }, [
    [['campaign-campaign-feedback', 'campaign', 'owner'], { items: [{ id: 'feedback', authorUserId: 'reader', targetHash: hash, kind: 'COMMENT', body: 'Please inspect the chapter count.', createdAt: '2026-10-16T10:30:00.000Z' }], responses: [], canSubmit: false, canRespond: true }],
  ])
  assert.match(html, /campaign-feedback/)
  assert.match(html, /Phản hồi cộng đồng/)
  assert.match(html, /Nhận xét công khai/)
  assert.match(html, /Cam kết campaign/)
  assert.match(html, /ĐỌC &amp; PHẢN HỒI/)
  assert.match(html, /Phản hồi của Creator/)
  assert.match(html, /Gắn với góp ý cụ thể/)
  assert.match(html, /Gửi phản hồi Creator/)
  assert.match(html, /Please inspect the chapter count/)
})
test('funded review uses an append-only Backer Creator thread with Resolver escalation, not a funding CTA', () => {
  const html = render(ReviewThread, { campaignId: 'campaign', userId: 'backer', viewerMode: 'backer', targetHash: hash }, [
    [['campaign-campaign-review-threads', 'campaign', 'backer'], [{ id: 'thread-1', campaignId: 'campaign', entitlementId: 'right', backerUserId: 'backer', creatorUserId: 'owner', targetHash: hash, commitmentHash: hash, status: 'OPEN', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:30:00.000Z', permissions: { canMessage: true, canEscalate: true, readOnlyReason: null }, escalation: null, messages: [{ id: 'message-1', threadId: 'thread-1', authorUserId: 'backer', authorRole: 'BACKER', body: 'Please clarify the production timeline.', createdAt: '2026-10-16T10:30:00.000Z' }] }]],
  ])
  assert.match(html, /Trao đổi thẩm định sau funding/)
  assert.match(html, /Please clarify the production timeline./)
  assert.match(html, /Gửi yêu cầu Resolver/)
  assert.doesNotMatch(html, /Xác nhận ủng hộ|Nhận hoàn tiền|Chuyển tiền/)
})
test('refunded and orphaned review threads remain readable but lose write actions', () => {
  for (const readOnlyReason of ['REFUNDED', 'ORPHANED']) {
    const html = render(ReviewThread, { campaignId: 'campaign', userId: 'backer', viewerMode: 'backer', targetHash: hash }, [
      [['campaign-campaign-review-threads', 'campaign', 'backer'], [{ id: 'thread-1', campaignId: 'campaign', entitlementId: 'right', backerUserId: 'backer', creatorUserId: 'owner', targetHash: hash, commitmentHash: hash, status: 'OPEN', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:30:00.000Z', permissions: { canMessage: false, canEscalate: false, readOnlyReason }, escalation: null, messages: [{ id: 'message-1', threadId: 'thread-1', authorUserId: 'backer', authorRole: 'BACKER', body: 'Historical review message remains visible.', createdAt: '2026-10-16T10:30:00.000Z' }] }]],
    ])
    assert.match(html, /Historical review message remains visible./)
    assert.match(html, /Trao đổi này chỉ còn xem/)
    assert.doesNotMatch(html, /Gửi phản hồi|Gửi yêu cầu Resolver/)
    assert.doesNotMatch(html, /Xác nhận ủng hộ|Nhận hoàn tiền|Chuyển tiền/)
  }
})
test('switching accounts cannot inherit the previous account library', () => {
  const html = render(Library, { userId: 'new-user' }, [
    [['campaign-campaign-entitlements', 'old-user'], [{ id: 'secret', campaignId: 'PRIVATE_OLD_CAMPAIGN', amountPaid: '1', access: 'DOWNLOAD_ELIGIBLE' }]],
  ])
  assert.doesNotMatch(html, /PRIVATE_OLD_CAMPAIGN|DOWNLOAD_ELIGIBLE/)
})
test('historical campaign records cannot collect a new pledge or shipping details', () => {
  const html = render(HistoricalCampaignPage, { campaignId: 'history' }, [
    [['campaign-public-campaign', 'history'], { id: 'history', title: 'Old campaign', pitch: 'Historical terms', story: 'Original promise', status: 'COMPLETED', goal: '10000000', tiers: [{ id: 'old', title: 'Original tier', description: 'Retained terms', price: '10000000', pledgedQuantity: 1 }] }],
  ])
  assert.match(html, /Original promise|Original tier/)
  assert.doesNotMatch(html, /<input|<textarea|<button|Xác nhận ủng hộ|Mã vận đơn/)
})

test('deadline controls stay out of backer and creator views and appear only for resolver when due', async () => {
  const creatorBeforeDeadline = campaign('PENDING_RELEASE', 0, 'creator')
  assert.doesNotMatch(creatorBeforeDeadline, /Chốt kết quả khi hết hạn gây quỹ|Mở hoàn tiền khi quá hạn policy/)

  const backerBeforeDeadline = campaign('PENDING_RELEASE', 0, 'public')
  assert.doesNotMatch(backerBeforeDeadline, /Chốt kết quả khi hết hạn gây quỹ|Mở hoàn tiền khi quá hạn policy/)

  const source = await (await import('node:fs/promises')).readFile(new URL('../src/features/campaigns/public/Page.tsx', import.meta.url), 'utf8')
  assert.match(source, /Đã hết hạn gây quỹ · chờ chốt kết quả/)
  assert.match(source, /Chưa thấy ví Resolver hợp lệ/)
  assert.match(source, /const showFinalizeFunding = Boolean\(state && mode === 'resolver' && state\.state === 0 && fundingExpired\)/)
  assert.match(source, /const showStartRefunds = Boolean\(state && mode === 'resolver' && state\.state !== 0 && !\[4, 5, 6\]\.includes\(state\.state\)/)
  assert.match(source, /disabled=\{busy \|\| !canReview\} className="button button--secondary" onClick=\{\(\) => void tx\.send\('finalizeFunding'/)
})

test('funding card keeps creator cancellation for now but hides the technical canonical reload control', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/features/campaigns/public/Page.tsx', import.meta.url), 'utf8')
  assert.match(source, /cancelCampaign/)
  assert.doesNotMatch(source, /Tải lại trạng thái canonical/)
  assert.doesNotMatch(source, /Trạng thái UI:/)
  assert.doesNotMatch(source, /Number\(state\.(raised|goal)\)/)

  const transactionSource = await (await import('node:fs/promises')).readFile(new URL('../src/features/campaigns/transactions/useTransaction.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(transactionSource, /setNotice\(`ON_CHAIN_CONFIRMED/)
})
