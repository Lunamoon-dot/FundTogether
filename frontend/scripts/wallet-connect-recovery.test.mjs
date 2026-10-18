import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WALLET_CONNECT_WATCHDOG_MS, isWalletConnectStalled } from '../src/features/auth/wallet-connect-recovery.ts'

test('does not report a stalled wallet connection before the watchdog deadline', () => {
  assert.equal(isWalletConnectStalled(true, 10_000, 10_000 + WALLET_CONNECT_WATCHDOG_MS - 1), false)
})

test('reports a stalled wallet connection after the watchdog deadline', () => {
  assert.equal(isWalletConnectStalled(true, 10_000, 10_000 + WALLET_CONNECT_WATCHDOG_MS), true)
})

test('does not report a stalled wallet connection after it has stopped connecting', () => {
  assert.equal(isWalletConnectStalled(false, 10_000, 10_000 + WALLET_CONNECT_WATCHDOG_MS), false)
})
