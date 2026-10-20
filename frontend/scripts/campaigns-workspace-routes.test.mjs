import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { campaignDetailFocusHref, campaignDetailHref, resolveCampaignDetailRoute } from '../src/features/explore/campaignRoutes.ts'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { PublicArea } = await server.ssrLoadModule('/src/features/explore/PublicArea.tsx')

function renderPublicArea(path) {
  return renderToStaticMarkup(createElement(PublicArea, {
    path,
    session: null,
    sessionLoading: false,
    error: '',
    onSession: () => {},
  }))
}

test('resolves every canonical campaign workspace route', () => {
  const cases = [
    ['/campaigns/comic-1', {
      workspace: 'public', campaignId: 'comic-1', initialTab: 'overview', legacy: false,
      canonicalHref: '#/campaigns/comic-1',
    }],
    ['/campaigns/creator/comic-1?tab=production', {
      workspace: 'creator', campaignId: 'comic-1', initialTab: 'production', legacy: false,
      canonicalHref: '#/campaigns/creator/comic-1?tab=production',
    }],
    ['/campaigns/resolver/comic-1?tab=commitments', {
      workspace: 'resolver', campaignId: 'comic-1', initialTab: 'commitments', legacy: false,
      canonicalHref: '#/campaigns/resolver/comic-1?tab=commitments',
    }],
    ['/campaigns/resolver/comic-1?tab=production&focus=disbursement', {
      workspace: 'resolver', campaignId: 'comic-1', initialTab: 'production', focus: 'disbursement', legacy: false,
      canonicalHref: '#/campaigns/resolver/comic-1?tab=production&focus=disbursement',
    }],
    ['/admin/campaigns/comic-1?tab=activity', {
      workspace: 'admin', campaignId: 'comic-1', initialTab: 'activity', legacy: false,
      canonicalHref: '#/admin/campaigns/comic-1?tab=activity',
    }],
    ['/campaigns/creator/creator', {
      workspace: 'creator', campaignId: 'creator', initialTab: 'overview', legacy: false,
      canonicalHref: '#/campaigns/creator/creator',
    }],
    ['/campaigns/resolver/resolver', {
      workspace: 'resolver', campaignId: 'resolver', initialTab: 'overview', legacy: false,
      canonicalHref: '#/campaigns/resolver/resolver',
    }],
  ]

  for (const [path, expected] of cases) {
    assert.deepEqual(resolveCampaignDetailRoute(path), expected)
  }
})

test('keeps reserved list, draft, profile and review routes out of detail matching', () => {
  for (const path of [
    '/campaigns',
    '/campaigns/review',
    '/campaigns/vnext',
    '/campaigns/library',
    '/campaigns/history',
    '/campaigns/history/entitlements',
    '/campaigns/creator',
    '/campaigns/creator/draft',
    '/campaigns/creator/new',
    '/campaigns/creator/profile',
    '/campaigns/resolver',
    '/campaigns/admin',
    '/admin',
    '/admin/campaigns',
  ]) {
    assert.equal(resolveCampaignDetailRoute(path), null, path)
  }
})

test('maps old creator and resolver detail URLs to one canonical redirect', () => {
  assert.deepEqual(resolveCampaignDetailRoute('/campaigns/comic-1/creator'), {
    workspace: 'creator',
    campaignId: 'comic-1',
    initialTab: 'overview',
    legacy: true,
    canonicalHref: '#/campaigns/creator/comic-1',
  })
  assert.deepEqual(resolveCampaignDetailRoute('/campaigns/comic-1/resolver'), {
    workspace: 'resolver',
    campaignId: 'comic-1',
    initialTab: 'overview',
    legacy: true,
    canonicalHref: '#/campaigns/resolver/comic-1',
  })

  for (const path of ['/campaigns/comic-1/creator', '/campaigns/comic-1/resolver']) {
    const html = renderPublicArea(path)
    assert.match(html, /Đang chuyển tới không gian làm việc…/)
    assert.doesNotMatch(html, /Đang mở không gian làm việc…/)
    assert.equal((html.match(/role="status"/g) || []).length, 1)
  }
})

test('preserves the resolver feedback alias as the activity tab', () => {
  assert.deepEqual(resolveCampaignDetailRoute('/campaigns/comic-1/resolver/feedback'), {
    workspace: 'resolver',
    campaignId: 'comic-1',
    initialTab: 'activity',
    legacy: true,
    canonicalHref: '#/campaigns/resolver/comic-1?tab=activity',
  })
})

test('encodes campaign IDs before generating hrefs', () => {
  assert.equal(campaignDetailHref('public', 'comic 100%'), '#/campaigns/comic%20100%25')
  assert.equal(
    campaignDetailHref('resolver', 'comic 100%', 'activity'),
    '#/campaigns/resolver/comic%20100%25?tab=activity',
  )
  assert.equal(
    campaignDetailFocusHref('resolver', 'comic 100%', 'production', 'disbursement'),
    '#/campaigns/resolver/comic%20100%25?tab=production&focus=disbursement',
  )
})

test('rejects empty, nested or malformed campaign IDs', () => {
  for (const path of [
    '/campaigns/',
    '/campaigns/comic-1/chapter-2',
    '/campaigns/comic-1%2Fchapter-2',
    '/campaigns/%E0%A4%A',
    '/campaigns/creator/comic-1%2Fchapter-2',
    '/campaigns/resolver/comic-1/feedback',
  ]) {
    assert.equal(resolveCampaignDetailRoute(path), null, path)
  }
})
