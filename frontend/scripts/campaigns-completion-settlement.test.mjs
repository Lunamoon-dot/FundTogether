import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { createServer } from 'vite'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = relative => fs.readFileSync(path.join(root, 'src', 'features', 'campaigns', relative), 'utf8')
const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { CompletionSettlementPanel } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/CompletionSettlementPanel.tsx')
const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })
const hash = `0x${'1'.repeat(64)}`
const zeroHash = `0x${'0'.repeat(64)}`
const resolverWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const creatorWallet = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
const backerWallet = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'

function chain(state, overrides = {}) {
  return {
    status: 'ON_CHAIN_CONFIRMED',
    onchainCampaignId: '0',
    bindingTransactionHash: hash,
    deployment,
    chainTimestamp: '1800000000',
    challenges: [],
    snapshot: {
      creator: creatorWallet,
      commitmentHash: hash,
      goal: '100000000',
      price: '20000000',
      fundingDeadline: '1790000000',
      releaseDeadline: '1801000000',
      raised: '240000000',
      escrowed: '140000000',
      state,
      productionHash: hash,
      productionApproved: true,
      pdfHash: zeroHash,
      releaseEvidenceHash: zeroHash,
      reviewRequestedAt: '0',
      challengeDeadline: '0',
      disputeDeadline: '0',
      openDisputes: '0',
      payoutRequestHash: zeroHash,
      payoutAmount: '0',
      payoutRequestedAt: '0',
      payoutDecisionHash: zeroHash,
      creatorPaid: '100000000',
      completionRequestHash: zeroHash,
      completionRequestedAt: '0',
      completionDecisionHash: zeroHash,
      completionRaised: '0',
      surplusPool: '0',
      surplusClaimed: '0',
      backerCount: '1',
      surplusClaimantCount: '0',
      ...overrides,
    },
  }
}

function completionRequest(status = 'SUBMITTED_ON_CHAIN') {
  return {
    id: 'completion-1',
    campaignId: 'campaign',
    streamId: 'stream',
    commitmentHash: hash,
    revision: 1,
    requestHash: hash,
    title: 'Hồ sơ hoàn thành',
    summary: 'Creator đã hoàn thành bản PDF cuối.',
    reason: 'Đề nghị Resolver chốt campaign hoàn thành.',
    status,
    requestTxHash: hash,
    requestedAt: '2026-12-07T00:00:00.000Z',
    decisionHash: null,
    decisionTxHash: null,
    createdAt: '2026-12-07T00:00:00.000Z',
    updatedAt: '2026-12-07T00:00:00.000Z',
    files: [],
    decisions: [],
  }
}

function renderPanel({ mode, state, requests = [], entitlement, claimable, snapshot = {} }) {
  const userId = `${mode}-user`
  const canonicalChain = chain(state, snapshot)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['campaign-completion-requests', 'campaign', userId], requests)
  client.setQueryData(['campaign-surplus-claims', 'campaign', userId], [])
  if (claimable !== undefined && entitlement) {
    client.setQueryData(['campaign-surplus-claimable', 'campaign', entitlement.backerWallet, canonicalChain.snapshot.surplusClaimed], claimable)
  }
  const transaction = { address: resolverWallet, busy: false, send: async () => {} }
  const html = renderToStaticMarkup(createElement(
    WagmiProvider,
    { config },
    createElement(
      QueryClientProvider,
      { client },
      createElement(CompletionSettlementPanel, {
        campaignId: 'campaign',
        userId,
        mode,
        chain: canonicalChain,
        transaction,
        entitlement,
        onRefresh: () => {},
      }),
    ),
  ))
  client.clear()
  return html
}

const entitlement = {
  id: 'entitlement-1',
  campaignId: 'campaign',
  campaignTitle: 'Comic',
  backerWallet,
  transactionHash: hash,
  amountPaid: '240000000',
  quantity: '12',
  access: 'DOWNLOAD_ELIGIBLE',
  confirmedAt: null,
}

test('resolver sees the missing prerequisite instead of an unexplained empty settlement card', () => {
  const html = renderPanel({ mode: 'resolver', state: 1 })

  assert.match(html, /Chưa có hồ sơ hoàn thành để duyệt/)
  assert.match(html, /chờ Creator gửi PDF cuối/i)
  assert.doesNotMatch(html, /Ghi quyết định và ký on-chain/)
})

test('resolver is directed to release review before completion approval exists', () => {
  const html = renderPanel({
    mode: 'resolver',
    state: 2,
    snapshot: { pdfHash: hash, releaseEvidenceHash: hash },
  })

  assert.match(html, /PDF cuối đang chờ duyệt/)
  assert.match(html, /Sản xuất &amp; bằng chứng/)
  assert.doesNotMatch(html, /Ghi quyết định và ký on-chain/)
})

test('resolver sees whether a released campaign is waiting for challenge expiry or creator completion dossier', () => {
  const waiting = renderPanel({
    mode: 'resolver',
    state: 3,
    snapshot: { pdfHash: hash, challengeDeadline: '1800000100' },
  })
  assert.match(waiting, /chờ hết thời gian challenge/i)

  const eligible = renderPanel({
    mode: 'resolver',
    state: 3,
    snapshot: { pdfHash: hash, challengeDeadline: '1799999999' },
  })
  assert.match(eligible, /chờ Creator gửi hồ sơ hoàn thành/i)
})

test('resolver gets the on-chain completion decision control only for an indexed completion request', () => {
  const html = renderPanel({ mode: 'resolver', state: 5, requests: [completionRequest()] })

  assert.match(html, /Quyết định Resolver/)
  assert.match(html, /Ghi quyết định và ký on-chain/)
  assert.doesNotMatch(html, /Chưa có hồ sơ hoàn thành để duyệt/)
})

test('backer is told when and where surplus claim becomes available', () => {
  const html = renderPanel({ mode: 'public', state: 1, entitlement })

  assert.match(html, /Chưa thể nhận phần thừa/)
  assert.match(html, /nút claim sẽ xuất hiện ngay tại đây trong Tổng quan/i)
  assert.doesNotMatch(html, /Nhận về ví của tôi|Gửi cho Creator/)
})

test('completed campaign explains a missing pledge entitlement instead of hiding claim controls silently', () => {
  const html = renderPanel({
    mode: 'public',
    state: 6,
    snapshot: { surplusPool: '140000000' },
  })

  assert.match(html, /đăng nhập bằng tài khoản và ví đã dùng để pledge/i)
  assert.match(html, /nút claim nằm tại đây trong Tổng quan/i)
})

test('completed backer with canonical entitlement sees both surplus choices', () => {
  const html = renderPanel({
    mode: 'public',
    state: 6,
    entitlement,
    claimable: 140000000n,
    snapshot: { surplusPool: '140000000' },
  })

  assert.match(html, /Nhận về ví của tôi/)
  assert.match(html, /Gửi cho Creator/)
})

test('completed backer sees an explicit explanation when no surplus remains claimable', () => {
  const html = renderPanel({
    mode: 'public',
    state: 6,
    entitlement,
    claimable: 0n,
    snapshot: { surplusPool: '140000000', surplusClaimed: '140000000' },
  })

  assert.match(html, /Không còn phần surplus có thể claim/)
})

test('completion settlement exposes the dossier and exactly two surplus destinations', () => {
  const panel = read('shared/ui/CompletionSettlementPanel.tsx')
  const api = read('api/campaigns.ts')
  const creatorPage = read('creator/CampaignActions.tsx')
  const publicPage = read('public/CampaignPage.tsx')

  assert.match(creatorPage, /CompletionSettlementPanel/)
  assert.match(publicPage, /CompletionSettlementPanel/)
  assert.match(publicPage, /mode="public"/)
  assert.match(publicPage, /DisbursementPanel/)
  assert.match(publicPage, /mode="public".*DisbursementPanel|DisbursementPanel.*mode="public"/s)
  assert.doesNotMatch(publicPage, /ActivationPanel|approveCompletion|rejectCompletion/)
  assert.match(panel, /createCompletionRequest/)
  assert.match(panel, /requestCompletion/)
  assert.match(panel, /approveCompletion/)
  assert.match(panel, /rejectCompletion/)
  assert.match(panel, /claimSurplus/)
  assert.match(panel, /Nhận về ví của tôi/)
  assert.match(panel, /Gửi cho Creator/)
  assert.doesNotMatch(panel, /data\.append\(['"]amount|destination.*input|Admin destination/i)
  assert.match(api, /completionRequests/)
  assert.match(api, /surplusClaims/)
  assert.match(api, /payoutRequests/)
  assert.doesNotMatch(api, /requestPayout|approvePayout|rejectPayout/)
  assert.equal(fs.existsSync(path.join(root, 'src', 'features', 'campaigns', 'shared', 'ui', 'PayoutRequestPanel.tsx')), false)
})

test('completed state is surplus settlement, not a full payout label', () => {
  const source = read('shared/ui/campaignState.ts')
  assert.match(source, /COMPLETION_REQUESTED: 5/)
  assert.match(source, /chờ quyết toán surplus/)
  assert.doesNotMatch(source, /PAYOUT_REQUESTED|Đã giải ngân|requestPayout/)
})

test('disbursement form reports client validation instead of silently blocking submit', () => {
  const panel = read('shared/ui/DisbursementPanel.tsx')

  assert.match(panel, /function validateRequest\(\)/)
  assert.match(panel, /noValidate/)
  assert.match(panel, /Hãy nhập số tiền giải ngân hợp lệ/)
  assert.match(panel, /Hãy đính kèm tài liệu giải thích sử dụng tiền/)
  assert.match(panel, /const validationError = validateRequest\(\)/)
})

test('disbursement draft stays retryable until the request is canonical', () => {
  const panel = read('shared/ui/DisbursementPanel.tsx')

  assert.match(panel, /const draft = latest\?\.status === 'DRAFT' \? latest : undefined/)
  assert.match(panel, /Hồ sơ đã lưu nhưng chưa ký on-chain/)
  assert.match(panel, /Ký lại requestDisbursement/)
  assert.match(panel, /pending && !draft/)
  assert.match(panel, /Đã ghi nhận yêu cầu giải ngân on-chain/)
})
