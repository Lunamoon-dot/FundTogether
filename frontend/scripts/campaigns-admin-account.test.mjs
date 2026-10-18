import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())

const { LifecycleDistributionChart } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/LifecycleDistributionChart.tsx')
const { ExceptionList } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ExceptionList.tsx')
const { AdminConsole } = await server.ssrLoadModule('/src/features/campaigns/admin/AdminConsole.tsx')
const { classifyAccountError } = await server.ssrLoadModule('/src/features/auth/account-error.ts')
const { AccountAccess } = await server.ssrLoadModule('/src/features/auth/AccountAccess.tsx')
const { AppProviders } = await server.ssrLoadModule('/src/app/providers/AppProviders.tsx')

test('LifecycleDistributionChart renders distribution segments and accessible text summary', () => {
  const counts = {
    'Bản nháp': 3,
    'Chờ duyệt': 5,
    'Đang gây quỹ': 2,
    'Hoàn thành': 4,
  }
  const html = renderToStaticMarkup(createElement(LifecycleDistributionChart, { counts }))
  assert.match(html, /lifecycle-chart|distribution-chart/)
  assert.match(html, /Bản nháp/)
  assert.match(html, /3/)
  assert.match(html, /Chờ duyệt/)
  assert.match(html, /5/)
  assert.match(html, /Tổng cộng:?\s*14/i)
  assert.doesNotMatch(html, /NaN|undefined/)
})

test('LifecycleDistributionChart handles empty data by showing insufficient-data message', () => {
  const html = renderToStaticMarkup(createElement(LifecycleDistributionChart, { counts: {} }))
  assert.match(html, /Chưa đủ dữ liệu tổng hợp/)

  const htmlZeros = renderToStaticMarkup(createElement(LifecycleDistributionChart, { counts: { 'Nháp': 0, 'Duyệt': 0 } }))
  assert.match(htmlZeros, /Chưa đủ dữ liệu tổng hợp/)
})

test('ExceptionList renders items with severity, owner, and action link', () => {
  const items = [
    {
      id: 'exc-1',
      label: 'Hồ sơ tác giả chờ duyệt IP quá 48h',
      severity: 'warning',
      owner: 'Studio Kim Đồng',
      actionHref: '#/admin?review=exc-1',
    },
    {
      id: 'exc-2',
      label: 'Giao dịch kích hoạt onchain chưa được lập chỉ mục',
      severity: 'danger',
      owner: 'Chiến dịch #42',
      actionHref: '#/campaigns/c-42',
    },
  ]
  const html = renderToStaticMarkup(createElement(ExceptionList, { items }))
  assert.match(html, /exception-list/)
  assert.match(html, /Hồ sơ tác giả chờ duyệt IP quá 48h/)
  assert.match(html, /Studio Kim Đồng/)
  assert.match(html, /exception-item--warning/)
  assert.match(html, /exception-item--danger/)
  assert.match(html, /#\/admin\?review=exc-1/)
})

test('ExceptionList renders quiet empty state when no exceptions exist', () => {
  const html = renderToStaticMarkup(createElement(ExceptionList, { items: [] }))
  assert.match(html, /Không có ngoại lệ vận hành nào cần xử lý|Không có bất thường/)
})

test('AdminConsole renders 4 operational KPI tiles, lifecycle chart, and exceptions section', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seed admin creators
  queryClient.setQueryData(['campaign-admin-creators', 'admin-1'], [
    {
      id: 'prof-1',
      userId: 'user-1',
      displayName: 'Tác giả A',
      bio: 'Vẽ truyện tranh',
      ipDeclaration: 'Tôi sở hữu 100% bản quyền tác phẩm.',
      originalWorkPledge: false,
      status: 'PENDING',
      createdAt: '2026-10-15T00:00:00Z',
      updatedAt: '2026-10-15T00:00:00Z',
    },
    {
      id: 'prof-2',
      userId: 'user-2',
      displayName: 'Tác giả B',
      bio: 'Minh họa sách tranh',
      ipDeclaration: 'Bản quyền đầy đủ.',
      originalWorkPledge: true,
      status: 'VERIFIED',
      createdAt: '2026-10-14T00:00:00Z',
      updatedAt: '2026-10-14T00:00:00Z',
    },
  ])

  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: queryClient },
      createElement(AdminConsole, { userId: 'admin-1' })
    )
  )

  // 4 KPI tiles
  assert.match(html, /kpi-grid|admin-kpis/)
  assert.match(html, /Hàng đợi thẩm định|Chờ duyệt/i)
  assert.match(html, /Chiến dịch đang gây quỹ|Đang gây quỹ/i)
  assert.match(html, /Chờ đồng bộ|Chờ kích hoạt/i)
  assert.match(html, /Ngoại lệ vận hành|Ngoại lệ/i)

  // Lifecycle chart & Exceptions list
  assert.match(html, /lifecycle-chart/)
  assert.match(html, /exception-list/)

  // Grouped admin actions under secondary section
  assert.match(html, /Quản trị hệ thống|Hành động quản trị/i)

  // Explicit pledge is visible and an unattested pending profile cannot be approved.
  assert.match(html, /Chưa có xác nhận — không được phê duyệt/)
  assert.match(html, /Creator đã xác nhận rõ ràng/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Phê duyệt \(VERIFIED\)<\/button>/)
})

test('classifyAccountError identifies failed layer for provider, rpc, and api session', () => {
  const providerErr = classifyAccountError(new Error('User rejected the request in wallet'))
  assert.equal(providerErr.layer, 'provider')
  assert.match(providerErr.layerLabel, /Ví trình duyệt|Wallet Provider/i)

  const rpcErr = classifyAccountError(new Error('RPC request failed: connection timeout on chain 31339'))
  assert.equal(rpcErr.layer, 'rpc')
  assert.match(rpcErr.layerLabel, /Mạng Blockchain|RPC/i)

  const sessionErr = classifyAccountError(new Error('Invalid credentials or session expired'))
  assert.equal(sessionErr.layer, 'session')
  assert.match(sessionErr.layerLabel, /Phiên đăng nhập|API Session/i)
})

test('AccountAccess presents password login, secondary signup, and linked-wallet login as separate surfaces', () => {
  const html = renderToStaticMarkup(
    createElement(AppProviders, null,
      createElement(AccountAccess, { session: null, onSession: () => undefined })
    )
  )

  assert.match(html, /account-login/)
  assert.match(html, /account-login__form/)
  assert.match(html, /account-login__submit/)
  assert.match(html, /account-login__switch/)
  assert.match(html, /account-login__wallet/)
  assert.match(html, /account-login__wallet-summary/)
  assert.match(html, /Đăng nhập bằng ví đã liên kết/)
})


