import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { getBalanceQueryOptions, readContractQueryOptions } from 'wagmi/query'
import { createServer } from 'vite'

for (const mode of ['development', 'reward']) {
  const server = await createServer({ mode, server: { middlewareMode: true, ws: false }, logLevel: 'error' })
  after(() => server.close())
  const { LinkedWalletCard } = await server.ssrLoadModule('/src/features/auth/LinkedWalletCard.tsx')
  const { default: deployment, activeChain } = await server.ssrLoadModule('/src/lib/web3/deployment-context.ts')
  const config = createConfig({ chains: [activeChain], transports: { [activeChain.id]: http(deployment.rpcUrl) }, ssr: true })
  const props = { address: `0x${'1'.repeat(40)}`, chainId: deployment.chainId, userId: 'one' }
  function render({ token = 10000000000n, eth = 1000000000000000000n, tokenError = false, actual = props } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const nativeKey = getBalanceQueryOptions(config, { address: props.address, chainId: props.chainId, scopeKey: props.userId }).queryKey
    const tokenKey = readContractQueryOptions(config, { address: deployment.tokenAddress, functionName: 'balanceOf',
      args: [props.address], chainId: props.chainId, scopeKey: `${props.userId}:${deployment.deploymentId}` }).queryKey
    client.setQueryData(nativeKey, { value: eth, decimals: 18, symbol: 'ETH', formatted: '1' })
    client.setQueryData(tokenKey, token)
    if (tokenError) client.getQueryCache().find({ queryKey: tokenKey }).setState({ status: 'error', error: new Error('RPC unavailable') })
    const html = renderToStaticMarkup(createElement(WagmiProvider, { config },
      createElement(QueryClientProvider, { client }, createElement(LinkedWalletCard, actual))))
    client.clear()
    return html
  }
  test(`${mode}: shows separate native gas and MockUSDC balances`, () => {
    const html = render()
    assert.match(html, /Phí giao dịch: <strong>1 ETH/)
    assert.match(html, /Số dư quyên góp: <strong>10000 MockUSDC/)
  })
  test(`${mode}: zero balances render as zero, not loading`, () => {
    const html = render({ token: 0n, eth: 0n })
    assert.match(html, /0 ETH/)
    assert.match(html, /0 MockUSDC/)
    assert.doesNotMatch(html, /Đang tải số dư/)
  })
  test(`${mode}: failed token read never presents cached funds as current`, () => {
    const html = render({ tokenError: true })
    assert.match(html, /Không tải được số dư MockUSDC/)
    assert.doesNotMatch(html, /10000 MockUSDC/)
    assert.match(html, /1 ETH/)
  })
  test(`${mode}: another wallet or account cannot inherit cached balances`, () => {
    for (const actual of [{ ...props, address: `0x${'2'.repeat(40)}` }, { ...props, userId: 'two' }]) {
      const html = render({ actual })
      assert.doesNotMatch(html, /10000 MockUSDC|1 ETH/)
      assert.match(html, /Đang tải số dư MockUSDC/)
    }
  })
  test(`${mode}: unsupported chain never reads the active deployment token for that wallet`, () => {
    const html = render({ actual: { ...props, chainId: 1 } })
    assert.match(html, /chưa hỗ trợ đọc số dư/)
    assert.doesNotMatch(html, /MockUSDC/)
  })
}
