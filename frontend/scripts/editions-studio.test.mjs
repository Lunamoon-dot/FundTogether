import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { createServer } from 'vite'

const server = await createServer({ mode: 'reward', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { RewardCreatorStudio } = await server.ssrLoadModule('/src/features/reward/RewardCreatorStudio.tsx')
const { EditionsResolverReview } = await server.ssrLoadModule('/src/features/reward/EditionsReview.tsx')
const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })

function render(campaigns = [], actor = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['my-reward-creator-profile', 'owner'], { status: 'VERIFIED', displayName: 'Comic artist' })
  client.setQueryData(['my-reward-campaigns', 'owner'], campaigns)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config },
    createElement(QueryClientProvider, { client }, createElement(RewardCreatorStudio, { userId: actor }))))
  client.clear()
  return html
}

test('new creator form offers one PDF without a physical, inventory or add-tier input', () => {
  const html = render()
  assert.match(html, /FundTogether Editions/)
  assert.match(html, /COMICS_ARTBOOK/)
  assert.match(html, /Standard · Một PDF tải xuống/)
  assert.doesNotMatch(html, /<select|type="checkbox"|Thêm gói|Số lượng tối đa|Vật phẩm đi kèm/)
})

test('Editions cards cannot offer legacy publish or physical actions even with advanced statuses', () => {
  for (const status of ['DRAFT', 'FROZEN', 'APPROVED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE']) {
    const html = render([{ id: 'edition', category: 'COMICS_ARTBOOK', title: 'An Editions draft', goal: '10000000', status, tiers: [] }])
    assert.match(html, /chưa nhận pledge/)
    assert.doesNotMatch(html, /Phát hành On-chain|Đóng băng cam kết|Yêu cầu cọc in|Quản lý Giao hàng|Xem công khai/)
  }
  const legacy = render([{ id: 'existing', category: 'COMICS', draftConfig: null, title: 'An existing campaign', goal: '10000000', status: 'PRODUCTION_VERIFIED', tiers: [] }])
  assert.doesNotMatch(legacy, /Quản lý Giao hàng/)
});

test('saved Editions card shows the promised PDF and exact proposed price and goal', () => {
  const html = render([{ id: 'edition', category: 'COMICS_ARTBOOK', title: 'Saigon story', goal: '9007199254740993', status: 'DRAFT', tiers: [],
    draftConfig: { tiers: [{ price: '10000001', rewardItems: [{ title: 'Saigon final PDF', description: 'A complete 120-page comic PDF.' }] }] } }])
  assert.match(html, /Saigon final PDF/)
  assert.match(html, /A complete 120-page comic PDF\./)
  assert.match(html, /10\.000001 MockUSDC/)
  assert.match(html, /9007199254\.740993/)
})

function reviewCampaign(status = 'UNDER_REVIEW') {
  return { id: 'edition', title: 'Saigon comic', status, commitmentHash: `0x${'1'.repeat(64)}`, frozenSnapshot: {
    config: { title: 'Saigon comic', pitch: 'An illustrated city story', story: 'The complete frozen story.', goal: '9007199254740993', fundingDuration: 2592000,
      tiers: [{ title: 'Standard edition', description: 'Digital comic', price: '10000001', rewardItems: [{ title: 'Final PDF', description: 'A 120-page illustrated comic.' }] }] },
    creator: { displayName: 'Creator', ipDeclaration: 'I hold publication rights.' }, payoutWallet: { address: '0x1234', chainId: '31339' },
    preparation: { contentOutline: 'Twelve chapters', budgetPlan: 'Art and editing work', evidencePlan: 'Page proofs', releaseWindow: { start: '2027-01-01', end: '2027-02-01' } },
    samples: [{ id: 'sample', mediaType: 'image/png', sizeBytes: 100, sha256: `0x${'2'.repeat(64)}` }],
  } }
}

test('Resolver sees the frozen evidence/terms and must enter a decision reason', () => {
  const html = renderToStaticMarkup(createElement(EditionsResolverReview, { campaign: reviewCampaign(), onChange() {} }))
  for (const term of ['Twelve chapters', 'Art and editing work', 'Page proofs', 'A 120-page illustrated comic.', 'I hold publication rights.', '10.000001', '9007199254.740993']) assert.ok(html.includes(term))
  assert.match(html, /<textarea/)
  assert.match(html, /disabled=""[^>]*>Duyệt hồ sơ PDF/)
  assert.doesNotMatch(html, /approveAndDisburse|activateCampaign|Giải ngân|Giao nhận/)
})

test('reviewed or rejected Editions have no second decision action', () => {
  for (const status of ['APPROVED', 'STOPPED']) {
    const html = renderToStaticMarkup(createElement(EditionsResolverReview, { campaign: reviewCampaign(status), onChange() {} }))
    assert.doesNotMatch(html, /<textarea|Duyệt hồ sơ PDF|Yêu cầu sửa/)
    assert.match(html, /chưa cho phép nhận pledge/)
  }
})

test('switching creator accounts cannot render the previous account cached draft', () => {
  const html = render([{ id: 'private', category: 'COMICS_ARTBOOK', title: 'CONFIDENTIAL DRAFT FROM OWNER', goal: '10000000', status: 'DRAFT', tiers: [] }], 'stranger')
  assert.doesNotMatch(html, /CONFIDENTIAL DRAFT FROM OWNER/)
})
