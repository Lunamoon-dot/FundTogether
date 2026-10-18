import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDraft } from '../src/features/campaigns/creator/draft.ts'

const fields = {
  title: 'Saigon at Dawn', pitch: 'An independent digital comic.', story: 'A complete illustrated story for a digital PDF release.',
  goal: '9007199254.740993', durationDays: 30, price: '10.000001',
  benefitTitle: 'Saigon at Dawn PDF', benefitDescription: 'One complete PDF of the comic.',
}

test('builds one standard PDF tier with exact base units and no inventory or financial policy', () => {
  const draft = buildDraft(fields)
  assert.deepEqual(draft, {
    mode: 'FUNDTOGETHER_V1', policyVersion: 'fundtogether-comic-download-mvp-v1', category: 'COMICS_ARTBOOK',
    title: fields.title, pitch: fields.pitch, story: fields.story, goal: '9007199254740993', fundingDuration: 2592000,
    tiers: [{ tierType: 'STANDARD', title: 'Standard PDF', description: fields.benefitDescription, price: '10000001',
      benefitItems: [{ type: 'DIGITAL_DOWNLOAD', format: 'PDF', title: fields.benefitTitle, description: fields.benefitDescription }] }],
  })
})

test('rejects invalid amounts instead of rounding precision or accepting exponent notation', () => {
  for (const value of ['0', '-1', '1e6', 'NaN', '', '01', '1.0000001', '0.0000001', '1'.repeat(80)]) {
    assert.throws(() => buildDraft({ ...fields, goal: value }))
    assert.throws(() => buildDraft({ ...fields, price: value }))
  }
})

test('preserves technical duration bounds without fractional days', () => {
  for (const durationDays of [0, 61, 1.5, NaN]) assert.throws(() => buildDraft({ ...fields, durationDays }))
  assert.equal(buildDraft({ ...fields, durationDays: 1 }).fundingDuration, 86400)
  assert.equal(buildDraft({ ...fields, durationDays: 60 }).fundingDuration, 5184000)
})

test('rejects draft text that is shorter than the server contract before submit', () => {
  assert.throws(() => buildDraft({ ...fields, story: 'Too short' }), /Cốt truyện.*20 ký tự/)
})

test('does not put delivery dates into the campaign draft', () => {
  const draft = buildDraft({
    ...fields,
    estimatedDeliveryAt: '2026-12-01T00:00:00.000Z',
    estimatedDeliveryStart: '2026-11-01T00:00:00.000Z',
    estimatedDeliveryEnd: '2026-11-13T00:00:00.000Z',
  })
  assert.equal('estimatedDeliveryAt' in draft.tiers[0], false)
  assert.equal('estimatedDeliveryWindow' in draft.tiers[0], false)
})
