import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
after(() => server.close())
test('funding progress is exact and never implies execution completion', async () => {
  const { FundingProgress } = await server.ssrLoadModule('/src/features/explore/PublicCampaignUI.tsx')
  const html = renderToStaticMarkup(createElement(FundingProgress, { contributed: '2200000000', goal: '2200000000' }))
  assert.match(html, /100%/)
  assert.match(html, /ngân sách gây quỹ/)
  assert.doesNotMatch(html, /hoàn thành/)
  assert.match(html, /MockUSDC/)
})
test('state explanation distinguishes review, finalization and money already advanced', async () => {
  const { publicState } = await server.ssrLoadModule('/src/features/explore/public-campaign-view.ts')
  assert.match(publicState.FIRST_REVIEW.next, /xác nhận/)
  assert.match(publicState.CHALLENGE_WINDOW.next, /chốt/)
  assert.match(publicState.CASE_OPEN.next, /khóa/)
  assert.match(publicState.STOPPED.next, /hoàn/)
})
test('public navigation gives anonymous readers no staff actions and keeps known routes', async () => {
  const { PublicHeader } = await server.ssrLoadModule('/src/features/explore/PublicHeader.tsx')
  const html = renderToStaticMarkup(createElement(PublicHeader, { path: '/', session: null }))
  assert.match(html, /href="#\/contributions"/)
  assert.doesNotMatch(html, /href="#\/internal/)
  assert.match(html, /Mạng thử nghiệm/)
})
