import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { foundry } from 'wagmi/chains'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error' })
after(() => server.close())
const { ReviewPage } = await server.ssrLoadModule('/src/features/review/ReviewPage.tsx')
const { PublicCampaignFeed, PublicCampaignDetail } = await server.ssrLoadModule('/src/features/explore/PublicCampaigns.tsx')
const { CampaignPublication } = await server.ssrLoadModule('/src/features/campaigns/CampaignPublication.tsx')
const { CampaignJourney } = await server.ssrLoadModule('/src/features/campaigns/CampaignJourney.tsx')
const { TransactionSteps } = await server.ssrLoadModule('/src/features/campaigns/TransactionSteps.tsx')
const { ReviewDecision } = await server.ssrLoadModule('/src/features/review/ReviewDecision.tsx')
const { OrganizationWorkspaceLinks } = await server.ssrLoadModule('/src/features/organizations/OrganizationWorkspaceLinks.tsx')
const { OrganizationWorkspace } = await server.ssrLoadModule('/src/features/organizations/OrganizationWorkspace.tsx')
const { organizationSwitchPath } = await server.ssrLoadModule('/src/features/organizations/organization-navigation.ts')
const { AccountAccess } = await server.ssrLoadModule('/src/features/auth/AccountAccess.tsx')
const { AccountSessionProvider } = await server.ssrLoadModule('/src/features/auth/AccountSessionProvider.tsx')
const { http: apiHttp } = await server.ssrLoadModule('/src/lib/api/http.ts')
const { getErrorMessage } = await server.ssrLoadModule('/src/lib/api/error.ts')
const configuredDeployment = JSON.parse(readFileSync(new URL('../../backend/src/blockchain/generated/deployment.local.json', import.meta.url), 'utf8'))
const walletConfig = createConfig({ chains: [foundry], transports: { [foundry.id]: http() }, ssr: true })
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const session = { userId: 'user', email: 'review@example.test', wallets: [] }
const sync = { status: 'syncing', lastIndexedBlock: '20', headBlock: '21', error: null }
const campaign = {
  id: 'published-id', title: 'Canonical published campaign', description: 'Public content', organization: { id: 'org', name: 'Test organization' },
  chainId: 31337, contractAddress: `0x${'1'.repeat(40)}`, organizer: `0x${'2'.repeat(40)}`, tokenAddress: `0x${'3'.repeat(40)}`,
  onchainCampaignId: '2', goalUnits: '10000000', requiredBondUnits: '2000000', bondAmountUnits: '2000000', totalContributedUnits: '1000000',
  state: 'FUNDING', fundingDeadline: 1900000000, publicationTransactionHash: `0x${'4'.repeat(64)}`, indexedBlock: '20', milestones: [],
}
const plan = { chainId: campaign.chainId, contractAddress: campaign.contractAddress, tokenAddress: campaign.tokenAddress, organizer: campaign.organizer,
  genesisHash: `0x${'5'.repeat(64)}`, contractCodeHash: `0x${'6'.repeat(64)}`, tokenCodeHash: `0x${'7'.repeat(64)}`, confirmations: 1, draftKey: `0x${'8'.repeat(64)}`,
  title: campaign.title, fundingDeadline: campaign.fundingDeadline, budgetUnits: [], criteriaHashes: [], goalUnits: campaign.goalUnits, bondUnits: campaign.requiredBondUnits }

test('campaign guide uses chain clock and scroll buttons preserve the hash router', () => {
  const workflow = { checkedBlock: '20', chainTimestamp: '100', currentMilestoneIndex: '0', activationDeadline: '200',
    evidenceDeadline: '0', admissionDeadline: '0', reviewDeadline: '0', refundSnapshotted: false }
  const html = render(CampaignJourney, { campaign, workflow, sync })
  assert.match(html, /Đang chờ ai/)
  assert.match(html, /Người đóng góp/)
  assert.match(html, /block 20/)
  assert.match(html, /timestamp của block/)
  assert.doesNotMatch(html, /href="#donation-title"/)
  const workspace = render(CampaignJourney, { campaign, workflow, sync, inWorkspace: true })
  assert.match(workspace, /href="#\/campaigns\/published-id"/)
})

test('transaction steps never present a submitted hash or receipt as indexed', () => {
  for (const [stage, current] of [['wallet', 'Chờ ví'], ['submitted', 'Đã gửi'], ['receipt', 'Receipt thành công'], ['indexed', 'Đã index']]) {
    const html = render(TransactionSteps, { stage, operation: 'Nhận hoàn tiền', hash: `0x${'a'.repeat(64)}`, receiptBlock: stage === 'receipt' ? '20' : undefined })
    assert.match(html, new RegExp(`aria-current="step">${current}`))
    if (stage !== 'indexed') assert.doesNotMatch(html, /step-done[^>]*>Đã index/)
  }
  const approval = render(TransactionSteps, { stage: 'submitted', operation: 'Cấp quyền token', approval: true })
  assert.match(approval, /chưa chuyển tiền/)
  assert.match(approval, /Tiếp theo: ký đóng góp/)
  const approved = render(TransactionSteps, { stage: 'receipt', operation: 'Cấp quyền token', approval: true, receiptBlock: '20' })
  assert.match(approved, /tiếp theo cần ký đóng góp/)
  assert.doesNotMatch(approved, /chờ indexer ghi nhận đúng sự kiện/)
})

function render(Component, props, entries = [], failKey) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of entries) client.setQueryData(key, data)
  if (failKey) client.getQueryCache().find({ queryKey: failKey }).setState({ status: 'error', error: new Error('Unavailable chain') })
  const markup = renderToStaticMarkup(createElement(WagmiProvider, { config: walletConfig },
    createElement(QueryClientProvider, { client }, createElement(RainbowKitProvider, null,
      createElement(AccountSessionProvider, null, createElement(Component, props))))))
  client.clear()
  return markup
}

test('organization switch preserves profile context and leaves old campaign detail behind', () => {
  for (const section of ['/organizations', '/organizations/old-org']) {
    assert.equal(organizationSwitchPath('new-org', section), '/organizations/new-org')
  }
  assert.equal(organizationSwitchPath('new-org', '/campaigns/old-campaign/edit'), '/organizations/new-org/workspace/campaigns')
  assert.equal(organizationSwitchPath('new-org', '/evidence/item'), '/organizations/new-org/workspace/evidence')
})

test('organization profile route renders representative wallet and explicit sidebar link', () => {
  const org = { id: 'org', name: 'Test organization', createdByUserId: 'user', role: 'OWNER',
    createdAt: '2026-10-10T00:00:00Z', representativeWallet: null }
  const cache = [[['organizations', 'user'], [org]], [['account-wallets', 'user'], session]]
  const props = { section: '/organizations/org', session: { ...session, roles: ['USER'] }, sessionLoading: false, sessionError: '', onSession() {} }
  const profile = render(OrganizationWorkspace, props, cache)
  assert.match(profile, /Ví đại diện tổ chức/)
  assert.match(profile, /Hồ sơ &amp; ví đại diện/)
  assert.match(profile, /href="#\/organizations\/org"/)
  const list = render(OrganizationWorkspace, { ...props, section: '/organizations' }, cache)
  assert.match(list, /href="#\/organizations\/org">Xem hồ sơ/)
  assert.doesNotMatch(list, /id="organization-wallet-title"/)
})

test('resolver page requires account login even if private queue is cached', () => {
  const html = render(ReviewPage, { session: null, sessionLoading: false }, [[['review-campaigns', undefined], { items: [campaign], sync }]])
  assert.match(html, /Đăng nhập tài khoản/)
  assert.doesNotMatch(html, /Canonical published campaign/)
})

test('denied resolver access hides previously cached campaign metadata', () => {
  const html = render(ReviewPage, { session, sessionLoading: false }, [
    [['review-access', 'user'], { allowed: false, resolver: campaign.organizer }],
    [['review-campaigns', 'user'], { items: [campaign], resolver: campaign.organizer, sync }],
  ])
  assert.match(html, /chưa có quyền resolver/)
  assert.doesNotMatch(html, /Canonical published campaign/)
})

test('failed resolver reauthorization hides stale authorized queue', () => {
  const html = render(ReviewPage, { session, sessionLoading: false }, [
    [['review-access', 'user'], { allowed: true, resolver: campaign.organizer }],
    [['review-campaigns', 'user'], { items: [campaign], resolver: campaign.organizer, sync }],
  ], ['review-access', 'user'])
  assert.match(html, /Chưa kiểm tra được quyền resolver/)
  assert.doesNotMatch(html, /Canonical published campaign/)
})

test('authorized resolver queue exposes review link and sync lag', () => {
  const html = render(ReviewPage, { session, sessionLoading: false }, [
    [['review-access', 'user'], { allowed: true, resolver: campaign.organizer }],
    [['review-campaigns', 'user'], { items: [campaign], resolver: campaign.organizer, sync }],
  ])
  assert.match(html, /Canonical published campaign/)
  assert.match(html, /#\/internal\/campaigns\/published-id/)
  assert.match(html, /Indexer đang đồng bộ/)
})

test('public feed shows only returned API rows and exact token units', () => {
  const html = render(PublicCampaignFeed, {}, [[['public-campaigns', 0], { items: [campaign], sync }]])
  assert.match(html, /Canonical published campaign/)
  assert.match(html, /1 \/ 10 MockUSDC/)
  assert.match(html, /#\/campaigns\/published-id/)
})

test('public feed hides stale campaign data when chain validation fails', () => {
  const html = render(PublicCampaignFeed, {}, [[['public-campaigns', 0], { items: [campaign], sync }]], ['public-campaigns', 0])
  assert.match(html, /Chưa tải được campaign công khai/)
  assert.doesNotMatch(html, /Canonical published campaign/)
})

test('public detail displays canonical milestone content and escapes untrusted text', () => {
  const detail = { ...campaign, title: '<script>alert(1)</script>', milestones: [{ index: 0, title: 'First milestone', description: 'Build well', budgetUnits: '10000000', acceptanceCriteria: [{ criterionId: 'C1', description: 'Water works' }] }] }
  const html = render(PublicCampaignDetail, { campaignId: campaign.id }, [[['public-campaign', campaign.id], { campaign: detail, sync }]])
  assert.match(html, /First milestone/)
  assert.match(html, /Water works/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})

test('funded public detail explains the next actor and disables donations with the state reason', () => {
  const workflow = { checkedBlock: '20', chainTimestamp: '100', currentMilestoneIndex: '0', activationDeadline: '200',
    evidenceDeadline: '0', admissionDeadline: '0', reviewDeadline: '0', refundSnapshotted: false, activationTransactionHash: null }
  const html = render(PublicCampaignDetail, { campaignId: campaign.id }, [[['public-campaign', campaign.id], {
    campaign: { ...campaign, state: 'FUNDED', totalContributedUnits: campaign.goalUnits }, workflow, sync: { ...sync, status: 'ready' },
  }]])
  assert.match(html, /Kích hoạt milestone 1/)
  assert.match(html, /Ví cần dùng/)
  assert.match(html, /Campaign đã dừng nhận đóng góp/)
  assert.match(html, /disabled="" aria-describedby="donation-reason"/)
  assert.match(html, /id="donation-amount"[^>]*disabled=""/)
})

test('cancelled resolver history explicitly reports cancellation and has no approve action', () => {
  const html = render(ReviewPage, { session, sessionLoading: false, campaignId: campaign.id }, [
    [['review-access', 'user'], { allowed: true, resolver: campaign.organizer }],
    [['review-campaign', 'user', campaign.id], { campaign: { ...campaign, state: 'CANCELLED', plan }, resolver: campaign.organizer, sync }],
  ])
  assert.match(html, /Campaign đã bị hủy/)
  assert.doesNotMatch(html, /Duyệt campaign bằng ví resolver/)
})

test('terminated organizer campaign reports terminal state rather than waiting for resolver', () => {
  const html = render(CampaignPublication, { campaignId: campaign.id, userId: 'user' }, [
    [['publication-submission', 'user', campaign.id], { plan, stage: 'terminated', onchainCampaignId: campaign.onchainCampaignId, chainState: 5 }],
    [['campaign-publication', 'user', campaign.id], { state: 'CANCELLED', indexedBlock: '20', published: false, publicId: null, sync }],
  ])
  assert.match(html, /Campaign đã kết thúc/)
  assert.doesNotMatch(html, /Khóa đủ bond và chờ resolver/)
})

const reviewed = { decision: 'approve', reason: 'Human examined this dossier', reviewerUserId: 'user', reviewerWallet: campaign.organizer,
  revision: 1, dossierHash: `0x${'a'.repeat(64)}`, checkedBlock: '20', checkedBlockHash: `0x${'b'.repeat(64)}`, createdAt: '2026-10-04T01:00:00Z' }
const dossier = { campaign: { ...campaign, state: 'DRAFT', plan }, resolver: campaign.organizer, sync,
  conflict: false, dossierHash: reviewed.dossierHash, revision: 1, checks: [{ label: 'Escrow bond check', passed: true }], review: null }

test('human review requires a reason and acknowledgement before wallet approval appears', () => {
  const html = render(ReviewDecision, { detail: dossier, userId: 'user', refresh: () => {} })
  assert.match(html, /review-reason/)
  assert.match(html, /Tôi đã đọc hồ sơ/)
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /Duyệt campaign bằng ví resolver/)
})

test('approval intent displays audit information and is distinguished from chain approval', () => {
  const html = render(ReviewDecision, { detail: { ...dossier, canSign: true, review: reviewed }, userId: 'user', refresh: () => {} })
  assert.match(html, /Human examined this dossier/)
  assert.match(html, /Bước tiếp theo là ký giao dịch duyệt bằng ví resolver và chờ indexer xác nhận/)
  assert.match(html, /Duyệt campaign bằng ví resolver/)
  assert.match(html, /block đối chiếu 20/)
  assert.match(html, /Tài khoản xử lý/)
  assert.match(html, /Ví resolver cấu hình/)
  assert.doesNotMatch(html, /Người xử lý:/)
})

test('resolver account shows exact configured signing wallet and distinguishes human review', () => {
  const html = render(AccountAccess, { session: { ...session, roles: ['RESOLVER'] }, onSession: () => {} })
  assert.match(html, new RegExp(configuredDeployment.resolver, 'i'))
  assert.match(html, /Ví resolver của deployment hiện tại/)
  assert.match(html, /Duyệt trên blockchain cần liên kết đúng ví resolver/)
  assert.match(html, /Tài khoản này chưa có ví liên kết/)
})

test('ordinary account does not claim resolver authority', () => {
  const html = render(AccountAccess, { session: { ...session, roles: [] }, onSession: () => {} })
  assert.doesNotMatch(html, /Ví resolver của deployment hiện tại/)
})

test('API waits are bounded and timeout never asserts that a write failed', () => {
  assert.equal(apiHttp.defaults.timeout, 20_000)
  assert.match(getErrorMessage({ isAxiosError: true, code: 'ECONNABORTED' }), /có thể đã được xử lý/)
})

test('self-review conflict prevents signing even with a cached approval intent', () => {
  const html = render(ReviewDecision, { detail: { ...dossier, conflict: true, review: reviewed }, userId: 'user', refresh: () => {} })
  assert.match(html, /không được xét duyệt/)
  assert.doesNotMatch(html, /Duyệt campaign bằng ví resolver/)
})

test('self-review conflict explains the restriction and removes unusable decision fields', () => {
  const html = render(ReviewDecision, { detail: { ...dossier, conflict: true }, userId: 'user', refresh: () => {} })
  assert.match(html, /Không thể tự xét duyệt campaign/)
  assert.match(html, /Đổi ví trên cùng tài khoản không gỡ điều kiện này/)
  assert.match(html, /Quản lý tài khoản/)
  assert.match(html, /Escrow bond check/)
  assert.doesNotMatch(html, /<textarea|type="checkbox"|Đồng ý hồ sơ|Yêu cầu sửa|>Từ chối</)
})

test('eligible review explains how to enable decisions and uses a compact labelled checkbox', () => {
  const html = render(ReviewDecision, { detail: dossier, userId: 'user', refresh: () => {} })
  assert.match(html, /Xác nhận đã đọc hồ sơ để mở các nút quyết định/)
  assert.match(html, /Cần thêm 10 ký tự/)
  assert.match(html, /aria-describedby="review-reason-help"/)
  assert.match(html, /class="review-confirm"><input type="checkbox"\/><span>Tôi đã đọc hồ sơ/)
})

test('failed checks explain approval restriction while retaining correction and rejection controls', () => {
  const html = render(ReviewDecision, { detail: { ...dossier, checks: [{ label: 'Escrow bond check', passed: false }] }, userId: 'user', refresh: () => {} })
  assert.match(html, /review-check--failed/)
  assert.match(html, /Chưa đủ điều kiện đồng ý hồ sơ/)
  assert.match(html, /Yêu cầu sửa/)
  assert.match(html, />Từ chối</)
})

test('cancelled review history retains reasons and never offers approval', () => {
  const html = render(ReviewDecision, { detail: { ...dossier, campaign: { ...dossier.campaign, state: 'CANCELLED' }, review: reviewed }, userId: 'user', refresh: () => {} })
  assert.match(html, /Human examined this dossier/)
  assert.doesNotMatch(html, /Duyệt campaign bằng ví resolver/)
})

test('organizer sees correction reason and revision action only after indexed cancellation', () => {
  const html = render(CampaignPublication, { campaignId: campaign.id, userId: 'user' }, [
    [['publication-submission', 'user', campaign.id], { plan, stage: 'terminated', onchainCampaignId: campaign.onchainCampaignId, chainState: 5 }],
    [['campaign-publication', 'user', campaign.id], { state: 'CANCELLED', indexedBlock: '20', published: false, publicId: null, sync,
      review: { ...reviewed, decision: 'request_changes', reason: 'Clarify the delivery milestones' } }],
  ])
  assert.match(html, /Clarify the delivery milestones/)
  assert.match(html, /Mở bản nháp kế tiếp/)
  assert.doesNotMatch(html, /Công bố campaign bằng ví tổ chức/)
})

test('personal workspace directs the account to its organization campaign workspace', () => {
  const html = render(OrganizationWorkspaceLinks, { userId: 'user' }, [
    [['organizations', 'user'], [{ id: 'org', name: 'My charity' }]],
  ])
  assert.match(html, /Campaign của tổ chức/)
  assert.match(html, /Campaign đã nộp nằm trong tổ chức/)
  assert.match(html, /#\/organizations\/org\/workspace\/campaigns/)
  assert.match(html, /Xem tất cả campaign của My charity/)
})

test('workspace without organizations offers organization setup', () => {
  const html = render(OrganizationWorkspaceLinks, { userId: 'user' }, [[['organizations', 'user'], []]])
  assert.match(html, /href="#\/organizations"/)
  assert.match(html, /Mở tổ chức của tôi/)
})

test('organization navigation hides stale data after failed authorization or account change', () => {
  const cache = [[['organizations', 'other-user'], [{ id: 'private-org', name: 'Other account organization' }]]]
  const html = render(OrganizationWorkspaceLinks, { userId: 'user' }, cache)
  assert.doesNotMatch(html, /Other account organization|private-org/)
  const failed = render(OrganizationWorkspaceLinks, { userId: 'other-user' }, cache, ['organizations', 'other-user'])
  assert.doesNotMatch(failed, /Other account organization|private-org/)
  assert.match(failed, /Tải lại tổ chức/)
})

test('human approval without chain approval explains the missing publish action', () => {
  const html = render(CampaignPublication, { campaignId: campaign.id, userId: 'user' }, [
    [['publication-submission', 'user', campaign.id], { plan, stage: 'bond_locked', onchainCampaignId: campaign.onchainCampaignId, chainState: 0 }],
    [['campaign-publication', 'user', campaign.id], { state: 'DRAFT', indexedBlock: '20', published: false, publicId: null, sync, review: reviewed }],
  ])
  assert.match(html, /Resolver đã đồng ý hồ sơ, nhưng campaign vẫn là DRAFT/)
  assert.match(html, /Nút công bố sẽ mở sau khi giao dịch thành công và indexer đã đồng bộ/)
  assert.doesNotMatch(html, /Công bố campaign bằng ví tổ chức/)
})

test('indexed chain approval exposes the organizer publish action', () => {
  const html = render(CampaignPublication, { campaignId: campaign.id, userId: 'user' }, [
    [['publication-submission', 'user', campaign.id], { plan, stage: 'approved', onchainCampaignId: campaign.onchainCampaignId, chainState: 1 }],
    [['campaign-publication', 'user', campaign.id], { state: 'APPROVED', indexedBlock: '20', published: false, publicId: null, sync, review: reviewed }],
  ])
  assert.match(html, /Công bố campaign bằng ví tổ chức/)
  assert.doesNotMatch(html, /campaign vẫn là DRAFT/)
})
