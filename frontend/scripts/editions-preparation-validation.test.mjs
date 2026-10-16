import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDefaultPayoutWalletLinkId, getEditionsPreparationFieldError, getEditionsPreparationRequiredFieldError, getPreparationAction, validateEditionsPreparation } from '../src/features/reward/editions-preparation-validation.ts'

const valid = {
  contentOutline: 'A complete comic in twelve illustrated chapters.',
  budgetPlan: 'Art, editing, lettering and final PDF preparation.',
  evidencePlan: 'Page proofs, progress notes and the final PDF hash.',
}

test('reports which preparation field is too short before saving', () => {
  assert.deepEqual(validateEditionsPreparation({ ...valid, budgetPlan: 'Too short' }), {
    budgetPlan: 'Ngân sách cần ít nhất 20 ký tự.',
  })
})

test('accepts complete preparation text', () => {
  assert.deepEqual(validateEditionsPreparation(valid), {})
})

test('returns an inline error for a short field after it loses focus', () => {
  assert.equal(getEditionsPreparationFieldError('evidencePlan', 'sadfasd'), 'Bằng chứng tiến độ cần ít nhất 20 ký tự.')
  assert.equal(getEditionsPreparationFieldError('evidencePlan', valid.evidencePlan), undefined)
})

test('reports missing wallet or commitment deadline before saving', () => {
  assert.equal(getEditionsPreparationRequiredFieldError('', '2026-10-21'), 'Chọn ví nhận tiền đã xác minh trước khi lưu hồ sơ.')
  assert.equal(getEditionsPreparationRequiredFieldError('wallet-id', ''), 'Chọn hạn cam kết phát hành PDF trước khi lưu hồ sơ.')
  assert.equal(getEditionsPreparationRequiredFieldError('wallet-id', '2026-10-21'), undefined)
})

test('selects the only verified payout wallet by default', () => {
  assert.equal(getDefaultPayoutWalletLinkId('', [{ id: 'wallet-id' }]), 'wallet-id')
  assert.equal(getDefaultPayoutWalletLinkId('saved-wallet', [{ id: 'wallet-id' }]), 'saved-wallet')
  assert.equal(getDefaultPayoutWalletLinkId('', [{ id: 'one' }, { id: 'two' }]), '')
})

test('shows save before the first draft and lock only after a clean draft save', () => {
  assert.equal(getPreparationAction(false, false), 'SAVE')
  assert.equal(getPreparationAction(true, true), 'SAVE')
  assert.equal(getPreparationAction(true, false), 'LOCK')
})
