import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { createServer } from 'vite'

const server = await createServer({ mode: 'reward', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { RewardCreatorStudio } = await server.ssrLoadModule('/src/features/reward/RewardCreatorStudio.tsx')
const { RewardCreatorProfile } = await server.ssrLoadModule('/src/features/reward/RewardCreatorProfile.tsx')
const { EditionsPreparationPanel, NewEditionsPreparationPanel, EditionsResolverReview } = await server.ssrLoadModule('/src/features/reward/EditionsReview.tsx')
const { CreatorPipeline } = await server.ssrLoadModule('/src/features/reward/ui/CreatorPipeline.tsx')
const { isCreatorActionable } = await server.ssrLoadModule('/src/features/reward/ui/creatorTaskUtils.ts')
const { CreatorTaskCard } = await server.ssrLoadModule('/src/features/reward/ui/CreatorTaskCard.tsx')
const { ReviewQueue } = await server.ssrLoadModule('/src/features/reward/ui/ReviewQueue.tsx')
const { ReviewHistoryDisclosure } = await server.ssrLoadModule('/src/features/reward/ui/ReviewHistoryDisclosure.tsx')
const { TransactionLifecycle } = await server.ssrLoadModule('/src/features/reward/ui/TransactionLifecycle.tsx')
const { RewardResolverConsole } = await server.ssrLoadModule('/src/features/reward/RewardResolverConsole.tsx')
const { EditionsResolverCase } = await server.ssrLoadModule('/src/features/reward/ui/EditionsResolverCase.tsx')
const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })

function render(campaigns = [], actor = 'owner', path, operations = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['my-reward-creator-profile', 'owner'], { status: 'VERIFIED', displayName: 'Comic artist' })
  client.setQueryData(['my-reward-campaigns', 'owner'], campaigns)
  client.setQueryData(['reward-editions-operations', 'creator', actor], operations)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config },
    createElement(QueryClientProvider, { client }, createElement(RewardCreatorStudio, { userId: actor, path }))))
  client.clear()
  return html
}

function renderPreparation(campaign, feedback) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (feedback) client.setQueryData(['reward-editions-feedback', campaign.id, campaign.creatorUserId], feedback)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(EditionsPreparationPanel, { campaign, onChange() {} })))
  client.clear()
  return html
}

function renderProfile(profile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['my-reward-creator-profile', 'owner'], profile)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(RewardCreatorProfile, { userId: 'owner' })))
  client.clear()
  return html
}

function renderNewPreparation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(NewEditionsPreparationPanel, { onCreated() {} })))
  client.clear()
  return html
}

function renderResolver(campaigns = [], disputes = [], cases = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['reward-resolver-campaigns', 'resolver'], campaigns)
  client.setQueryData(['reward-resolver-disputes', 'resolver'], disputes)
  client.setQueryData(['reward-editions-resolver-cases', 'resolver'], cases)
  const html = renderToStaticMarkup(createElement(WagmiProvider, { config },
    createElement(QueryClientProvider, { client }, createElement(RewardResolverConsole, { userId: 'resolver' }))))
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

test('Resolver console contains only the active Editions review flow', async () => {
  const source = await readFile(new URL('../src/features/reward/RewardResolverConsole.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /approveAndDisburse|candidateExpenditure|finalizeExpenditure|recordProductionVerified|startWindDown/)
  assert.doesNotMatch(source, /listResolverRewardDisputes|rewardAbi|rewardContractAddress/)
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

test('approved Editions expose the on-chain action directly in the Resolver queue', () => {
  const campaign = { ...reviewCampaign('APPROVED'), category: 'COMICS_ARTBOOK' }
  const html = renderResolver([campaign])
  assert.match(html, /Mở trang xử lý on-chain →/)
  assert.match(html, /href="#\/reward\/editions\/edition\/resolver"/)
})

test('Resolver console surfaces review cases separately from the funding queue', () => {
  const html = renderResolver([], [], [{
    id: 'case-1',
    status: 'OPEN',
    escalation: { id: 'case-1', threadId: 'thread-1', openerUserId: 'backer', reason: 'Please clarify the production evidence.', status: 'OPEN', resolverUserId: null, outcome: null, note: null, createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', resolvedAt: null },
    campaign: { id: 'edition', title: 'Saigon comic', pitch: 'A city story', commitmentHash: '0xhash', frozenSnapshot: null },
    chain: { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', snapshot: { state: 1 }, challenges: [] },
    entitlement: { id: 'entitlement-1', backerUserId: 'backer', backerWallet: '0xbacker', amountPaid: '10000000', canonical: true, refunded: false, streamId: 'editions:current', transactionHash: '0xtx', blockNumber: '10' },
    feedback: [],
    thread: { id: 'thread-1', campaignId: 'edition', entitlementId: 'entitlement-1', backerUserId: 'backer', creatorUserId: 'owner', targetHash: '0xhash', commitmentHash: '0xhash', status: 'ESCALATED', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', escalation: null, messages: [] },
  }])
  assert.match(html, /Resolver cases/)
  assert.match(html, /Please clarify the production evidence\./)
})

test('new creator flow opens the single Editions preparation wizard instead of a duplicate campaign form', () => {
  const html = render([], 'owner', '/reward/creator/draft')
  assert.match(html, /Bước 1 trên 3/)
  assert.match(html, /Thông tin ấn phẩm/)
  assert.doesNotMatch(html, /Tạo bản thảo FundTogether Editions/)
})

test('Creator entry defaults to Studio without a tab switcher', () => {
  const html = render([], 'owner', '/reward/creator')

  assert.match(html, /Xưởng ấn phẩm/)
  assert.doesNotMatch(html, /reward-tabs|Studio của tôi|Danh tính xuất bản &amp; bản quyền IP/)
})

test('Studio profile is isolated from the project workspace', () => {
  const html = renderProfile({
    id: 'profile', userId: 'owner', displayName: 'Comic artist', bio: 'Independent comic artist.',
    ipDeclaration: 'I own the publication rights.', status: 'VERIFIED', rejectionReason: null,
    verifiedBy: 'admin', verifiedAt: '2026-10-16T00:00:00.000Z', createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
  })

  assert.match(html, /Hồ sơ Studio/)
  assert.match(html, /Comic artist|Independent comic artist|I own the publication rights/)
  assert.doesNotMatch(html, /creator-pipeline|Dự án của bạn|Tạo bản thảo mới/)
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
  const source = await readFile(new URL('../src/features/reward/RewardCreatorStudio.tsx', import.meta.url), 'utf8')
  assert.match(source, /initialStep=\{2\}/)
  assert.doesNotMatch(source, /window\.location\.hash = '#\/reward\/creator'/)
})

test('creator publication waits for the Resolver approval that exists on chain', async () => {
  const source = await readFile(new URL('../src/features/reward/EditionsCampaign.tsx', import.meta.url), 'utf8')
  assert.match(source, /onchainApproved/)
  assert.match(source, /Primary Resolver chưa ký duyệt cam kết trên chain/)
  assert.match(source, /Kiểm tra lại chữ ký/)
})

test('new Editions wizard offers one PDF without a physical, inventory or add-tier input', () => {
  const html = renderNewPreparation()
  assert.match(html, /FundTogether Editions/)
  assert.match(html, /COMICS_ARTBOOK/)
  assert.match(html, /một Standard PDF tải xuống/)
  assert.doesNotMatch(html, /<select|type="checkbox"|Thêm gói|Số lượng tối đa|Vật phẩm đi kèm/)
})

test('sample upload states are explicit before and during persistence', async () => {
  const source = await readFile(new URL('../src/features/reward/EditionsReview.tsx', import.meta.url), 'utf8')
  assert.match(source, /sẽ được tải lên khi lưu bản nháp/)
  assert.match(source, /Đang tải tài liệu mẫu lên/)
  assert.match(source, /queryClient\.setQueryData/)
})

test('new draft form puts the story minimum beside the matching input', () => {
  const html = renderNewPreparation()
  assert.match(html, /Cốt truyện &amp; Kế hoạch sản xuất:.*tối thiểu 20 ký tự/s)
  assert.match(html, /minLength="20"/)
})

test('Editions preparation form explains the three review groups and save versus lock', () => {
  const html = renderPreparation({
    id: 'edition', creatorUserId: 'owner', status: 'DRAFT', revision: 1,
    draftConfig: { title: 'Saigon comic', pitch: 'An illustrated city story', story: 'The complete frozen story.', goal: '10000000', fundingDuration: 2592000,
      tiers: [{ title: 'Standard', description: 'Digital comic', price: '10000000', rewardItems: [{ title: 'Final PDF', description: 'A complete comic.' }] }] },
    reviewPreparation: null,
  })
  assert.match(html, /<span>1<\/span>Thông tin ấn phẩm/)
  assert.match(html, /<span>2<\/span>Mục tiêu gây quỹ/)
  assert.match(html, /<span>3<\/span>Kế hoạch phát hành/)
  assert.match(html, /mũi tên để quay lại/)
  assert.match(html, /Ở bước 3 mới lưu bản nháp hoặc khóa cam kết/)
  assert.match(html, /chưa có pledge và chưa có giao dịch tiền/)
})

test('Editions preparation wizard shows one group with forward navigation at a time', () => {
  const html = renderPreparation({
    id: 'edition', creatorUserId: 'owner', status: 'DRAFT', revision: 1,
    draftConfig: { title: 'Saigon comic', pitch: 'An illustrated city story', story: 'The complete frozen story.', goal: '10000000', fundingDuration: 2592000,
      tiers: [{ title: 'Standard', description: 'Digital comic', price: '10000000', rewardItems: [{ title: 'Final PDF', description: 'A complete comic.' }] }] },
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

test('Editions cards cannot offer legacy publish or physical actions even with advanced statuses', () => {
  for (const status of ['DRAFT', 'FROZEN', 'APPROVED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE']) {
    const html = render([{ id: 'edition', category: 'COMICS_ARTBOOK', title: 'An Editions draft', goal: '10000000', status, tiers: [] }])
    assert.match(html, /chưa nhận pledge/)
    assert.doesNotMatch(html, /Phát hành On-chain|Đóng băng cam kết|Yêu cầu cọc in|Quản lý Giao hàng|Xem công khai/)
  }
  const legacy = render([{ id: 'existing', category: 'COMICS', draftConfig: null, title: 'An existing campaign', goal: '10000000', status: 'PRODUCTION_VERIFIED', tiers: [] }])
  assert.doesNotMatch(legacy, /Quản lý Giao hàng/)
});

test('Creator Studio contains only the active Editions creation and production flow', async () => {
  const source = await readFile(new URL('../src/features/reward/RewardCreatorStudio.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /submitDisbursementRequest|completeCampaign|registerRewardOnchain|syncRewardReceipt/)
  assert.doesNotMatch(source, /rewardAbi|rewardContractAddress|parseEventLogs/)
  assert.doesNotMatch(source, /cọc in|giao hàng|vận chuyển/i)
})

test('saved Editions card shows the promised PDF and exact proposed price and goal', () => {
  const html = render([{ id: 'edition', category: 'COMICS_ARTBOOK', title: 'Saigon story', goal: '9007199254740993', status: 'DRAFT', tiers: [],
    draftConfig: { tiers: [{ price: '10000001', rewardItems: [{ title: 'Saigon final PDF', description: 'A complete 120-page comic PDF.' }] }] } }])
  assert.match(html, /Saigon final PDF/)
  assert.match(html, /A complete 120-page comic PDF\./)
  assert.match(html, /10\.000001 MockUSDC/)
  assert.match(html, /9007199254\.740993/)
})

function reviewCampaign(status = 'COMMUNITY_REVIEW') {
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
        tiers: [{ price: '10000000', rewardItems: [{ title: 'PDF', description: 'desc' }] }],
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
        tiers: [{ price: '20000000', rewardItems: [{ title: 'PDF', description: 'desc' }] }],
      },
    },
  ]
  const html = render(campaigns, 'owner', '/reward/creator')
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
  const html = render([campaign], 'owner', '/reward/creator', operations)

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

test('creator tasks use the Editions operation state instead of legacy campaign projection', () => {
  const campaign = { status: 'APPROVED' }
  const operation = state => ({ publicationStatus: 'ON_CHAIN_CONFIRMED', contractState: state })

  assert.equal(isCreatorActionable(campaign, operation(0)), false)
  assert.equal(isCreatorActionable(campaign, operation(1)), true)
  assert.equal(isCreatorActionable(campaign, operation(2)), false)
  assert.equal(isCreatorActionable(campaign, operation(3)), false)
  assert.equal(isCreatorActionable(campaign, operation(4)), false)
  assert.equal(isCreatorActionable(campaign, operation(5)), false)
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
  assert.match(html, /#\/reward\/editions\/community-feedback\/creator\/feedback/)
})

test('Resolver case surface keeps conversation outcome separate from financial actions', () => {
  const html = renderToStaticMarkup(createElement(EditionsResolverCase, {
    userId: 'resolver',
    onChanged() {},
    caseItem: {
      id: 'case-1', status: 'OPEN',
      escalation: { id: 'case-1', threadId: 'thread-1', openerUserId: 'backer', reason: 'The Creator has not clarified the production timeline.', status: 'OPEN', resolverUserId: null, outcome: null, note: null, createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', resolvedAt: null },
      campaign: { id: 'edition', title: 'Saigon comic', pitch: 'A city story', commitmentHash: `0x${'1'.repeat(64)}`, frozenSnapshot: null },
      chain: { status: 'ON_CHAIN_CONFIRMED', onchainCampaignId: '0', snapshot: { state: 1 }, challenges: [] },
      entitlement: { id: 'entitlement-1', backerUserId: 'backer', backerWallet: '0xbacker', amountPaid: '10000000', canonical: true, refunded: false, streamId: 'editions:current', transactionHash: '0xtx', blockNumber: '10' },
      feedback: [{ id: 'feedback-1', authorUserId: 'backer', targetHash: `0x${'1'.repeat(64)}`, kind: 'ISSUE', body: 'Please clarify the evidence timeline.', createdAt: '2026-10-16T10:00:00.000Z' }],
      thread: { id: 'thread-1', campaignId: 'edition', entitlementId: 'entitlement-1', backerUserId: 'backer', creatorUserId: 'owner', targetHash: `0x${'1'.repeat(64)}`, commitmentHash: `0x${'1'.repeat(64)}`, status: 'ESCALATED', createdAt: '2026-10-16T10:00:00.000Z', updatedAt: '2026-10-16T10:00:00.000Z', escalation: null, messages: [{ id: 'message-1', threadId: 'thread-1', authorUserId: 'backer', authorRole: 'BACKER', body: 'Please clarify the evidence timeline.', createdAt: '2026-10-16T10:00:00.000Z' }] },
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
      tiers: [{ price: '10000000', rewardItems: [{ title: 'PDF', description: 'desc' }] }],
    },
    reviewHistory: [
      { outcome: 'CHANGES_REQUESTED', reason: 'Thiếu trang bìa', reviewedAt: '2026-10-15T00:00:00.000Z' },
    ],
  }

  const html = renderToStaticMarkup(createElement(CreatorTaskCard, {
    campaign,
    href: '#/reward/creator?edit=c-task&step=3',
  }))

  assert.match(html, /Comic In Need/)
  assert.match(html, /Revision #3/)
  assert.match(html, /Cần bổ sung/)
  assert.match(html, /href="#\/reward\/creator\?edit=c-task&amp;step=3"/)
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


