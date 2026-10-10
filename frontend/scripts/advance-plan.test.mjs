import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amountUnits, documentKinds, documentKindLabels, giftFormInput, giftTemplate } from '../src/features/campaigns/advance/advance-plan.ts'
function valid(count = 1) {
  const form = giftTemplate(count)
  return { ...form, title: 'Synthetic plan', description: 'Controlled gift delivery', recipientScope: 'Synthetic cohort', eligibilityBasis: 'Controlled authority',
    stages: form.stages.map(s => ({ ...s, description: 'Purchase, count and hand over gifts' })) }
}
test('G1/G2 preserve integer budgets, recipient channel and criterion/task references', () => {
  const one = giftFormInput(valid()), three = giftFormInput(valid(3))
  assert.equal(one.channel, 'INSTITUTION'); assert.equal(one.stages[0].targetPackages, 100)
  assert.equal(one.stages[0].budgetUnits, '2200000000')
  assert.equal(three.channel, 'DIRECT'); assert.equal(three.stages.reduce((sum, s) => sum + BigInt(s.budgetUnits), 0n), 3300000000n)
  assert.ok(three.stages.every(s => s.targetPackages === 50)); assert.ok(!('budget' in three.stages[0]))
})
test('every evidence kind has a readable Vietnamese label while keeping its API key', () => {
  assert.deepEqual(Object.keys(documentKindLabels), [...documentKinds])
  assert.deepEqual(Object.values(documentKindLabels), ['Báo cáo', 'Hóa đơn', 'Biên nhận', 'Chứng từ thanh toán', 'Biên bản bàn giao', 'Ảnh minh chứng', 'Khác'])
})
test('rejects unsafe financial strings, missing criteria/documents and mismatched task references', () => {
  assert.equal(amountUnits('9007199254.740993'), '9007199254740993')
  for (const amount of ['0', '-1', '1e9', '1.0000001', 'NaN', ' 1', '01', '9'.repeat(90)]) assert.throws(() => amountUnits(amount))
  for (const change of [{ channel: 'OTHER' }, { fundingDuration: '0' }, { recipientScope: '' }]) assert.throws(() => giftFormInput({ ...valid(), ...change }))
  const form = valid(); form.stages[0].tasks[0].criterionIds = ['unknown']
  assert.throws(() => giftFormInput(form))
  const duplicate = valid(); duplicate.stages[0].acceptanceCriteria.push(duplicate.stages[0].acceptanceCriteria[0])
  assert.throws(() => giftFormInput(duplicate))
})
