import assert from 'node:assert/strict'
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
