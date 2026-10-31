import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

globalThis.window = { localStorage: new MemoryStorage() }
const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close(); delete globalThis.window })
const storage = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-salt-storage.ts')

test('VNext Judge workspace can read an existing legacy localStorage secret without rewriting it', () => {
  const key = storage.vnextSaltStorageKey('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 0n, '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB')
  const salt = `0x${'1'.repeat(64)}`
  const legacy = JSON.stringify({ salt, vote: 'FAIL' })

  window.localStorage.setItem(key, legacy)

  assert.deepEqual(storage.loadVNextJudgeSecret(key), { salt, vote: 'FAIL' })
  assert.equal(window.localStorage.getItem(key), legacy)
})

test('VNext judge salt storage ignores malformed values', () => {
  const key = storage.vnextSaltStorageKey('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1n, '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC')
  window.localStorage.setItem(key, 'not-bytes32')

  assert.deepEqual(storage.loadVNextJudgeSecret(key), { salt: '', vote: 'PASS' })
  assert.equal(window.localStorage.getItem(key), 'not-bytes32')
})
