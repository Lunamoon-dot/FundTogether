import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getResolverWalletBlockReason } from '../src/lib/web3/wallet-link-guard.ts'

const resolver = `0x${'7'.repeat(40)}`
const backupResolver = `0x${'8'.repeat(40)}`
const otherWallet = `0x${'2'.repeat(40)}`

test('blocks a resolver account before signing with another browser wallet', () => {
  const reason = getResolverWalletBlockReason({
    roles: ['USER', 'RESOLVER'],
    connectedAddress: otherWallet,
    resolverAddress: resolver,
  })

  assert.match(reason ?? '', /Ngắt kết nối ví trình duyệt hiện tại/)
  assert.match(reason ?? '', /chưa gửi yêu cầu ký/)
  assert.match(reason ?? '', new RegExp(otherWallet, 'i'))
  assert.match(reason ?? '', new RegExp(resolver, 'i'))
})

test('allows the configured resolver wallet regardless of address casing', () => {
  assert.equal(getResolverWalletBlockReason({
    roles: ['RESOLVER'],
    connectedAddress: resolver.toUpperCase(),
    resolverAddress: resolver,
  }), null)

test('allows the configured backup resolver wallet', () => {
  assert.equal(getResolverWalletBlockReason({
    roles: ['RESOLVER'],
    connectedAddress: backupResolver,
    resolverAddress: resolver,
    backupResolverAddress: backupResolver,
  }), null)
})
})

test('does not impose the resolver wallet on ordinary accounts', () => {
  assert.equal(getResolverWalletBlockReason({
    roles: ['USER'],
    connectedAddress: otherWallet,
    resolverAddress: resolver,
  }), null)
})
