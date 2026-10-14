import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

const server = await createServer({ mode: 'reward', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { EditionsFeed, EditionsCommunity } = await server.ssrLoadModule('/src/features/reward/EditionsCampaign.tsx')

const preview = (id, title, surface, status = 'APPROVED') => ({
  id, status, surface, reviewStartedAt: status === 'UNDER_REVIEW' ? '2026-10-15T00:00:00.000Z' : null,
  reviewDeadlineAt: status === 'UNDER_REVIEW' ? '2026-10-16T00:00:00.000Z' : null,
  reviewState: status === 'UNDER_REVIEW' ? 'ACTIVE' : null, commitmentHash: `0x${'1'.repeat(64)}`,
  config: { title, pitch: 'A digital comic pitch', story: 'A complete digital comic story.', goal: '10000000', fundingDuration: 86400,
    tiers: [{ title: 'Standard', description: 'One PDF', price: '10000000', rewardItems: [{ title: 'PDF', description: 'One PDF' }] }] },
  creatorDisplayName: 'Creator', contentOutline: 'Content outline', budgetPlan: 'Budget plan', evidencePlan: 'Evidence plan',
  feedbackCount: 0, decisions: [], releaseWindow: { start: '2026-10-15T00:00:00.000Z', end: '2026-11-15T00:00:00.000Z' }, evidenceHashes: [],
})

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-editions-public', 'review'], [preview('review', 'Review comic', 'REVIEW', 'UNDER_REVIEW')])
  client.setQueryData(['reward-editions-public', 'activation'], [preview('activation', 'Activation comic', 'ACTIVATION_PENDING')])
  client.setQueryData(['reward-editions-public', 'funding'], [preview('funding', 'Funding comic', 'FUNDING')])
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(EditionsFeed)))
  client.clear()
  return html
}

test('public Editions feed separates Resolver review, activation and live funding', () => {
  const html = renderFeed()
  assert.match(html, /Đang chờ Resolver thẩm định/)
  assert.match(html, /Chờ Creator và Resolver kích hoạt/)
  assert.match(html, /Đang gây quỹ/)
  assert.match(html, /Review comic/)
  assert.match(html, /Activation comic/)
  assert.match(html, /Funding comic/)
  assert.match(html, /SLA tham khảo: Resolver có 24 giờ để xử lý hồ sơ/)
  assert.match(html, /Community chỉ góp ý; không mở pledge/)
  assert.doesNotMatch(html, /Hồ sơ đã duyệt; xem trạng thái hợp đồng trong chi tiết\.<\/p>/)
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
