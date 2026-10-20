import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const frontendRoot = path.resolve(import.meta.dirname, '..')
const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())

const { CampaignDetailFrame } = await server.ssrLoadModule('/src/features/campaigns/shared/detail/CampaignDetailFrame.tsx')
const { CampaignOverview } = await server.ssrLoadModule('/src/features/campaigns/shared/detail/CampaignOverview.tsx')
const { CampaignLedger } = await server.ssrLoadModule('/src/features/campaigns/shared/detail/CampaignLedger.tsx')
const { CampaignDossierList } = await server.ssrLoadModule('/src/features/campaigns/shared/detail/CampaignDossierList.tsx')

const campaign = {
  id: 'campaign-1',
  status: 'PUBLISHED',
  commitmentHash: '0xcommitment',
  surface: 'FUNDING',
  reviewStartedAt: null,
  creatorDisplayName: 'Huy Studio',
  contentOutline: 'Đề cương nội dung',
  budgetPlan: 'Kế hoạch ngân sách',
  evidencePlan: 'Kế hoạch bằng chứng',
  feedbackCount: 0,
  evidenceHashes: [],
  decisions: [],
  config: {
    mode: 'FUNDTOGETHER_V1',
    policyVersion: 'fundtogether-comic-download-mvp-v1',
    title: 'Nuôi Huy',
    pitch: 'Một file PDF hoàn chỉnh.',
    story: 'Câu chuyện',
    category: 'COMICS_ARTBOOK',
    goal: '100000000',
    fundingDuration: 2592000,
    tiers: [{
      tierType: 'STANDARD',
      title: 'Standard PDF',
      description: 'PDF độc quyền',
      price: '20000000',
      benefitItems: [{ type: 'DIGITAL_DOWNLOAD', format: 'PDF', title: 'PDF', description: 'Một file PDF hoàn chỉnh.' }],
    }],
  },
}

const chain = {
  status: 'ON_CHAIN_CONFIRMED',
  onchainCampaignId: '1',
  chainTimestamp: '1735689600',
  bindingTransactionHash: null,
  challenges: [],
  deployment: {
    protocolKind: 'CAMPAIGNS', chainId: 31339, abiVersion: 'campaigns-local-judge-v1', abiHash: '0xabi',
    contractAddress: '0xcontract', tokenAddress: '0xtoken', resolver: '0xresolver', backupResolver: '0xbackup',
    genesisHash: '0xgenesis', contractCodeHash: '0xcode', policyHash: '0xpolicy',
  },
  snapshot: {
    creator: '0xcreator', commitmentHash: '0xcommitment', goal: '100000000', price: '20000000',
    fundingDeadline: '1735689600', releaseDeadline: '0', raised: '140000000', escrowed: '140000000', state: 0,
    productionHash: `0x${'0'.repeat(64)}`, productionApproved: false, pdfHash: `0x${'0'.repeat(64)}`,
    releaseEvidenceHash: `0x${'0'.repeat(64)}`, reviewRequestedAt: '0', challengeDeadline: '0', disputeDeadline: '0', openDisputes: '0',
    payoutRequestHash: `0x${'0'.repeat(64)}`, payoutAmount: '0', payoutRequestedAt: '0', payoutDecisionHash: `0x${'0'.repeat(64)}`, creatorPaid: '0',
    completionRequestHash: `0x${'0'.repeat(64)}`, completionRequestedAt: '0', completionDecisionHash: `0x${'0'.repeat(64)}`, completionRaised: '0',
    surplusPool: '0', surplusClaimed: '0', backerCount: '1', surplusClaimantCount: '0',
  },
}

const uiState = { label: 'Đang gây quỹ', tone: 'success', summary: 'Đang mở gây quỹ', actor: 'backer' }
const timelineEvents = [{ label: 'Gây quỹ on-chain', detail: 'Đang mở gây quỹ trên hợp đồng', tone: 'current' }]

test('role-neutral detail components render the folio, tier, dossier, ledger, and tabs', () => {
  const html = renderToStaticMarkup(createElement(CampaignDetailFrame, {
    campaignId: campaign.id,
    activeTab: 'overview',
    onTabChange: () => {},
    alerts: createElement('div', null, 'alert'),
    main: createElement('div', null,
      createElement(CampaignOverview, { campaign, chain, uiState, timelineEvents, showDetails: true }),
      createElement(CampaignDossierList, { contentOutline: campaign.contentOutline, budgetPlan: campaign.budgetPlan, evidencePlan: campaign.evidencePlan }),
    ),
    ledger: createElement(CampaignLedger, { campaign, chain, actions: createElement('button', null, 'action') }),
  }))

  assert.match(html, /Tổng quan \(Folio\)/)
  assert.match(html, /Nuôi Huy/)
  assert.match(html, /STANDARD DIGITAL CAMPAIGN/)
  assert.match(html, /Đề cương nội dung/)
  assert.match(html, /Funding summary/)
  assert.match(html, /140 MockUSDC/)
})

test('detail frame omits the ledger column when no ledger is provided', () => {
  const html = renderToStaticMarkup(createElement(CampaignDetailFrame, {
    campaignId: campaign.id,
    activeTab: 'production',
    onTabChange: () => {},
    alerts: null,
    main: createElement('div', null, 'production content'),
    ledger: null,
  }))

  assert.match(html, /production content/)
  assert.doesNotMatch(html, /monograph-ledger/)
  assert.doesNotMatch(html, /Sổ công chứng ký quỹ/)
})

test('dossier list renders each supplied plan without financial actions', () => {
  const html = renderToStaticMarkup(createElement(CampaignDossierList, {
    contentOutline: 'Outline body', budgetPlan: 'Budget body', evidencePlan: 'Evidence body',
  }))
  assert.match(html, /Outline body/)
  assert.match(html, /Budget body/)
  assert.match(html, /Evidence body/)
})

test('shared detail components contain no wallet or campaign mutation code', () => {
  const detailRoot = path.join(frontendRoot, 'src', 'features', 'campaigns', 'shared', 'detail')
  for (const file of fs.readdirSync(detailRoot).filter(name => name.endsWith('.tsx'))) {
    const source = fs.readFileSync(path.join(detailRoot, file), 'utf8')
    assert.doesNotMatch(source, /useTransaction|\.send\(|createPayoutRequest|preparePayoutDecision|createCompletionRequest|prepareCompletionDecision|\bpledge\b|claimRefund|claimSurplus/)
  }
})
