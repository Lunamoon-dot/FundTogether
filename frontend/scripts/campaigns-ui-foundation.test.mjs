import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())

const { getCampaignUiState } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/campaignState.ts')
const { StatusBadge } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/StatusBadge.tsx')
const { NextActionCard } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/NextActionCard.tsx')
const { EditorialCampaignCard } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/EditorialCampaignCard.tsx')
const { fundingProgressPercent } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/fundingProgress.ts')
const { AppShell } = await server.ssrLoadModule('/src/features/explore/AppShell.tsx')

test('getCampaignUiState maps states to friendly Vietnamese labels, actors, and next actions', () => {
  const communityReview = getCampaignUiState({ status: 'COMMUNITY_REVIEW' })
  assert.equal(communityReview.technicalCode, 'COMMUNITY_REVIEW')
  assert.notEqual(communityReview.label, 'COMMUNITY_REVIEW')
  assert.match(communityReview.label, /Community Review|Góp ý cộng đồng/i)
  assert.ok(communityReview.summary.length > 0)
  assert.ok(communityReview.actor === 'resolver' || communityReview.actor === 'backer' || communityReview.actor === 'system')

  const approved = getCampaignUiState({ status: 'APPROVED' })
  assert.equal(approved.technicalCode, 'APPROVED')
  assert.notEqual(approved.label, 'APPROVED')
  assert.match(approved.label, /Chờ kích hoạt|Đã duyệt/i)
  assert.ok(approved.actor === 'creator' || approved.actor === 'resolver')

  const funding = getCampaignUiState({ status: 'APPROVED', chainState: 0 })
  assert.equal(funding.technicalCode, 'FUNDING')
  assert.notEqual(funding.label, 'FUNDING')
  assert.match(funding.label, /Đang gây quỹ/i)
  assert.equal(funding.actor, 'backer')
  assert.match(funding.nextAction || '', /Ủng hộ|Pledge/i)

  const refundEligible = getCampaignUiState({ access: 'REFUND_ELIGIBLE' })
  assert.equal(refundEligible.technicalCode, 'REFUND_ELIGIBLE')
  assert.notEqual(refundEligible.label, 'REFUND_ELIGIBLE')
  assert.match(refundEligible.label, /Có thể nhận hoàn tiền/i)
  assert.equal(refundEligible.actor, 'backer')
  assert.match(refundEligible.nextAction || '', /Nhận hoàn tiền|Claim/i)

  const refunded = getCampaignUiState({ access: 'REFUNDED' })
  assert.equal(refunded.technicalCode, 'REFUNDED')
  assert.notEqual(refunded.label, 'REFUNDED')
  assert.match(refunded.label, /Đã hoàn tiền/i)
  assert.equal(refunded.actor, 'none')
})

test('StatusBadge renders friendly label and tone without exposing raw technical code as primary text', () => {
  const state = getCampaignUiState({ status: 'COMMUNITY_REVIEW' })
  const html = renderToStaticMarkup(createElement(StatusBadge, { state }))
  assert.match(html, /Community Review|Góp ý cộng đồng/i)
  assert.doesNotMatch(html, />COMMUNITY_REVIEW</)
  assert.match(html, /campaign-status-badge/)
})

test('campaign cards keep implementation codes out of user-facing details', () => {
  const state = getCampaignUiState({ status: 'APPROVED', chainState: 0 })
  const html = renderToStaticMarkup(createElement(EditorialCampaignCard, {
    campaign: {
      commitmentHash: `0x${'1'.repeat(64)}`,
      config: { title: 'Comic', pitch: 'A story', goal: '10000000', tiers: [{ price: '10000000', benefitItems: [] }] },
    },
    state,
    href: '#/campaigns/comic',
  }))

  assert.doesNotMatch(html, /Mã hệ thống|code:FUNDING/)
  assert.match(html, /Commitment/)
})

test('Campaign interactions transition only intended visual properties', async () => {
  const css = await readFile(new URL('../src/features/campaigns/shared/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /transition:\s*all\b/)
})

test('funding progress stays integer-safe above the JavaScript safe-integer range', () => {
  assert.equal(fundingProgressPercent('900719925474099300000000', '900719925474099300000001'), 99)
  assert.equal(fundingProgressPercent('115792089237316195423570985008687907853269984665640564039457584007913129639935', '1'), 100)
  assert.equal(fundingProgressPercent('invalid', '1000000'), 0)
})

test('NextActionCard renders next action, summary, and action link', () => {
  const state = getCampaignUiState({ access: 'REFUND_ELIGIBLE' })
  const html = renderToStaticMarkup(createElement(NextActionCard, { state, href: '#/campaigns/comic-1' }))
  assert.match(html, /Nhận hoàn tiền/i)
  assert.match(html, /href="#\/campaigns\/comic-1"/)
})

test('AppShell renders active navigation, role-gated navigation, environment context, and account access', () => {
  const adminResolverSession = {
    userId: 'u1',
    roles: ['ADMIN', 'RESOLVER'],
    wallets: [],
  }

  const html = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        path: '/campaigns',
        session: adminResolverSession,
        sessionLoading: false,
        error: '',
        onSession: () => {},
      },
      createElement('div', { id: 'test-content' }, 'Child Content')
    )
  )

  // Navigation & active state
  assert.match(html, /href="#\/campaigns"[^>]*aria-current="page"/)
  assert.match(html, /href="#\/campaigns\/review"/)
  assert.doesNotMatch(html, /Campaign Campaign đã tồn tại|href="#\/campaigns\/history"/)
  assert.match(html, /Child Content/)

  // Resolver/Admin workspaces stay separate from Creator-only workspaces.
  assert.doesNotMatch(html, /href="#\/campaigns\/creator"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/creator\/profile"/)
  assert.match(html, /href="#\/campaigns\/library"/)
  assert.match(html, /href="#\/admin"/)
  assert.match(html, /href="#\/campaigns\/resolver"/)

  // Environment and account
  assert.match(html, /MockUSDC|Mạng thử nghiệm/)
  assert.match(html, /href="#\/account"/)
})

test('AppShell keeps Creator workspace navigation for an ordinary member', () => {
  const html = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        path: '/campaigns',
        session: { userId: 'creator', roles: [], wallets: [] },
        sessionLoading: false,
        error: '',
        onSession: () => {},
      },
      createElement('div', null, 'Creator Page')
    )
  )

  assert.match(html, /href="#\/campaigns\/creator"/)
  assert.match(html, /href="#\/campaigns\/creator\/profile"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/resolver"/)
})

test('AppShell hides role-gated navigation for unauthenticated guest', () => {
  const html = renderToStaticMarkup(
    createElement(
      AppShell,
      {
        path: '/campaigns',
        session: null,
        sessionLoading: false,
        error: '',
        onSession: () => {},
      },
      createElement('div', null, 'Guest Page')
    )
  )

  assert.match(html, /href="#\/campaigns"/)
  assert.match(html, /href="#\/campaigns\/review"/)
  assert.doesNotMatch(html, /href="#\/admin"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/resolver"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/creator"/)
  assert.doesNotMatch(html, /href="#\/campaigns\/my-rewards"/)
  assert.match(html, /Đăng nhập/)
})
