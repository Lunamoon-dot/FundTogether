import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())

const { AppShell } = await server.ssrLoadModule('/src/features/explore/AppShell.tsx')

function render(path, session) {
  return renderToStaticMarkup(createElement(AppShell, {
    path,
    session,
    sessionLoading: false,
    error: '',
    onSession: () => {},
  }, createElement('div', null, 'Workspace content')))
}

test('internal role routes use distinct dashboard shells and navigation', () => {
  const creator = render('/campaigns/creator', { userId: 'creator', roles: [], wallets: [] })
  assert.match(creator, /Creator Studio/)
  assert.match(creator, /Sản xuất &amp; bằng chứng/)
  assert.match(creator, /Giải ngân/)
  assert.doesNotMatch(creator, /Funding summary|NOTARIAL ESCROW LEDGER/)

  const resolver = render('/campaigns/resolver', { userId: 'resolver', roles: ['RESOLVER'], wallets: [] })
  assert.match(resolver, /Resolver Console/)
  assert.match(resolver, /Hàng chờ/)
  assert.match(resolver, /PDF &amp; hoàn thành/)
  assert.doesNotMatch(resolver, /Xưởng ấn phẩm|Hồ sơ Studio/)

  const admin = render('/admin', { userId: 'admin', roles: ['ADMIN'], wallets: [] })
  assert.match(admin, /Admin Operations/)
  assert.match(admin, /Indexer &amp; deployment/)
  assert.match(admin, /Tài khoản &amp; quyền/)
  assert.doesNotMatch(admin, /Duyệt hồ sơ giải ngân|Gửi hồ sơ hoàn thành/)
})

test('public campaign route keeps the public discovery shell', () => {
  const html = render('/campaigns', { userId: 'admin', roles: ['ADMIN', 'RESOLVER'], wallets: [] })

  assert.match(html, /Khám phá/)
  assert.match(html, /Truyện tranh &amp; Artbook/)
  assert.match(html, /Thẩm định Resolver/)
  assert.doesNotMatch(html, /Creator Studio|Resolver Console|Admin Operations/)
})

test('internal campaign frame exposes operational metrics and role-specific tabs', async () => {
  const { InternalCampaignFrame } = await server.ssrLoadModule('/src/features/campaigns/shared/workspace/InternalCampaignFrame.tsx')
  const campaign = {
    id: 'campaign-1',
    title: 'Nuôi Huy',
    creatorDisplayName: 'Huy Studio',
    config: { goal: '100', price: '20' },
  }
  const chain = {
    snapshot: {
      raised: '240',
      escrowed: '140',
      creatorPaid: '100',
      fundingDeadline: '1795737600',
      releaseDeadline: '1798416000',
      state: 3,
    },
  }
  const html = renderToStaticMarkup(createElement(InternalCampaignFrame, {
    role: 'resolver',
    campaign,
    chain,
    activeTab: 'production',
    onTabChange: () => {},
    alerts: null,
    main: createElement('div', null, 'Resolver work surface'),
  }))

  assert.match(html, /workspace-campaign-frame/)
  assert.match(html, /workspace-metric-strip/)
  assert.match(html, /workspace-inspector/)
  assert.match(html, /Hàng chờ/)
  assert.match(html, /PDF &amp; hoàn thành/)
  assert.match(html, /Đã huy động/)
  assert.match(html, /Escrow còn lại/)
  assert.match(html, /Đã giải ngân/)
  assert.doesNotMatch(html, /Funding summary|NOTARIAL ESCROW LEDGER/)
})

test('internal campaign pages do not mount the public editorial frame', async () => {
  const paths = [
    'src/features/campaigns/creator/CampaignWorkspacePage.tsx',
    'src/features/campaigns/resolver/CampaignReviewPage.tsx',
    'src/features/campaigns/admin/CampaignOperationsPage.tsx',
  ]
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(source, /InternalCampaignFrame/)
    assert.doesNotMatch(source, /CampaignDetailFrame|CampaignOverview|CampaignLedger/)
  }

  const publicSource = await readFile(new URL('../src/features/campaigns/public/CampaignPage.tsx', import.meta.url), 'utf8')
  assert.match(publicSource, /CampaignDetailFrame/)
  assert.match(publicSource, /CampaignLedger/)
})
