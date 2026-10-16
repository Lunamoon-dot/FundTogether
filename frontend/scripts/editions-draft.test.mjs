import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEditionsDraft } from '../src/features/reward/editions-draft.ts'

const fields = {
  title: 'Saigon at Dawn', pitch: 'An independent digital comic.', story: 'A complete illustrated story for a digital PDF release.',
  goal: '9007199254.740993', durationDays: 30, price: '10.000001',
  rewardTitle: 'Saigon at Dawn PDF', rewardDescription: 'One complete PDF of the comic.',
}

test('builds one standard PDF tier with exact base units and no inventory or financial policy', () => {
  const draft = buildEditionsDraft(fields)
  assert.deepEqual(draft, {
    mode: 'REWARD_V1', policyVersion: 'reward-comic-download-mvp-v1', category: 'COMICS_ARTBOOK',
    title: fields.title, pitch: fields.pitch, story: fields.story, goal: '9007199254740993', fundingDuration: 2592000,
    tiers: [{ tierType: 'STANDARD', title: 'Standard PDF', description: fields.rewardDescription, price: '10000001',
      rewardItems: [{ type: 'DIGITAL_DOWNLOAD', format: 'PDF', title: fields.rewardTitle, description: fields.rewardDescription }] }],
  })
})

test('rejects invalid amounts instead of rounding precision or accepting exponent notation', () => {
  for (const value of ['0', '-1', '1e6', 'NaN', '', '01', '1.0000001', '0.0000001', '1'.repeat(80)]) {
    assert.throws(() => buildEditionsDraft({ ...fields, goal: value }))
    assert.throws(() => buildEditionsDraft({ ...fields, price: value }))
  }
})

test('preserves technical duration bounds without fractional days', () => {
  for (const durationDays of [0, 61, 1.5, NaN]) assert.throws(() => buildEditionsDraft({ ...fields, durationDays }))
  assert.equal(buildEditionsDraft({ ...fields, durationDays: 1 }).fundingDuration, 86400)
  assert.equal(buildEditionsDraft({ ...fields, durationDays: 60 }).fundingDuration, 5184000)
})

test('rejects draft text that is shorter than the server contract before submit', () => {
  assert.throws(() => buildEditionsDraft({ ...fields, story: 'Too short' }), /Cốt truyện.*20 ký tự/)
})

test('keeps an advisory estimated delivery date in the draft when provided', () => {
  const draft = buildEditionsDraft({ ...fields, estimatedDeliveryAt: '2026-12-01T00:00:00.000Z' })
  assert.equal(draft.tiers[0].estimatedDeliveryAt, '2026-12-01T00:00:00.000Z')
})
