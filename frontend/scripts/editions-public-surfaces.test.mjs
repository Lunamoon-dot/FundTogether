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

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'review'], [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')])
  client.setQueryData(['reward-editions-public', 'activation'], [preview('activation', 'Activation comic', 'ACTIVATION_PENDING')])
  client.setQueryData(['reward-editions-public', 'funding'], [preview('funding', 'Funding comic', 'FUNDING')])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsFeed)))
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

test('public Editions feed keeps activation and funding separate from community review', () => {
  const html = renderFeed()
  assert.match(html, /Chờ Creator và Resolver kích hoạt/)
  assert.match(html, /Đang gây quỹ/)
  assert.match(html, /Activation comic/)
  assert.match(html, /Funding comic/)
  assert.match(html, /Community Review/)
  assert.match(html, /#\/reward\/review/)
  assert.doesNotMatch(html, /Review comic/)
  assert.doesNotMatch(html, /Community review đang mở/)
  assert.doesNotMatch(html, /Hồ sơ đã duyệt; xem trạng thái hợp đồng trong chi tiết\.<\/p>/)
})

test('public Editions feed does not render the obsolete pilot policy banner', () => {
  const html = renderFeed()
  assert.doesNotMatch(html, /Pilot local · MockUSDC|Không ứng tiền|Không cam kết lưu trữ vĩnh viễn hay DRM/)
})

test('community review has its own page and preserves the public review explanation', () => {
  const html = renderReviewPage()
  assert.match(html, /Community Review/)
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

