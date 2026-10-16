import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { createServer } from 'vite'

const server = await createServer({ mode: 'reward', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { EditionsCampaign, EditionsCommunity, EditionsLibrary } = await server.ssrLoadModule('/src/features/reward/EditionsCampaign.tsx')
const { EditionsReviewThread } = await server.ssrLoadModule('/src/features/reward/ui/EditionsReviewThread.tsx')
const { RewardPublicCampaign } = await server.ssrLoadModule('/src/features/reward/RewardPublicCampaign.tsx')
const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })
const hash = `0x${'1'.repeat(64)}`
const preview = { id: 'edition', status: 'APPROVED', commitmentHash: hash, creatorDisplayName: 'Artist', contentOutline: 'Twelve chapters', budgetPlan: 'Self-funded production', evidencePlan: 'Page proofs and final PDF', releaseWindow: { start: '2027-01-01', end: '2027-02-01' }, decisions: [],
  config: { title: 'Comic', pitch: 'City story', story: 'Frozen story', goal: '9007199254740993', fundingDuration: 86400, tiers: [{ price: '10000001', rewardItems: [{ description: 'The complete PDF' }] }] } }
function render(component, props, entries = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of entries) client.setQueryData(key, data)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config }, createElement(QueryClientProvider, { client }, createElement(component, props))))
  client.clear(); return html
}
function campaign(access, state = 3, mode = 'public', snapshotOverrides = {}) {
  return render(EditionsCampaign, { id: 'edition', session: { userId: 'owner', roles: [], wallets: [] }, mode }, [
    [['reward-editions-public', 'edition'], preview],
    [['reward-editions-chain', 'edition'], { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', deployment: {}, challenges: [], snapshot: { state, raised: '10000001', escrowed: '10000001', fundingDeadline: '1791900000', releaseDeadline: '1794900000', challengeDeadline: '1795000000', openDisputes: '0', productionApproved: true, productionHash: hash, ...snapshotOverrides } }],
    [['reward-editions-evidence', 'edition', 'public'], []],
    [['reward-editions-entitlements', 'owner'], [{ id: 'right', campaignId: 'edition', amountPaid: '10000001', access, confirmedAt: null }]],
    [['reward-editions-feedback', 'edition', 'owner'], { items: [], canSubmit: true }],
  ])
}
test('canonical payment and reviewed production do not render a PDF download before accepted release', () => {
  const html = campaign('PENDING_RELEASE', 1)
  assert.doesNotMatch(html, /Kiểm tra và tải PDF riêng tư|Tôi đã kiểm tra và xác nhận PDF/)
  assert.match(html, /EVIDENCE_REVIEWED/)
  assert.match(html, /9007199254\.740993/)
})
test('eligible download and backer acceptance are separate explicit controls', () => {
  const html = campaign('DOWNLOAD_ELIGIBLE')
  assert.match(html, /Kiểm tra và tải PDF riêng tư/)
  assert.match(html, /Tôi đã kiểm tra và xác nhận PDF/)
  assert.match(html, /Lượt tải là nhật ký truy cập/)
  assert.doesNotMatch(html, /shipping|tracking|địa chỉ nhận|mã đọc|digitalAccessCode/i)
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
test('my rewards explains refund entitlement instead of exposing internal access codes', () => {
  const eligible = render(EditionsLibrary, { userId: 'owner' }, [
    [['reward-editions-entitlements', 'owner'], [{ id: 'right', campaignId: 'edition', campaignTitle: 'Comic', amountPaid: '10000001', access: 'REFUND_ELIGIBLE', confirmedAt: null }]],
  ])
  assert.match(eligible, /Có thể nhận hoàn tiền/)
  assert.match(eligible, /Mở campaign để nhận hoàn tiền/)
  assert.doesNotMatch(eligible, /REFUND_ELIGIBLE|Chưa xác nhận PDF/)

  const refunded = render(EditionsLibrary, { userId: 'owner' }, [
    [['reward-editions-entitlements', 'owner'], [{ id: 'right', campaignId: 'edition', campaignTitle: 'Comic', amountPaid: '10000001', access: 'REFUNDED', confirmedAt: null }]],
  ])
  assert.match(refunded, /Đã hoàn tiền/)
  assert.doesNotMatch(refunded, /REFUNDED|Chưa xác nhận PDF|Nhận hoàn tiền/)
})

test('empty Editions library keeps actions grouped in a compact hierarchy', () => {
  const html = render(EditionsLibrary, { userId: 'owner' }, [
    [['reward-editions-entitlements', 'owner'], []],
  ])

  assert.match(html, /Thư viện của tôi/)
  assert.match(html, /Chưa có ấn phẩm nào trong thư viện/)
  assert.match(html, /edition-empty-state__actions/)
  assert.match(html, /href="#\/reward"[^>]*>Khám phá chiến dịch/)
  assert.match(html, /href="#\/reward\/history\/my-rewards"[^>]*>Xem quyền lợi Reward lịch sử/)
  assert.doesNotMatch(html, /Campaign bạn pledge sẽ xuất hiện ở đây sau khi giao dịch được indexer xác nhận/)
})
test('community feedback is account-scoped and clearly advisory', () => {
  const html = render(EditionsCommunity, { id: 'edition', userId: 'new-user', commitmentHash: hash }, [
    [['reward-editions-feedback', 'edition', 'new-user'], { items: [], canSubmit: true }],
  ])
  assert.doesNotMatch(html, /PRIVATE OLD REPORT/)
  assert.match(html, /không tự khóa hay chuyển tiền/)
})

test('campaign creator receives feedback without a submission form', () => {
  const html = render(EditionsCommunity, { id: 'edition', userId: 'owner', viewerMode: 'creator', commitmentHash: hash }, [
    [['reward-editions-feedback', 'edition', 'owner'], { items: [{ id: 'feedback', authorUserId: 'reader', targetHash: hash, kind: 'COMMENT', body: 'Please inspect the chapter count.', createdAt: '2026-10-16T10:30:00.000Z' }], canSubmit: false }],
  ])
  assert.match(html, /editions-feedback/)
  assert.match(html, /Phản hồi cộng đồng/)
  assert.match(html, /Nhận xét/)
  assert.match(html, /Cam kết campaign/)
  assert.match(html, /Creator chỉ đọc phản hồi/)
  assert.match(html, /Please inspect the chapter count/)
  assert.doesNotMatch(html, /Gửi phản hồi có tài khoản|<form/)
})
test('funded review uses an append-only Backer Creator thread with Resolver escalation, not a funding CTA', () => {
  const html = render(EditionsReviewThread, { campaignId: 'edition', userId: 'backer', viewerMode: 'backer', targetHash: hash }, [
    [['reward-editions-review-threads', 'edition', 'backer'], [{ id: 'thread-1', campaignId: 'edition', entitlementId: 'right', backerUserId: 'backer', creatorUserId: 'owner', targetHash: hash, commitmentHash: hash, status: 'OPEN', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:30:00.000Z', escalation: null, messages: [{ id: 'message-1', threadId: 'thread-1', authorUserId: 'backer', authorRole: 'BACKER', body: 'Please clarify the production timeline.', createdAt: '2026-10-16T10:30:00.000Z' }] }]],
  ])
  assert.match(html, /Trao đổi thẩm định sau funding/)
  assert.match(html, /Please clarify the production timeline./)
  assert.match(html, /Gửi yêu cầu Resolver/)
  assert.doesNotMatch(html, /Xác nhận ủng hộ|Nhận hoàn tiền|Chuyển tiền/)
})
test('switching accounts cannot inherit the previous account library', () => {
  const html = render(EditionsLibrary, { userId: 'new-user' }, [
    [['reward-editions-entitlements', 'old-user'], [{ id: 'secret', campaignId: 'PRIVATE_OLD_CAMPAIGN', amountPaid: '1', access: 'DOWNLOAD_ELIGIBLE' }]],
  ])
  assert.doesNotMatch(html, /PRIVATE_OLD_CAMPAIGN|DOWNLOAD_ELIGIBLE/)
})
test('historical campaign records cannot collect a new pledge or shipping details', () => {
  const html = render(RewardPublicCampaign, { campaignId: 'history' }, [
    [['reward-public-campaign', 'history'], { id: 'history', title: 'Old campaign', pitch: 'Historical terms', story: 'Original promise', status: 'COMPLETED', goal: '10000000', tiers: [{ id: 'old', title: 'Original tier', description: 'Retained terms', price: '10000000', pledgedQuantity: 1 }] }],
  ])
  assert.match(html, /Original promise|Original tier/)
  assert.doesNotMatch(html, /<input|<textarea|<button|Xác nhận ủng hộ|Mã vận đơn/)
})

test('deadline controls stay out of backer and creator views and appear only for resolver when due', async () => {
  const creatorBeforeDeadline = campaign('PENDING_RELEASE', 0, 'creator')
  assert.doesNotMatch(creatorBeforeDeadline, /Chốt kết quả khi hết hạn gây quỹ|Mở hoàn tiền khi quá hạn policy/)

  const backerBeforeDeadline = campaign('PENDING_RELEASE', 0, 'public')
  assert.doesNotMatch(backerBeforeDeadline, /Chốt kết quả khi hết hạn gây quỹ|Mở hoàn tiền khi quá hạn policy/)

  const source = await (await import('node:fs/promises')).readFile(new URL('../src/features/reward/EditionsCampaign.tsx', import.meta.url), 'utf8')
  assert.match(source, /Đã hết hạn gây quỹ · chờ chốt kết quả/)
  assert.match(source, /Chưa thấy ví Resolver hợp lệ/)
  assert.match(source, /const showFinalizeFunding = Boolean\(state && mode === 'resolver' && state\.state === 0 && fundingExpired\)/)
  assert.match(source, /const showStartRefunds = Boolean\(state && mode === 'resolver' && state\.state !== 0 && !\[4, 5\]\.includes\(state\.state\)/)
  assert.match(source, /disabled=\{busy \|\| !canReview\} className="button button--secondary" onClick=\{\(\) => void tx\.send\('finalizeFunding'/)
})

test('funding card keeps creator cancellation for now but hides the technical canonical reload control', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/features/reward/EditionsCampaign.tsx', import.meta.url), 'utf8')
  assert.match(source, /cancelCampaign/)
  assert.doesNotMatch(source, /Tải lại trạng thái canonical/)
  assert.doesNotMatch(source, /Trạng thái UI:/)
  assert.doesNotMatch(source, /Number\(state\.(raised|goal)\)/)

  const transactionSource = await (await import('node:fs/promises')).readFile(new URL('../src/features/reward/useEditionsTransaction.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(transactionSource, /setNotice\(`ON_CHAIN_CONFIRMED/)
})
