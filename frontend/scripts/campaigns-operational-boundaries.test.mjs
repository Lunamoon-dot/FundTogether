import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { ReviewQueue } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ReviewQueue.tsx')
const { CreatorPipeline } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/CreatorPipeline.tsx')
const { getCampaignUiState } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/campaignState.ts')

const campaign = { id: 'campaign', title: 'Canonical comic', status: 'APPROVED', onchainCampaignId: null }
const funding = { campaignId: 'campaign', publicationStatus: 'ON_CHAIN_CONFIRMED', contractState: 0, onchainCampaignId: '9' }

test('canonical funding leaves activation and uses one compatible state label', () => {
  const queue = renderToStaticMarkup(createElement(ReviewQueue, { campaigns: [campaign], operations: [funding], onSelect: () => {} }))
  const pipeline = renderToStaticMarkup(createElement(CreatorPipeline, { campaigns: [campaign], operations: [funding] }))
  const state = getCampaignUiState({ status: 'APPROVED', publicationStatus: 'ON_CHAIN_CONFIRMED', chainState: 0, role: 'resolver' })

  assert.doesNotMatch(queue, /Chờ kích hoạt/)
  assert.match(queue, /Đang gây quỹ/)
  assert.match(queue, /Đang gây quỹ/)
  assert.match(queue, /On-chain #9/)
  assert.match(pipeline, /Đang gây quỹ: 1/)
  assert.equal(state.label, 'Đang gây quỹ')
})

test('orphaned publication stays in recovery and never renders as funding', () => {
  const operation = { ...funding, publicationStatus: 'ORPHANED', contractState: null, onchainCampaignId: null }
  const queue = renderToStaticMarkup(createElement(ReviewQueue, { campaigns: [campaign], operations: [operation], onSelect: () => {} }))
  const state = getCampaignUiState({ status: 'APPROVED', publicationStatus: 'ORPHANED', chainState: null, role: 'resolver' })
  assert.match(queue, /Cần đối chiếu giao dịch/)
  assert.doesNotMatch(queue, /Đang gây quỹ/)
  assert.equal(state.technicalCode, 'ORPHANED')

  const publishedState = getCampaignUiState({ status: 'PUBLISHED', publicationStatus: 'ORPHANED', chainState: null, role: 'creator' })
  assert.equal(publishedState.technicalCode, 'ORPHANED')
  assert.equal(publishedState.label, 'Cần đối chiếu giao dịch')
})

test('Admin and Creator use campaign operations instead of historical publication fields', async () => {
  const admin = await readFile(new URL('../src/features/campaigns/resolver/AdminConsole.tsx', import.meta.url), 'utf8')
  const creator = await readFile(new URL('../src/features/campaigns/creator/Studio.tsx', import.meta.url), 'utf8')
  assert.match(admin, /campaignApi\.operations\('admin'/)
  assert.doesNotMatch(admin, /listHistoricalCampaigns/)
  assert.match(admin, /publicationStatus === 'NOT_PUBLISHED'/)
  assert.match(admin, /publicationStatus === 'ORPHANED'/)
  assert.match(admin, /publicationStatus === 'ON_CHAIN_CONFIRMED' && c\.contractState === null/)
  assert.match(admin, /contract state FUNDING/)
  assert.match(creator, /campaignApi\.operations\('creator'/)
  assert.match(creator, /\['DRAFT', 'FROZEN', 'CHANGES_REQUESTED'\]\.includes\(c\.status\) && <PreparationPanel/)
})
