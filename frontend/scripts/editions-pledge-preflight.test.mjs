import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const preflight = await readFile(new URL('../src/features/reward/ui/EditionsPledgePreflight.tsx', import.meta.url), 'utf8')
const transaction = await readFile(new URL('../src/features/reward/useEditionsTransaction.ts', import.meta.url), 'utf8')

test('required read failures fail closed before READY', () => {
  assert.match(preflight, /wallets\.error \|\| balance\.error \|\| allowance\.error/)
  assert.match(preflight, /readiness = 'READ_FAILED'/)
  assert.match(preflight, /const canPledge = readiness === 'READY' && !transaction && !busy/)
  assert.match(preflight, /chain\.status === 'ON_CHAIN_CONFIRMED' && chain\.snapshot\?\.state === 0/)
  assert.match(preflight, /balance\.data < BigInt\(price\)/)
})

test('approval and pledge remain two explicit steps in one journey', () => {
  assert.match(preflight, /Bước 1\/2: approve đúng giá · Bước 2\/2: pledge/)
  assert.match(preflight, /Ví có thể yêu cầu phí gas/)
  assert.match(transaction, /Bước 1\/2 · Xác nhận approve MockUSDC/)
  assert.match(transaction, /Approve MockUSDC đã thành công nhưng pledge chưa được gửi/)
  assert.match(transaction, /clearEditionsTransaction\(context\.userId, context\.campaignId, action\)/)
  assert.doesNotMatch(transaction, /clearLatestEditionsTransaction/)
})

test('orphaned entitlement is explained and cannot become READY', () => {
  assert.match(preflight, /entitlement\?\.access === 'ORPHANED'/)
  assert.match(preflight, /Khoản pledge cũ thuộc stream không còn canonical/)
})
