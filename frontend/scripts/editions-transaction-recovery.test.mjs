import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

class MemoryStorage {
  values = new Map()
  get length() { return this.values.size }
  key(index) { return [...this.values.keys()][index] ?? null }
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
  clear() { this.values.clear() }
}

const localStorage = new MemoryStorage()
globalThis.window = { localStorage }
const server = await createServer({ mode: 'reward', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close(); delete globalThis.window })
const recovery = await server.ssrLoadModule('/src/features/reward/editions-transaction-recovery.ts')

const base = { userId: 'user', campaignId: 'campaign', stage: 'submitted', updatedAt: new Date().toISOString() }

test('recovery records are action-scoped and clearing one action preserves another', () => {
  localStorage.clear()
  recovery.saveEditionsTransaction({ ...base, action: 'createCampaign', txHash: `0x${'1'.repeat(64)}` })
  recovery.saveEditionsTransaction({ ...base, action: 'pledge', txHash: `0x${'2'.repeat(64)}` })

  recovery.clearEditionsTransaction('user', 'campaign', 'createCampaign')

  assert.equal(recovery.loadEditionsTransaction('user', 'campaign', 'createCampaign'), null)
  assert.equal(recovery.loadEditionsTransaction('user', 'campaign', 'pledge')?.txHash, `0x${'2'.repeat(64)}`)
})

test('malformed hashes never become recoverable transactions', () => {
  localStorage.clear()
  const key = recovery.getEditionsTransactionStorageKey('user', 'campaign', 'pledge')
  localStorage.setItem(key, JSON.stringify({ ...base, action: 'pledge', txHash: 'not-a-hash' }))
  assert.equal(recovery.loadLatestEditionsTransaction('user', 'campaign'), null)
})
