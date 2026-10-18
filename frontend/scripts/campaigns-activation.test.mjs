import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(() => server.close())
const { ActivationPanel } = await server.ssrLoadModule('/src/features/campaigns/shared/ui/ActivationPanel.tsx')
const transactionHash = `0x${'a'.repeat(64)}`
const chain = {
  status: 'ORPHANED',
  onchainCampaignId: null,
  bindingTransactionHash: transactionHash,
  chainTimestamp: '0',
  snapshot: null,
  challenges: [],
  deployment: { contractAddress: '0xcontract', tokenAddress: '0xtoken', resolver: '0xresolver' },
}

test('orphaned activation exposes server-backed transaction recovery without a local record', () => {
  const html = renderToStaticMarkup(createElement(ActivationPanel, {
    mode: 'creator', chain, transaction: null, busy: false,
    onRefresh: () => {}, onActivate: () => {}, onReconcile: () => {},
  }))
  assert.match(html, /Cần đối chiếu giao dịch/)
  assert.match(html, new RegExp(transactionHash))
  assert.match(html, /Đối chiếu lại transaction/)
  assert.doesNotMatch(html, /Tạo campaign trên chain|Funding đã mở canonical/)
})
