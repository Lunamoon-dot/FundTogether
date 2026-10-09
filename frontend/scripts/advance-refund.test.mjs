import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refundPosition } from '../src/features/explore/advance-refund.ts'
const s = { campaignId: '1', campaign: { contributed: '3300000000', refundSnapshotted: true } }
const right = { campaignId: '1', contribution: '1650000000', basePool: '1100000000', supplementPool: '0', baseConsumed: false, base: '550000000', supplement: '0', supplementPaid: '0' }
test('G2 terminal pool1100 gives proportional base, not the whole contribution', () => {
  const p = refundPosition(s, right)
  assert.equal(p.claimable, '550000000'); assert.equal(p.basePaid, '0')
})
test('G1 zero pool does not promise2200 and permits one zero-base consumption', () => {
  const p = refundPosition({ ...s, campaign: { ...s.campaign, contributed: '2200000000' } }, { ...right, contribution: '2200000000', basePool: '0', base: '0' })
  assert.equal(p.claimable, '0'); assert.equal(p.consumeZeroBase, true)
})
test('late supplement remains claimable after base consumed, floor per wallet with tiny units', () => {
  assert.equal(refundPosition(s, { ...right, baseConsumed: true, base: '0', supplementPool: '110000000', supplement: '55000000' }).claimable, '55000000')
  const tiny = { ...s, campaign: { ...s.campaign, contributed: '3' } }
  const r = { ...right, contribution: '1', basePool: '2', base: '0', supplementPool: '2', supplement: '0' }
  assert.equal(refundPosition(tiny, r).claimable, '0')
  assert.equal(refundPosition(tiny, { ...r, baseConsumed: true, supplementPool: '3', supplement: '1' }).claimable, '1')
  assert.equal(refundPosition(tiny, { ...r, baseConsumed: true, supplementPool: '3', supplement: '0', supplementPaid: '1' }).claimable, '0')
  assert.throws(() => refundPosition(tiny, { ...r, base: '2' }))
})
