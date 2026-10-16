import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

const server = await createServer({ mode: 'reward', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { EditionsFeed, EditionsCommunity, EditionsCommunityReviewPage } = await server.ssrLoadModule('/src/features/reward/EditionsCampaign.tsx')
const { PublicArea } = await server.ssrLoadModule('/src/features/explore/PublicArea.tsx')
const { EditorialCampaignCard } = await server.ssrLoadModule('/src/features/reward/ui/EditorialCampaignCard.tsx')
const { EditionProgressChart } = await server.ssrLoadModule('/src/features/reward/ui/EditionProgressChart.tsx')
const { EditionTimeline } = await server.ssrLoadModule('/src/features/reward/ui/EditionTimeline.tsx')
const { getCampaignUiState } = await server.ssrLoadModule('/src/features/reward/ui/campaignState.ts')

const preview = (id, title, surface, status = 'APPROVED') => ({
  id, status, surface, reviewStartedAt: status === 'COMMUNITY_REVIEW' ? '2026-10-15T00:00:00.000Z' : null,
  commitmentHash: `0x${'1'.repeat(64)}`,
  config: { title, pitch: 'A digital comic pitch', story: 'A complete digital comic story.', goal: '10000000', fundingDuration: 86400,
    tiers: [{ title: 'Standard', description: 'One PDF', price: '10000000', rewardItems: [{ title: 'PDF', description: 'One PDF' }] }] },
  creatorDisplayName: 'Creator', contentOutline: 'Content outline', budgetPlan: 'Budget plan', evidencePlan: 'Evidence plan',
  feedbackCount: 0, decisions: [], releaseWindow: { start: '2026-10-15T00:00:00.000Z', end: '2026-11-15T00:00:00.000Z' }, evidenceHashes: [],
})

const legacyCampaign = (id, title, state, status) => ({
  id, creatorUserId: 'legacy-creator', organizationId: null, title, pitch: `${title} pitch`, story: `${title} story`, category: 'COMICS',
  draftConfig: null, commitmentHash: `0x${'2'.repeat(64)}`, goal: '10000000', fundingDuration: 86400, policyHash: null,
  onchainCampaignId: id, status, frozenAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
  tiers: [{ id: `${id}-tier`, campaignId: id, tierIndex: 0, title: 'Legacy PDF', description: 'Historical reward', price: '1000000', maxQuantity: 100,
    pledgedQuantity: 10, isDigital: true, rewardItems: [], estimatedDeliveryAt: null, createdAt: '2026-10-01T00:00:00.000Z' }],
  projection: { state, raised: '10000000', goal: '10000000' },
})

function renderFeed(legacyItems = [], initialFilter = 'all') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'review'], [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')])
  client.setQueryData(['reward-editions-public', 'activation'], [preview('activation', 'Activation comic', 'ACTIVATION_PENDING')])
  client.setQueryData(['reward-editions-public', 'funding'], [preview('funding', 'Funding comic', 'FUNDING')])
  client.setQueryData(['reward-public-campaigns'], legacyItems)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsFeed, { initialFilter })))
  client.clear()
  return html
}

function renderReviewPage(items = [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'review'], items)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsCommunityReviewPage)))
  client.clear()
  return html
}

test('public Editions feed keeps activation and funding campaigns in separate filters', () => {
  const html = renderFeed()
  assert.match(html, /Chờ kích hoạt/)
  assert.match(html, /aria-label="Chờ Creator và Resolver kích hoạt: 1"/)
  assert.match(html, /Đang gây quỹ/)
  assert.match(html, /Activation comic/)
  assert.match(html, /Funding comic/)
  assert.doesNotMatch(html, /Review comic/)
  assert.doesNotMatch(html, /Community review đang mở/)
  assert.doesNotMatch(html, /Hồ sơ đã duyệt; xem trạng thái hợp đồng trong chi tiết\.<\/p>/)
})

test('funded filter uses the legacy contract enum and excludes stopped refund campaigns', () => {
  const html = renderFeed([
    legacyCampaign('legacy-complete', 'Legacy completed comic', 4, 'COMPLETED'),
    legacyCampaign('legacy-stopped', 'Legacy stopped comic', 5, 'STOPPED'),
  ], 'funded')

  assert.match(html, /aria-label="Campaign đã gây quỹ thành công: 1"/)
  assert.match(html, /Legacy completed comic/)
  assert.match(html, /Đã hoàn tất/)
  assert.doesNotMatch(html, /Legacy stopped comic|Thất bại · hoàn tiền/)
})

test('legacy history route opens the funded category inside the Editions feed', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'activation'], [])
  client.setQueryData(['reward-editions-public', 'funding'], [])
  client.setQueryData(['reward-public-campaigns'], [legacyCampaign('legacy-complete', 'Legacy completed comic', 4, 'COMPLETED')])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PublicArea, {
    path: '/reward/history', session: null, sessionLoading: false, error: '', onSession: () => {},
  })))
  client.clear()

  assert.match(html, /aria-pressed="true"[^>]*>Đã gây quỹ/)
  assert.match(html, /Legacy completed comic/)
  assert.doesNotMatch(html, /Campaign Reward đã tồn tại/)
})

test('public Editions feed renders a neutral empty state without a creator action', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'activation'], [])
  client.setQueryData(['reward-editions-public', 'funding'], [])
  client.setQueryData(['reward-public-campaigns'], [])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsFeed)))
  client.clear()

  assert.match(html, /editions-feed-empty/)
  assert.match(html, /Chưa có ấn phẩm nào/)
  assert.doesNotMatch(html, /edition-empty-state|Tạo bản thảo|Bắt đầu xuất bản tác phẩm|#\/reward\/creator/)
})

test('public Editions feed does not render the obsolete pilot policy banner', () => {
  const html = renderFeed()
  assert.doesNotMatch(html, /Pilot local · MockUSDC|Không ứng tiền|Không cam kết lưu trữ vĩnh viễn hay DRM/)
})

test('community review has its own page and preserves the public review explanation', () => {
  const html = renderReviewPage()
  assert.match(html, /Community Review/)
  assert.doesNotMatch(html, /reward-hero|FundTogether Editions · Community/)
  assert.match(html, /Review comic/)
  assert.match(html, /Đang lấy ý kiến cộng đồng — chưa được Resolver duyệt/)
  assert.match(html, /chưa được duyệt và chưa mở pledge/)
})

test('community review page has a compact empty state', () => {
  const html = renderReviewPage([])
  assert.match(html, /Chưa có hồ sơ nào đang mở community review\./)
})

test('public router exposes community review as a standalone page', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'review'], [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PublicArea, {
    path: '/reward/review', session: null, sessionLoading: false, error: '', onSession: () => {},
  })))
  client.clear()
  assert.match(html, /Community Review/)
  assert.match(html, /aria-current="page"/)
  assert.doesNotMatch(html, /Không tìm thấy trang/)
})

test('Creator feedback view is read-only while community and Resolver retain the advisory form', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const props = { id: 'edition', userId: 'user', commitmentHash: `0x${'1'.repeat(64)}` }
  client.setQueryData(['reward-editions-feedback', 'edition', 'user'], { items: [], canSubmit: true })
  const creator = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsCommunity, { ...props, viewerMode: 'creator' })))
  const community = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsCommunity, { ...props, viewerMode: 'community' })))
  const resolver = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsCommunity, { ...props, viewerMode: 'resolver' })))
  client.clear()
  assert.match(creator, /chỉ đọc|không thể gửi phản hồi/i)
  assert.doesNotMatch(creator, /Gửi phản hồi có tài khoản|<form/)
  assert.match(community, /Gửi phản hồi có tài khoản/)
  assert.match(resolver, /Gửi phản hồi có tài khoản/)
})

test('EditorialCampaignCard renders cover anchor, friendly state, summary, and one primary CTA', () => {
  const item = preview('c1', 'Huyền Thoại Sơn Tinh', 'FUNDING', 'APPROVED')
  const state = getCampaignUiState({ status: 'APPROVED', chainState: 0 })
  const html = renderToStaticMarkup(createElement(EditorialCampaignCard, {
    campaign: item,
    state,
    href: '#/reward/editions/c1',
  }))

  assert.match(html, /Huyền Thoại Sơn Tinh/)
  assert.match(html, /A digital comic pitch/)
  assert.match(html, /editorial-campaign-card__cover/)
  assert.match(html, /Đang gây quỹ/)
  assert.match(html, /href="#\/reward\/editions\/c1"/)
  // Only one primary action button / link
  const actionMatches = html.match(/class="[^"]*button--primary[^"]*"/g) || []
  assert.equal(actionMatches.length, 1)
  // Technical code is not primary headline
  assert.doesNotMatch(html, />FUNDING</)
})

test('EditionProgressChart outputs accessible integer-safe text summary without float artifacts', () => {
  // 10 MockUSDC (10_000_000) of 100 MockUSDC (100_000_000)
  const html = renderToStaticMarkup(createElement(EditionProgressChart, {
    pledged: '10000000',
    goal: '100000000',
  }))

  assert.match(html, /10 MockUSDC trên mục tiêu 100 MockUSDC/)
  assert.match(html, /10%/)
  assert.match(html, /aria-label="Tiến độ gây quỹ: 10 MockUSDC trên mục tiêu 100 MockUSDC"/)

  // Zero pledged empty state
  const zeroHtml = renderToStaticMarkup(createElement(EditionProgressChart, {
    pledged: '0',
    goal: '100000000',
  }))
  assert.match(zeroHtml, /Chưa có pledge · Mục tiêu 100 MockUSDC/)
})

test('EditionTimeline renders ordered lifecycle steps with tones and accessible semantics', () => {
  const events = [
    { label: 'Khóa hồ sơ', detail: 'Đã hoàn tất kiểm tra IP', tone: 'done' },
    { label: 'Thẩm định', detail: 'Resolver đã chấp thuận', tone: 'done' },
    { label: 'Gây quỹ', detail: 'Đang mở cho backer ủng hộ', tone: 'current' },
    { label: 'Phát hành PDF', detail: 'Chờ duyệt bản PDF cuối', tone: 'pending' },
  ]
  const html = renderToStaticMarkup(createElement(EditionTimeline, { events }))

  assert.match(html, /edition-timeline/)
  assert.match(html, /Khóa hồ sơ/)
  assert.match(html, /Gây quỹ/)
  assert.match(html, /edition-timeline__item--done/)
  assert.match(html, /edition-timeline__item--current/)
  assert.match(html, /edition-timeline__item--pending/)
})

