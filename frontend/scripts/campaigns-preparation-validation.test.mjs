import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDefaultPayoutWalletLinkId, getPreparationFieldError, getPreparationRequiredFieldError, getPreparationAction, validatePreparation } from '../src/features/campaigns/creator/preparation-validation.ts'

const valid = {
  contentOutline: 'A complete comic in twelve illustrated chapters.',
  budgetPlan: 'Art, editing, lettering and final PDF preparation.',
  evidencePlan: 'Page proofs, progress notes and the final PDF hash.',
}

test('reports which preparation field is too short before saving', () => {
  assert.deepEqual(validatePreparation({ ...valid, budgetPlan: 'Too short' }), {
    budgetPlan: 'Ngân sách cần ít nhất 20 ký tự.',
  })
})

test('accepts complete preparation text', () => {
  assert.deepEqual(validatePreparation(valid), {})
})

test('returns an inline error for a short field after it loses focus', () => {
  assert.equal(getPreparationFieldError('evidencePlan', 'sadfasd'), 'Bằng chứng tiến độ cần ít nhất 20 ký tự.')
  assert.equal(getPreparationFieldError('evidencePlan', valid.evidencePlan), undefined)
})

test('reports only a missing payout wallet before saving', () => {
  assert.equal(getPreparationRequiredFieldError(''), 'Hồ sơ Studio chưa có ví đại diện đã xác minh.')
  assert.equal(getPreparationRequiredFieldError('wallet-id'), undefined)
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
