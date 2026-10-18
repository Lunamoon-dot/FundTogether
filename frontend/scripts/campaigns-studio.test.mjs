import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { Studio } = await server.ssrLoadModule('/src/features/campaigns/creator/Studio.tsx')
const { Profile } = await server.ssrLoadModule('/src/features/campaigns/creator/Profile.tsx')
const { PreparationPanel } = await server.ssrLoadModule('/src/features/campaigns/creator/PreparationForm.tsx')
const { NewPreparationPanel } = await server.ssrLoadModule('/src/features/campaigns/creator/NewPreparationForm.tsx')
const { ResolverReview } = await server.ssrLoadModule('/src/features/campaigns/resolver/ReviewPanel.tsx')
const { CreatorPipeline } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/CreatorPipeline.tsx')
const { isCreatorActionable } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/creatorTaskUtils.ts')
const { CreatorTaskCard } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/CreatorTaskCard.tsx')
const { ReviewQueue } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ReviewQueue.tsx')
const { ReviewHistoryDisclosure } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ReviewHistoryDisclosure.tsx')
const { TransactionLifecycle } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/TransactionLifecycle.tsx')
const { Console } = await server.ssrLoadModule('/src/features/campaigns/resolver/Console.tsx')
const { ResolverCase } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ResolverCase.tsx')
const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })

function render(campaigns = [], actor = 'owner', path, operations = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['my-campaign-creator-profile', 'owner'], { status: 'VERIFIED', displayName: 'Comic artist' })
  client.setQueryData(['my-campaign-campaigns', 'owner'], campaigns)
  client.setQueryData(['campaign-campaign-operations', 'creator', actor], operations)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config },
    createElement(QueryClientProvider, { client }, createElement(Studio, { userId: actor, path }))))
  client.clear()
  return html
}

function renderPreparation(campaign, feedback) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (feedback) client.setQueryData(['campaign-campaign-feedback', campaign.id, campaign.creatorUserId], feedback)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(PreparationPanel, { campaign, onChange() {} })))
  client.clear()
  return html
}

function renderProfile(profile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['my-campaign-creator-profile', 'owner'], profile)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(Profile, { userId: 'owner' })))
  client.clear()
  return html
}

function renderNewPreparation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(NewPreparationPanel, { onCreated() {} })))
  client.clear()
  return html
}

function renderResolver(campaigns = [], disputes = [], cases = [], operations = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-resolver-campaigns', 'resolver'], campaigns)
  client.setQueryData(['campaign-resolver-disputes', 'resolver'], disputes)
  client.setQueryData(['campaign-campaign-resolver-cases', 'resolver'], cases)
  client.setQueryData(['campaign-campaign-operations', 'resolver', 'resolver'], operations)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config },
    createElement(QueryClientProvider, { client }, createElement(Console, { userId: 'resolver' }))))
  client.clear()
  return html
}

test('Resolver console uses compact, role-aware empty states', () => {
  const html = renderResolver()
  assert.match(html, /Chiến dịch cần xử lý <span[^>]*>0<\/span>/)
  assert.match(html, /Không có chiến dịch nào cần thẩm định lúc này\./)
  assert.doesNotMatch(html, /Khiếu nại cần phân xử/)
  assert.doesNotMatch(html, /Flow V2 – V4/)
  assert.doesNotMatch(html, /tài khoản hiện tại không có quyền RESOLVER/)
})

test('Resolver console shows canonical on-chain campaigns when the review list is empty', () => {
  const html = renderResolver([], [], [], [{
    campaignId: 'campaign-1',
    title: 'nuôi Huy',
    creatorUserId: 'creator',
    applicationStatus: 'PUBLISHED',
    publicationStatus: 'ON_CHAIN_CONFIRMED',
    onchainCampaignId: '0',
    contractState: 0,
    snapshot: null,
    bindingTransactionHash: null,
  }])
  assert.match(html, /Campaign on-chain cần xử lý/)
  assert.match(html, /nuôi Huy/)
  assert.match(html, /Mở workspace on-chain/)
  assert.match(html, /href="#\/campaigns\/resolver\/campaign-1"/)
})

test('canonical funding campaign keeps its on-chain workspace link beside the review panel', () => {
  const campaign = { ...reviewCampaign('PUBLISHED'), category: 'COMICS_ARTBOOK' }
  const html = renderResolver([campaign], [], [], [{
    campaignId: 'campaign',
    title: campaign.title,
    publicationStatus: 'ON_CHAIN_CONFIRMED',
    onchainCampaignId: '0',
    contractState: 0,
  }])
  assert.match(html, /Mở workspace on-chain/)
  assert.match(html, /href="#\/campaigns\/resolver\/campaign"/)
})

test('Resolver console contains only the active Campaign review flow', async () => {
  const source = await readFile(new URL('../src/features/campaigns/resolver/Console.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /approveAndDisburse|candidateExpenditure|finalizeExpenditure|recordProductionVerified|startWindDown/)
  assert.doesNotMatch(source, /listResolverHistoricalDisputes|historicalCampaignAbi|historicalCampaignAddress/)
  assert.doesNotMatch(source, /cọc in|nhà in|vận chuyển|giao hàng/i)
})

test('Resolver console makes the decision panel primary and community feedback secondary', () => {
  const campaign = { ...reviewCampaign('COMMUNITY_REVIEW'), category: 'COMICS_ARTBOOK' }
  const html = renderResolver([campaign])
  assert.match(html, /Quyết định Resolver/)
  assert.match(html, /Phản hồi cộng đồng/)
  assert.match(html, /resolver-community-details/)
  assert.ok(html.indexOf('Quyết định Resolver') < html.indexOf('Phản hồi cộng đồng'))
})

test('approved Campaign expose the on-chain action directly in the Resolver queue', () => {
  const campaign = { ...reviewCampaign('APPROVED'), category: 'COMICS_ARTBOOK' }
  const html = renderResolver([campaign])
  assert.match(html, /Mở trang xử lý on-chain →/)
  assert.match(html, /href="#\/campaigns\/resolver\/campaign"/)
})

test('published but unbound Campaign exposes activation workspace from Creator Studio', () => {
  const campaign = { ...reviewCampaign('PUBLISHED'), category: 'COMICS_ARTBOOK', creatorUserId: 'owner', goal: '9007199254740993', draftConfig: reviewCampaign('PUBLISHED').frozenSnapshot.config }
  const html = render([campaign], 'owner', '/campaigns/creator', [{
    campaignId: 'campaign', publicationStatus: 'NOT_PUBLISHED', contractState: null,
  }])
  assert.match(html, /chưa có campaign canonical/)
  assert.match(html, /Creator ký tạo campaign trên contract/)
  assert.match(html, /href="#\/campaigns\/creator\/campaign"/)
})

test('published but unbound Campaign appears as a Creator activation task', () => {
  const campaign = { ...reviewCampaign('PUBLISHED'), category: 'COMICS_ARTBOOK', creatorUserId: 'owner', goal: '9007199254740993', draftConfig: reviewCampaign('PUBLISHED').frozenSnapshot.config }
  const html = render([campaign], 'owner', '/campaigns/creator', [{
    campaignId: 'campaign', publicationStatus: 'NOT_PUBLISHED', contractState: null,
  }])

  assert.match(html, /Cần bạn làm \(1\)/)
  assert.match(html, /Mở trang kích hoạt on-chain/)
  assert.match(html, /href="#\/campaigns\/creator\/campaign"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/creator\?edit=campaign"/)
  assert.doesNotMatch(html, />PUBLISHED</)
  assert.match(html, /Được duyệt: 1/)
})

test('published but unbound Campaign is actionable from the Resolver queue', () => {
  const campaign = { ...reviewCampaign('PUBLISHED'), category: 'COMICS_ARTBOOK' }
  const html = renderResolver([campaign], [], [], [{
    campaignId: 'campaign', publicationStatus: 'NOT_PUBLISHED', contractState: null,
  }])
  assert.match(html, /Mở trang xử lý on-chain →/)
  assert.match(html, /href="#\/campaigns\/resolver\/campaign"/)
})

test('funded production task opens the campaign production workspace', () => {
  const campaign = {
    ...reviewCampaign('PUBLISHED'),
    id: 'c-production',
    category: 'COMICS_ARTBOOK',
    goal: '10000000',
    draftConfig: { tiers: [{ price: '20000000', benefitItems: [{ title: 'PDF', description: 'A PDF' }] }] },
  }
  const html = render([campaign], 'owner', '/campaigns/creator', [{
    campaignId: 'c-production',
    publicationStatus: 'ON_CHAIN_CONFIRMED',
    contractState: 1,
  }])
  assert.match(html, /Cập nhật tiến độ sản xuất/)
  assert.match(html, /href="#\/campaigns\/creator\/c-production\?tab=production"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/creator\?edit=c-production/)
})

test('Resolver console surfaces review cases separately from the funding queue', () => {
  const html = renderResolver([], [], [{
    id: 'case-1',
    status: 'OPEN',
    escalation: { id: 'case-1', threadId: 'thread-1', openerUserId: 'backer', reason: 'Please clarify the production evidence.', status: 'OPEN', resolverUserId: null, outcome: null, note: null, createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', resolvedAt: null },
    campaign: { id: 'campaign', title: 'Saigon comic', pitch: 'A city story', commitmentHash: '0xhash', frozenSnapshot: null },
    chain: { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', snapshot: { state: 1 }, challenges: [] },
    entitlement: { id: 'entitlement-1', backerUserId: 'backer', backerWallet: '0xbacker', amountPaid: '10000000', canonical: true, refunded: false, streamId: 'campaigns:current', transactionHash: '0xtx', blockNumber: '10' },
    feedback: [],
    thread: { id: 'thread-1', campaignId: 'campaign', entitlementId: 'entitlement-1', backerUserId: 'backer', creatorUserId: 'owner', targetHash: '0xhash', commitmentHash: '0xhash', status: 'ESCALATED', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', permissions: { canMessage: false, canEscalate: false, readOnlyReason: null }, escalation: null, messages: [] },
  }])
  assert.match(html, /Resolver cases/)
  assert.match(html, /Please clarify the production evidence\./)
})

test('new creator flow opens the single Campaign preparation wizard instead of a duplicate campaign form', () => {
  const html = render([], 'owner', '/campaigns/creator/draft')
  assert.match(html, /Bước 1 trên 3/)
  assert.match(html, /Thông tin ấn phẩm/)
  assert.doesNotMatch(html, /Tạo bản thảo FundTogether/)
})

test('Creator entry defaults to Studio without a tab switcher', () => {
  const html = render([], 'owner', '/campaigns/creator')

  assert.match(html, /Xưởng ấn phẩm/)
  assert.doesNotMatch(html, /campaign-tabs|Studio của tôi|Danh tính xuất bản &amp; bản quyền IP/)
})

test('Studio profile is isolated from the project workspace', () => {
  const html = renderProfile({
    id: 'profile', userId: 'owner', displayName: 'Comic artist', bio: 'Independent comic artist.',
    ipDeclaration: 'I own the publication rights.', status: 'VERIFIED', rejectionReason: null,
    verifiedBy: 'admin', verifiedAt: '2026-10-16T00:00:00.000Z', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
  })

  assert.match(html, /Hồ sơ Studio/)
  assert.match(html, /Comic artist|Independent comic artist|I own the publication rights/)
  assert.match(html, /class="studio-header-bio">Independent comic artist\.<\/p>/)
  assert.ok(html.indexOf('studio-header-bio') < html.indexOf('studio-nav-tabs'))
  assert.equal(html.match(/Independent comic artist\./g)?.length, 1)
  assert.doesNotMatch(html, /VĂN BẢN CAM KẾT PHÁP LÝ · SOVEREIGN IP/)
  assert.ok(html.indexOf('Ấn phẩm xuất bản') < html.indexOf('Tiểu sử &amp; Năng lực'))
  assert.doesNotMatch(html, /creator-pipeline|Dự án của bạn|Tạo bản thảo mới/)
})

test('Studio profile lists multiple portfolio and community links separately', () => {
  const html = renderProfile({
    id: 'profile', userId: 'owner', displayName: 'Comic artist', bio: 'Independent comic artist.',
    portfolioUrl: 'https://behance.net/comic-artist\nhttps://artstation.com/comic-artist',
    socialUrl: 'https://facebook.com/comic-artist\nhttps://instagram.com/comic-artist',
    ipDeclaration: 'I own the publication rights.', status: 'VERIFIED', rejectionReason: null,
    verifiedBy: 'admin', verifiedAt: '2026-10-16T00:00:00.000Z', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
  })

  assert.match(html, /href="https:\/\/behance\.net\/comic-artist"/)
  assert.match(html, /href="https:\/\/artstation\.com\/comic-artist"/)
  assert.match(html, /href="https:\/\/facebook\.com\/comic-artist"/)
  assert.match(html, /href="https:\/\/instagram\.com\/comic-artist"/)
  assert.match(html, /behance\.net/)
  assert.match(html, /instagram\.com/)
})

test('Studio profile renders Create Studio onboarding landing when unregistered', () => {
  const html = renderProfile(null)

  assert.match(html, /Khởi tạo Không gian Xuất bản Studio/)
  assert.match(html, /Khởi tạo Studio \(Create Studio\)/)
  assert.match(html, /Danh tính &amp; Bút danh Xuất bản/)
  assert.match(html, /Cam kết Bản quyền IP 100%/)
  assert.doesNotMatch(html, /Tác giả \/ Studio chưa đặt tên/)
  assert.doesNotMatch(html, /Vào Xưởng sáng tác →/)
})


test('saving a new draft keeps the creator in the step-three editor', async () => {
  const source = await readFile(new URL('../src/features/campaigns/creator/Studio.tsx', import.meta.url), 'utf8')
  assert.match(source, /initialStep=\{2\}/)
  assert.doesNotMatch(source, /window\.location\.hash = '#\/campaigns\/creator'/)
})

test('creator publication waits for the Resolver approval that exists on chain', async () => {
  const source = await readFile(new URL('../src/features/campaigns/creator/CampaignWorkspacePage.tsx', import.meta.url), 'utf8')
  const activation = await readFile(new URL('../src/features/campaigns/shared/ui/ActivationPanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /onchainApproved/)
  assert.match(source, /Primary Resolver chưa ký đúng commitment trên chain/)
  assert.match(activation, /Ký duyệt đúng commitment trên chain/)
})

test('new Campaign wizard offers one PDF without a physical, inventory or add-tier input', () => {
  const html = renderNewPreparation()
  assert.match(html, /FundTogether/)
  assert.match(html, /COMICS_ARTBOOK/)
  assert.match(html, /một Standard PDF tải xuống/)
  assert.doesNotMatch(html, /<select|type="checkbox"|Thêm gói|Số lượng tối đa|Vật phẩm đi kèm/)
})

test('sample upload states are explicit before and during persistence', async () => {
  const existingDraftSource = await readFile(new URL('../src/features/campaigns/creator/PreparationForm.tsx', import.meta.url), 'utf8')
  const newDraftSource = await readFile(new URL('../src/features/campaigns/creator/NewPreparationForm.tsx', import.meta.url), 'utf8')
  assert.match(newDraftSource, /sẽ được tải lên khi lưu bản nháp/)
  assert.match(existingDraftSource, /Đang tải tài liệu mẫu lên/)
  assert.match(existingDraftSource, /queryClient\.setQueryData/)
})

test('new draft form puts the story minimum beside the matching input', () => {
  const html = renderNewPreparation()
  assert.match(html, /Cốt truyện &amp; Kế hoạch sản xuất:.*tối thiểu 20 ký tự/s)
  assert.match(html, /minLength="20"/)
})

test('Campaign preparation form explains the three review groups and save versus lock', () => {
  const html = renderPreparation({
    id: 'campaign', creatorUserId: 'owner', status: 'DRAFT', revision: 1,
    draftConfig: { title: 'Saigon comic', pitch: 'An illustrated city story', story: 'The complete frozen story.', goal: '10000000', fundingDuration: 2592000,
      tiers: [{ title: 'Standard', description: 'Digital comic', price: '10000000', benefitItems: [{ title: 'Final PDF', description: 'A complete comic.' }] }] },
    reviewPreparation: null,
  })
  assert.match(html, /<span>1<\/span>Thông tin ấn phẩm/)
  assert.match(html, /<span>2<\/span>Mục tiêu gây quỹ/)
  assert.match(html, /<span>3<\/span>Kế hoạch hoàn thiện/)
  assert.match(html, /mũi tên để quay lại/)
  assert.match(html, /Ở bước 3 mới lưu bản nháp hoặc khóa cam kết/)
  assert.match(html, /chưa có pledge và chưa có giao dịch tiền/)
})

test('Campaign preparation wizard shows one group with forward navigation at a time', () => {
  const html = renderPreparation({
    id: 'campaign', creatorUserId: 'owner', status: 'DRAFT', revision: 1,
    draftConfig: { title: 'Saigon comic', pitch: 'An illustrated city story', story: 'The complete frozen story.', goal: '10000000', fundingDuration: 2592000,
      tiers: [{ title: 'Standard', description: 'Digital comic', price: '10000000', benefitItems: [{ title: 'Final PDF', description: 'A complete comic.' }] }] },
    reviewPreparation: null,
  })
  assert.match(html, /Bước 1 trên 3/)
  assert.match(html, /Tiếp tục →/)
  assert.doesNotMatch(html, /<h4>Mục tiêu gây quỹ<\/h4>/)
  assert.doesNotMatch(html, /<h4>Kế hoạch hoàn thiện và phát hành<\/h4>/)
  assert.doesNotMatch(html, /Lưu bản thảo để tiếp tục/)
})

test('frozen Creator submission can link a general response to selected feedback without adding it to draft save', () => {
  const feedback = {
    items: [],
    history: [{ id: 'feedback-1', authorUserId: 'backer', targetHash: `0x${'1'.repeat(64)}`, kind: 'ISSUE', body: 'Please clarify the promised editing scope.', createdAt: '2026-10-16T10:30:00.000Z' }],
    responses: [],
    canSubmit: false,
  }
  const frozenCampaign = reviewCampaign('FROZEN')
  const frozen = renderPreparation({ ...frozenCampaign, creatorUserId: 'owner', revision: 6, draftConfig: frozenCampaign.frozenSnapshot.config }, feedback)
  assert.match(frozen, /Phản hồi chung của Creator/)
  assert.match(frozen, /Gắn với góp ý cụ thể/)
  assert.match(frozen, /Please clarify the promised editing scope./)
  assert.match(frozen, /Không cần trả lời từng góp ý/)
  assert.match(frozen, /responseBody|Phản hồi chung/) 

  const draft = renderPreparation({ ...reviewCampaign('DRAFT'), creatorUserId: 'owner', revision: 1, draftConfig: null }, feedback)
  assert.doesNotMatch(draft, /Phản hồi chung của Creator|Gắn với góp ý cụ thể/)
})

test('Campaign cards cannot offer historical publish or physical actions even with advanced statuses', () => {
  for (const status of ['DRAFT', 'FROZEN', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE']) {
    const html = render([{ id: 'campaign', category: 'COMICS_ARTBOOK', title: 'An Campaign draft', goal: '10000000', status, tiers: [] }])
    assert.match(html, /chưa nhận pledge/)
    assert.doesNotMatch(html, /Phát hành On-chain|Đóng băng cam kết|Yêu cầu cọc in|Quản lý Giao hàng|Xem công khai/)
  }
  const historical = render([{ id: 'existing', category: 'COMICS', draftConfig: null, title: 'An existing campaign', goal: '10000000', status: 'PRODUCTION_VERIFIED', tiers: [] }])
  assert.doesNotMatch(historical, /Quản lý Giao hàng/)
});

test('Creator Studio contains only the active Campaign creation and production flow', async () => {
  const source = await readFile(new URL('../src/features/campaigns/creator/Studio.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /submitDisbursementRequest|completeCampaign|registerHistoricalCampaignOnchain|syncCampaignReceipt/)
  assert.doesNotMatch(source, /campaignsAbi|historicalCampaignAddress|parseEventLogs/)
  assert.doesNotMatch(source, /cọc in|giao hàng|vận chuyển/i)
})

test('saved Campaign card shows the promised PDF and exact proposed price and goal', () => {
  const html = render([{ id: 'campaign', category: 'COMICS_ARTBOOK', title: 'Saigon story', goal: '9007199254740993', status: 'DRAFT', tiers: [],
    draftConfig: { tiers: [{ price: '10000001', benefitItems: [{ title: 'Saigon final PDF', description: 'A complete 120-page comic PDF.' }] }] } }])
  assert.match(html, /Saigon final PDF/)
  assert.match(html, /A complete 120-page comic PDF\./)
  assert.match(html, /10\.000001 MockUSDC/)
  assert.match(html, /9007199254\.740993/)
})

function reviewCampaign(status = 'COMMUNITY_REVIEW') {
  return { id: 'campaign', title: 'Saigon comic', status, commitmentHash: `0x${'1'.repeat(64)}`, frozenSnapshot: {
    config: { title: 'Saigon comic', pitch: 'An illustrated city story', story: 'The complete frozen story.', goal: '9007199254740993', fundingDuration: 2592000,
      tiers: [{ title: 'Standard campaign', description: 'Digital comic', price: '10000001', benefitItems: [{ title: 'Final PDF', description: 'A 120-page illustrated comic.' }] }] },
    creator: { displayName: 'Creator', ipDeclaration: 'I hold publication rights.' }, payoutWallet: { address: '0x1234', chainId: '31339' },
    preparation: { contentOutline: 'Twelve chapters', budgetPlan: 'Art and editing work', evidencePlan: 'Page proofs' },
    samples: [{ id: 'sample', mediaType: 'image/png', sizeBytes: 100, sha256: `0x${'2'.repeat(64)}` }],
  } }
}

test('Resolver sees the frozen evidence/terms and must enter a decision reason', () => {
  const html = renderToStaticMarkup(createElement(ResolverReview, { campaign: reviewCampaign(), onChange() {} }))
  for (const term of ['Twelve chapters', 'Art and editing work', 'Page proofs', 'A 120-page illustrated comic.', 'I hold publication rights.', '10.000001', '9007199254.740993']) assert.ok(html.includes(term))
  assert.match(html, /<textarea/)
  assert.match(html, /disabled=""[^>]*>Duyệt hồ sơ PDF/)
  assert.doesNotMatch(html, /approveAndDisburse|activateCampaign|Giải ngân|Giao nhận/)
})

test('reviewed or rejected Campaign have no second decision action', () => {
  for (const status of ['APPROVED', 'STOPPED']) {
    const html = renderToStaticMarkup(createElement(ResolverReview, { campaign: reviewCampaign(status), onChange() {} }))
    assert.doesNotMatch(html, /<textarea|Duyệt hồ sơ PDF|Yêu cầu sửa/)
    assert.match(html, /chưa cho phép nhận pledge/)
  }
})

test('switching creator accounts cannot render the previous account cached draft', () => {
  const html = render([{ id: 'private', category: 'COMICS_ARTBOOK', title: 'CONFIDENTIAL DRAFT FROM OWNER', goal: '10000000', status: 'DRAFT', tiers: [] }], 'stranger')
  assert.doesNotMatch(html, /CONFIDENTIAL DRAFT FROM OWNER/)
})

test('Creator workspace renders pipeline stages and Cần bạn làm task cards', () => {
  const campaigns = [
    {
      id: 'c1',
      category: 'COMICS_ARTBOOK',
      title: 'Comic One',
      goal: '10000000',
      status: 'CHANGES_REQUESTED',
      revision: 2,
      tiers: [],
      draftConfig: {
        title: 'Comic One',
        tiers: [{ price: '10000000', benefitItems: [{ title: 'PDF', description: 'desc' }] }],
      },
    },
    {
      id: 'c2',
      category: 'COMICS_ARTBOOK',
      title: 'Comic Two',
      goal: '20000000',
      status: 'APPROVED',
      revision: 1,
      tiers: [],
      draftConfig: {
        title: 'Comic Two',
        tiers: [{ price: '20000000', benefitItems: [{ title: 'PDF', description: 'desc' }] }],
      },
    },
  ]
  const html = render(campaigns, 'owner', '/campaigns/creator')
  const pipelineHtml = renderToStaticMarkup(createElement(CreatorPipeline, { campaigns }))
  assert.match(pipelineHtml, /creator-pipeline/)
  assert.match(html, /creator-pipeline/)
  assert.match(html, /Bản nháp/)
  assert.match(html, /Được duyệt/)
  assert.match(html, /Cần bạn làm/)
  assert.match(html, /Revision #2/)
  assert.match(html, /Cần bổ sung/)
  assert.doesNotMatch(html, /Duyệt hồ sơ PDF|Yêu cầu sửa/)
})

test('failed on-chain campaign leaves the approval pipeline and creator task queue', () => {
  const campaign = {
    id: 'failed-campaign',
    category: 'COMICS_ARTBOOK',
    title: 'Failed Comic',
    goal: '1000000000',
    status: 'APPROVED',
    revision: 4,
    tiers: [],
  }
  const operations = [{ campaignId: campaign.id, publicationStatus: 'ON_CHAIN_CONFIRMED', contractState: 4 }]

  const pipelineHtml = renderToStaticMarkup(createElement(CreatorPipeline, { campaigns: [campaign], operations }))
  const html = render([campaign], 'owner', '/campaigns/creator', operations)

  assert.match(pipelineHtml, /Thất bại · hoàn tiền/)
  assert.match(pipelineHtml, /creator-pipeline__branches/)
  assert.doesNotMatch(pipelineHtml, /Được duyệt: 1/)
  assert.doesNotMatch(pipelineHtml, /Thất bại · hoàn tiền[^<]*<[^>]*>→/)
  assert.match(html, /Campaign thất bại và đang hoàn tiền/)
  assert.doesNotMatch(html, /Cần bạn làm \(1\)|Mở trang kích hoạt on-chain/)
  assert.doesNotMatch(html, />APPROVED<|Hồ sơ thẩm định PDF/)
})

test('Creator pipeline assigns every on-chain campaign to exactly one lifecycle stage', () => {
  const campaigns = [
    { id: 'approved', status: 'APPROVED' },
    { id: 'funding', status: 'APPROVED' },
    { id: 'active', status: 'APPROVED' },
    { id: 'release-review', status: 'APPROVED' },
    { id: 'released', status: 'APPROVED' },
    { id: 'refunding', status: 'APPROVED' },
    { id: 'completed', status: 'APPROVED' },
  ]
  const operations = [
    { campaignId: 'approved', publicationStatus: 'NOT_PUBLISHED', contractState: null },
    ...campaigns.slice(1).map((campaign, index) => ({ campaignId: campaign.id, publicationStatus: 'ON_CHAIN_CONFIRMED', contractState: index })),
  ]

  const html = renderToStaticMarkup(createElement(CreatorPipeline, { campaigns, operations }))

  assert.match(html, /Được duyệt: 1/)
  assert.match(html, /Đang gây quỹ: 1/)
  assert.match(html, /Thất bại · hoàn tiền: 1/)
  assert.match(html, /Sản xuất: 2/)
  assert.match(html, /Đã phát hành: 2/)
})

test('Creator pipeline renders rejected campaigns as a terminal branch', () => {
  const campaign = { id: 'rejected', status: 'STOPPED' }
  const html = renderToStaticMarkup(createElement(CreatorPipeline, { campaigns: [campaign], operations: [] }))

  assert.match(html, /Bị từ chối: 1/)
  assert.match(html, /creator-pipeline__branch--rejected creator-pipeline__branch--has-items/)
})

test('creator tasks use the Campaign operation state instead of historical campaign projection', () => {
  const campaign = { status: 'APPROVED' }
  const operation = state => ({ publicationStatus: 'ON_CHAIN_CONFIRMED', contractState: state })

  assert.equal(isCreatorActionable(campaign, operation(0)), false)
  assert.equal(isCreatorActionable(campaign, operation(1)), true)
  assert.equal(isCreatorActionable(campaign, operation(2)), false)
  assert.equal(isCreatorActionable(campaign, operation(3)), true)
  assert.equal(isCreatorActionable(campaign, operation(4)), false)
  assert.equal(isCreatorActionable(campaign, operation(5)), false)
  assert.equal(isCreatorActionable(campaign, operation(6)), false)
  assert.equal(isCreatorActionable(campaign, operation(99)), false)
})

test('Creator can open community feedback as a read-only task', () => {
  const campaign = {
    id: 'community-feedback',
    category: 'COMICS_ARTBOOK',
    title: 'Comic With Community Review',
    goal: '10000000',
    status: 'COMMUNITY_REVIEW',
    draftConfig: null,
    tiers: [],
    projection: null,
  }

  assert.equal(isCreatorActionable(campaign), true)
  const html = render([campaign], 'owner')
  assert.match(html, /Xem phản hồi cộng đồng/)
  assert.match(html, /#\/campaigns\/creator\/community-feedback\?tab=activity/)
})

test('Resolver case surface keeps conversation outcome separate from financial actions', () => {
  const html = renderToStaticMarkup(createElement(ResolverCase, {
    userId: 'resolver',
    onChanged() {},
    caseItem: {
      id: 'case-1', status: 'OPEN',
      escalation: { id: 'case-1', threadId: 'thread-1', openerUserId: 'backer', reason: 'The Creator has not clarified the production timeline.', status: 'OPEN', resolverUserId: null, outcome: null, note: null, createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', resolvedAt: null },
      campaign: { id: 'campaign', title: 'Saigon comic', pitch: 'A city story', commitmentHash: `0x${'1'.repeat(64)}`, frozenSnapshot: null },
      chain: { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', snapshot: { state: 1 }, challenges: [] },
      entitlement: { id: 'entitlement-1', backerUserId: 'backer', backerWallet: '0xbacker', amountPaid: '10000000', canonical: true, refunded: false, streamId: 'campaigns:current', transactionHash: '0xtx', blockNumber: '10' },
      feedback: [{ id: 'feedback-1', authorUserId: 'backer', targetHash: `0x${'1'.repeat(64)}`, kind: 'ISSUE', body: 'Please clarify the evidence timeline.', createdAt: '2026-10-16T10:00:00.000Z' }],
      thread: { id: 'thread-1', campaignId: 'campaign', entitlementId: 'entitlement-1', backerUserId: 'backer', creatorUserId: 'owner', targetHash: `0x${'1'.repeat(64)}`, commitmentHash: `0x${'1'.repeat(64)}`, status: 'ESCALATED', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', permissions: { canMessage: false, canEscalate: false, readOnlyReason: null }, escalation: null, messages: [{ id: 'message-1', threadId: 'thread-1', authorUserId: 'backer', authorRole: 'BACKER', body: 'Please clarify the evidence timeline.', createdAt: '2026-10-16T10:00:00.000Z' }] },
    },
  }))
  assert.match(html, /Resolver case/)
  assert.match(html, /Please clarify the evidence timeline./)
  assert.match(html, /Ghi outcome Resolver/)
  assert.doesNotMatch(html, /Payout|Hoàn tiền|Giải ngân/)
})

test('CreatorTaskCard renders single primary action, revision, and collapses history', () => {
  const campaign = {
    id: 'c-task',
    category: 'COMICS_ARTBOOK',
    title: 'Comic In Need',
    goal: '10000000',
    status: 'CHANGES_REQUESTED',
    revision: 3,
    tiers: [],
    draftConfig: {
      title: 'Comic In Need',
      tiers: [{ price: '10000000', benefitItems: [{ title: 'PDF', description: 'desc' }] }],
    },
    reviewHistory: [
      { outcome: 'CHANGES_REQUESTED', reason: 'Thiếu trang bìa', reviewedAt: '2026-10-15T00:00:00.000Z' },
    ],
  }

  const html = renderToStaticMarkup(createElement(CreatorTaskCard, {
    campaign,
    href: '#/campaigns/creator?edit=c-task&step=3',
  }))

  assert.match(html, /Comic In Need/)
  assert.match(html, /Revision #3/)
  assert.match(html, /Cần bổ sung/)
  assert.match(html, /href="#\/campaigns\/creator\?edit=c-task&amp;step=3"/)
  assert.match(html, /Thiếu trang bìa/)
})

test('ReviewQueue renders groups by actionable state, highlights selected, and uses compact empty state', () => {
  const campaigns = [
    { id: 'q1', title: 'Queue One', status: 'UNDER_REVIEW_PRIVATE', category: 'COMICS_ARTBOOK' },
    { id: 'q2', title: 'Queue Two', status: 'COMMUNITY_REVIEW', category: 'COMICS_ARTBOOK' },
    { id: 'q3', title: 'Queue Three', status: 'APPROVED', category: 'COMICS_ARTBOOK' },
  ]

  const html = renderToStaticMarkup(createElement(ReviewQueue, {
    campaigns,
    selectedId: 'q2',
    onSelect() {},
  }))

  assert.match(html, /review-queue/)
  assert.match(html, /Cần mở review/)
  assert.match(html, /Community review/)
  assert.match(html, /Chờ kích hoạt/)
  assert.match(html, /Queue Two/)
  assert.match(html, /aria-selected="true"/)

  const emptyHtml = renderToStaticMarkup(createElement(ReviewQueue, {
    campaigns: [],
    onSelect() {},
  }))
  assert.match(emptyHtml, /Không có hồ sơ cần thẩm định/)
})

test('ReviewHistoryDisclosure collapses past reviews and shows outcome and reason', () => {
  const reviews = [
    { outcome: 'CHANGES_REQUESTED', decisionReason: 'Bổ sung kế hoạch xuất bản', reviewedAt: '2026-10-14T00:00:00.000Z' },
  ]
  const html = renderToStaticMarkup(createElement(ReviewHistoryDisclosure, { reviews }))
  assert.match(html, /review-history-disclosure/)
  assert.match(html, /Lịch sử thẩm định \(1\)/)
  assert.match(html, /CHANGES_REQUESTED/)
  assert.match(html, /Bổ sung kế hoạch xuất bản/)
})

test('TransactionLifecycle renders 4-stage feedback and distinguishes submitted from confirmed/indexed', () => {
  const submittedHtml = renderToStaticMarkup(createElement(TransactionLifecycle, {
    phase: 'submitted',
    hash: '0x1234567890abcdef1234567890abcdef12345678',
  }))
  assert.match(submittedHtml, /transaction-lifecycle/)
  assert.match(submittedHtml, /Yêu cầu ký/)
  assert.match(submittedHtml, /Đã gửi/)
  assert.match(submittedHtml, /Đã xác nhận/)
  assert.match(submittedHtml, /Đã đồng bộ/)
  assert.match(submittedHtml, /transaction-lifecycle__step--done/)
  assert.match(submittedHtml, /transaction-lifecycle__step--current/)

  const confirmedHtml = renderToStaticMarkup(createElement(TransactionLifecycle, {
    phase: 'confirmed',
    hash: '0x1234567890abcdef1234567890abcdef12345678',
  }))
  assert.match(confirmedHtml, /transaction-lifecycle__step--done/)
})


