import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criterionReviewReason, reviewAction, reviewSources } from '../src/features/review/advance-review.ts'
const criterion = { criterionId: 'C1', requiredDocuments: ['INVOICE', 'PAYMENT_PROOF'] }
const evidence = { documents: [{ documentId: 'invoice', kind: 'INVOICE', relatesToCriterionIds: ['C1'] }, { documentId: 'payment', kind: 'PAYMENT_PROOF', relatesToCriterionIds: ['C1'] }] }
const review = { kind: 'EVIDENCE', conflictOfInterest: false, publicHash: 'public-hash', decision: { conflictOfInterest: false, outcome: 'MET', campaignSpent: '1050000000',
  criteria: [{ criterionId: 'C1', outcome: 'MET', reason: 'Independent checks', sources: ['Registry'], limits: 'Synthetic', documentIds: ['invoice', 'payment'] }] } }
test('MET requires all criteria and required document kinds with reasons/sources/limits', () => {
  assert.equal(criterionReviewReason(review, [criterion], evidence, '1100000000'), undefined)
  for (const patch of [{ outcome: 'INCONCLUSIVE' }, { documentIds: ['invoice'] }, { documentIds: ['another-version'] }, { reason: '' }, { sources: [] }, { limits: '' }])
    assert.ok(criterionReviewReason({ ...review, decision: { ...review.decision, criteria: [{ ...review.decision.criteria[0], ...patch }] } }, [criterion], evidence, '1100000000'))
  assert.ok(criterionReviewReason(review, [criterion], { documents: [evidence.documents[0], { ...evidence.documents[1], relatesToCriterionIds: [] }] }, '1100000000'))
})
test('missing public bundle, conflict, excess campaign spending and duplicate criteria block MET', () => {
  for (const patch of [{ publicHash: undefined }, { conflictOfInterest: true }, { decision: { ...review.decision, campaignSpent: '1100000001' } },
    { decision: { ...review.decision, criteria: [review.decision.criteria[0], review.decision.criteria[0]] } }])
    assert.ok(criterionReviewReason({ ...review, ...patch }, [criterion], evidence, '1100000000'))
})
test('INCONCLUSIVE remains supplement; no implicit approval or reinterpretation of the chosen verdict', () => {
  assert.equal(reviewAction(review), 'APPROVE_EVIDENCE')
  assert.equal(reviewAction({ ...review, decision: { ...review.decision, outcome: 'INCONCLUSIVE' } }), 'REQUEST_SUPPLEMENT')
  assert.equal(reviewAction({ ...review, decision: { ...review.decision, outcome: 'NOT_MET' } }), 'REJECT_EVIDENCE')
  assert.equal(reviewAction({ kind: 'CASE' }), 'RESOLVE_CASE')
  assert.equal(reviewAction({ kind: 'FIRST_ELIGIBILITY' }), 'CONFIRM_FIRST_ADVANCE')
  assert.ok(criterionReviewReason({ ...review, decision: { ...review.decision, outcome: 'NEEDS_INFORMATION' } }, [criterion], evidence, '1100000000'))
})
test('staff/resolver sources need both a check description and its reference', () => {
  assert.deepEqual(reviewSources('Registry | controlled-source\nAuthority | signed-form'), [{ description: 'Registry', reference: 'controlled-source' }, { description: 'Authority', reference: 'signed-form' }])
  for (const value of ['', 'Registry', 'Registry |', '|source']) assert.throws(() => reviewSources(value))
})
