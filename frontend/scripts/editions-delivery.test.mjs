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
function campaign(access, state = 3) {
  return render(EditionsCampaign, { id: 'edition', session: { userId: 'owner', roles: [], wallets: [] } }, [
    [['reward-editions-public', 'edition'], preview],
    [['reward-editions-chain', 'edition'], { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', deployment: {}, challenges: [], snapshot: { state, raised: '10000001', escrowed: '10000001', fundingDeadline: '1791900000', releaseDeadline: '1794900000', challengeDeadline: '1795000000', openDisputes: '0', productionApproved: true, productionHash: hash } }],
    [['reward-editions-evidence', 'edition', 'public'], []],
    [['reward-editions-entitlements', 'owner'], [{ id: 'right', campaignId: 'edition', amountPaid: '10000001', access, confirmedAt: null }]],
    [['reward-editions-feedback', 'edition', 'owner'], []],
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
test('community feedback is account-scoped and clearly advisory', () => {
  const html = render(EditionsCommunity, { id: 'edition', userId: 'new-user', commitmentHash: hash }, [
    [['reward-editions-feedback', 'edition', 'old-user'], [{ id: 'private', body: 'PRIVATE OLD REPORT' }]],
  ])
  assert.doesNotMatch(html, /PRIVATE OLD REPORT/)
  assert.match(html, /không tự khóa hay chuyển tiền/)
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
