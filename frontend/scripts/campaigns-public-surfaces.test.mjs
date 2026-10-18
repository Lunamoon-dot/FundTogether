import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { Feed, CommunityReviewPage } = await server.ssrLoadModule('/src/features/campaigns/public/Feed.tsx')
const { CommunityPanel } = await server.ssrLoadModule('/src/features/campaigns/public/Community.tsx')
const { PublicArea } = await server.ssrLoadModule('/src/features/explore/PublicArea.tsx')
const { EditorialCampaignCard } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/EditorialCampaignCard.tsx')
const { ProgressChart } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ProgressChart.tsx')
const { Timeline } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/Timeline.tsx')
const { getCampaignUiState } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/campaignState.ts')
const publicCampaignPageSource = await readFile(new URL('../src/features/campaigns/public/CampaignPage.tsx', import.meta.url), 'utf8')

const preview = (id, title, surface, status = 'APPROVED') => ({
  id, status, surface, reviewStartedAt: status === 'COMMUNITY_REVIEW' ? '2026-10-15T00:00:00.000Z' : null,
  commitmentHash: `0x${'1'.repeat(64)}`,
  config: { title, pitch: 'A digital comic pitch', story: 'A complete digital comic story.', goal: '10000000', fundingDuration: 86400,
    tiers: [{ title: 'Standard', description: 'One PDF', price: '10000000', benefitItems: [{ title: 'PDF', description: 'One PDF' }] }] },
  creatorDisplayName: 'Creator', contentOutline: 'Content outline', budgetPlan: 'Budget plan', evidencePlan: 'Evidence plan',
  feedbackCount: 0, decisions: [], evidenceHashes: [],
})

function renderFeed(initialFilter = 'all') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'review'], [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')])
  client.setQueryData(['campaign-campaign-public', 'activation'], [preview('activation', 'Activation comic', 'ACTIVATION_PENDING')])
  client.setQueryData(['campaign-campaign-public', 'orphaned'], [])
  client.setQueryData(['campaign-campaign-public', 'funding'], [preview('funding', 'Funding comic', 'FUNDING')])
  client.setQueryData(['campaign-campaign-public', 'funded'], [preview('funded', 'Funded comic', 'FUNDED', 'PUBLISHED')])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Feed, { initialFilter })))
  client.clear()
  return html
}

function renderReviewPage(items = [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'review'], items)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CommunityReviewPage)))
  client.clear()
  return html
}

test('public Campaign feed keeps activation and funding campaigns in separate filters', () => {
  const html = renderFeed()
  assert.match(html, /Chờ kích hoạt/)
  assert.match(html, /aria-label="Chờ Creator và Resolver kích hoạt: 1"/)
  assert.match(html, /Đang gây quỹ/)
  assert.match(html, /Activation comic/)
  assert.match(html, /Funding comic/)
  assert.match(html, /Funded comic/)
  assert.doesNotMatch(html, /Review comic/)
  assert.doesNotMatch(html, /Community review đang mở/)
  assert.doesNotMatch(html, /Hồ sơ đã duyệt; xem trạng thái hợp đồng trong chi tiết\.<\/p>/)
})

test('public campaign surface does not surface private publication errors', () => {
  assert.doesNotMatch(publicCampaignPageSource, /publicationTerms|showPublicationTermsError|approveCampaign|createCampaign/)
  assert.match(publicCampaignPageSource, /campaignApi\.evidence\(id, false/)
  assert.match(publicCampaignPageSource, /campaignApi\.entitlements\(signal\)/)
})

test('published campaign without a current binding is labeled as activation pending', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'activation'], [preview('published-activation', 'Published but unbound', 'ACTIVATION_PENDING', 'PUBLISHED')])
  client.setQueryData(['campaign-campaign-public', 'funding'], [])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Feed)))
  client.clear()

  assert.match(html, /Published but unbound/)
  assert.match(html, /Chờ kích hoạt/)
  assert.doesNotMatch(html, />PUBLISHED</)
})

test('funded filter reports canonical successful Campaign surfaces', () => {
  const html = renderFeed('funded')

  assert.match(html, /aria-label="Campaign đã gây quỹ thành công: 1"/)
  assert.match(html, /Funded comic/)
  assert.doesNotMatch(html, /Chưa có campaign nào đã gây quỹ thành công/)
  assert.doesNotMatch(html, /historical|legacy|quyền lợi/i)
})

test('public feed preserves the canonical production state for funded campaigns', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'activation'], [])
  client.setQueryData(['campaign-campaign-public', 'funding'], [])
  client.setQueryData(['campaign-campaign-public', 'funded'], [
    { ...preview('production', 'Production comic', 'FUNDED', 'PUBLISHED'), chainState: 1 },
  ])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Feed, { initialFilter: 'funded' })))
  client.clear()

  assert.match(html, /Production comic/)
  assert.match(html, /Đang sản xuất/)
  assert.equal((html.match(/campaign-status-badge__label">Chờ kích hoạt/g) || []).length, 0)
})

test('public feed labels a campaign from an older deployment for reconciliation', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'activation'], [])
  client.setQueryData(['campaign-campaign-public', 'funding'], [])
  client.setQueryData(['campaign-campaign-public', 'funded'], [])
  client.setQueryData(['campaign-campaign-public', 'orphaned'], [
    { ...preview('orphaned', 'Old deployment comic', 'ORPHANED', 'PUBLISHED') },
  ])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Feed)))
  client.clear()

  assert.match(html, /Old deployment comic/)
  assert.match(html, /Cần đối chiếu giao dịch/)
  assert.equal((html.match(/campaign-status-badge__label">Chờ kích hoạt/g) || []).length, 0)
})

test('historical route does not leak records into the current Campaign feed', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'activation'], [])
  client.setQueryData(['campaign-campaign-public', 'funding'], [])
  client.setQueryData(['campaign-campaign-public', 'funded'], [])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PublicArea, {
    path: '/campaigns/history', session: null, sessionLoading: false, error: '', onSession: () => {},
  })))
  client.clear()

  assert.match(html, /aria-pressed="true"[^>]*>Đã gây quỹ/)
  assert.match(html, /Chưa có campaign nào đã gây quỹ thành công/)
  assert.doesNotMatch(html, /campaign-public-campaigns|historical|legacy/i)
})

test('public Campaign feed renders a neutral empty state without a creator action', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'activation'], [])
  client.setQueryData(['campaign-campaign-public', 'funding'], [])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Feed)))
  client.clear()

  assert.match(html, /campaign-feed-empty/)
  assert.match(html, /Chưa có ấn phẩm nào/)
  assert.doesNotMatch(html, /campaign-empty-state|Tạo bản thảo|Bắt đầu xuất bản tác phẩm|#\/campaigns\/creator/)
})

test('public Campaign feed does not render the obsolete pilot policy banner', () => {
  const html = renderFeed()
  assert.doesNotMatch(html, /Pilot local · MockUSDC|Không ứng tiền|Không cam kết lưu trữ vĩnh viễn hay DRM/)
})

test('community review has its own page and preserves the public review explanation', () => {
  const html = renderReviewPage()
  assert.match(html, /Community Review/)
  assert.doesNotMatch(html, /campaign-hero|FundTogether · Community/)
  assert.match(html, /Review comic/)
  assert.match(html, /Đang lấy ý kiến cộng đồng · Chưa mở ủng hộ/)
  assert.match(html, /chưa được duyệt và chưa mở pledge/)
})

test('community review page has a compact empty state', () => {
  const html = renderReviewPage([])
  assert.match(html, /Chưa có hồ sơ nào đang mở community review\./)
})

test('public router exposes community review as a standalone page', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-campaign-public', 'review'], [preview('review', 'Review comic', 'REVIEW', 'COMMUNITY_REVIEW')])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PublicArea, {
    path: '/campaigns/review', session: null, sessionLoading: false, error: '', onSession: () => {},
  })))
  client.clear()
  assert.match(html, /Community Review/)
  assert.match(html, /aria-current="page"/)
  assert.doesNotMatch(html, /Không tìm thấy trang/)
})

test('Creator feedback view can respond while community and Resolver retain a read-only feedback page', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const props = { id: 'campaign', userId: 'user', commitmentHash: `0x${'1'.repeat(64)}` }
  client.setQueryData(['campaign-campaign-feedback', 'campaign', 'user'], { items: [], responses: [], canSubmit: true, canRespond: true })
  const creator = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CommunityPanel, { ...props, viewerMode: 'creator' })))
  const community = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CommunityPanel, { ...props, viewerMode: 'community' })))
  const resolver = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(CommunityPanel, { ...props, viewerMode: 'resolver' })))
  client.clear()
  assert.match(creator, /ĐỌC &amp; PHẢN HỒI/)
  assert.match(creator, /Gửi phản hồi Creator|<form/)
  assert.match(community, /nút “Gửi góp ý”/)
  assert.match(resolver, /nút “Gửi góp ý”/)
  assert.doesNotMatch(community, /Nội dung đang kiểm tra/)
  assert.doesNotMatch(resolver, /Nội dung đang kiểm tra/)
})

test('EditorialCampaignCard renders cover anchor, friendly state, summary, and one primary CTA', () => {
  const item = preview('c1', 'Huyền Thoại Sơn Tinh', 'FUNDING', 'APPROVED')
  const state = getCampaignUiState({ status: 'APPROVED', chainState: 0 })
  const html = renderToStaticMarkup(createElement(EditorialCampaignCard, {
    campaign: item,
    state,
    href: '#/campaigns/c1',
  }))

  assert.match(html, /Huyền Thoại Sơn Tinh/)
  assert.match(html, /A digital comic pitch/)
  assert.match(html, /editorial-campaign-card__cover/)
  assert.match(html, /Đang gây quỹ/)
  assert.match(html, /href="#\/campaigns\/c1"/)
  // Only one primary action button / link
  const actionMatches = html.match(/class="[^"]*button--primary[^"]*"/g) || []
  assert.equal(actionMatches.length, 1)
  // Technical code is not primary headline
  assert.doesNotMatch(html, />FUNDING</)
})

test('ProgressChart outputs accessible integer-safe text summary without float artifacts', () => {
  // 10 MockUSDC (10_000_000) of 100 MockUSDC (100_000_000)
  const html = renderToStaticMarkup(createElement(ProgressChart, {
    pledged: '10000000',
    goal: '100000000',
  }))

  assert.match(html, /10 MockUSDC trên mục tiêu 100 MockUSDC/)
  assert.match(html, /10%/)
  assert.match(html, /aria-label="Tiến độ gây quỹ: 10 MockUSDC trên mục tiêu 100 MockUSDC"/)

  // Zero pledged empty state
  const zeroHtml = renderToStaticMarkup(createElement(ProgressChart, {
    pledged: '0',
    goal: '100000000',
  }))
  assert.match(zeroHtml, /Chưa có pledge · Mục tiêu 100 MockUSDC/)
})

test('Timeline renders ordered lifecycle steps with tones and accessible semantics', () => {
  const events = [
    { label: 'Khóa hồ sơ', detail: 'Đã hoàn tất kiểm tra IP', tone: 'done' },
    { label: 'Thẩm định', detail: 'Resolver đã chấp thuận', tone: 'done' },
    { label: 'Gây quỹ', detail: 'Đang mở cho backer ủng hộ', tone: 'current' },
    { label: 'Phát hành PDF', detail: 'Chờ duyệt bản PDF cuối', tone: 'pending' },
  ]
  const html = renderToStaticMarkup(createElement(Timeline, { events }))

  assert.match(html, /campaign-timeline/)
  assert.match(html, /Khóa hồ sơ/)
  assert.match(html, /Gây quỹ/)
  assert.match(html, /campaign-timeline__item--done/)
  assert.match(html, /campaign-timeline__item--current/)
  assert.match(html, /campaign-timeline__item--pending/)
})

