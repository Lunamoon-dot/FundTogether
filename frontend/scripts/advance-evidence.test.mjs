import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sha256, toHex } from 'viem'
import { emptyAdvanceEvidence, evidenceTotals, linkEvidenceDocuments, parseAdvancePackage } from '../src/features/campaigns/advance/advance-evidence.ts'

test('USDC report separates organizer capital, unused and excess without treating unused as return', () => {
  const expense = (fundingSource, amountMinor) => ({ fundingSource, amountMinor, currency: 'USDC', minorUnit: 6 })
  const content = { expenses: [expense('CAMPAIGN', '2150000000'), expense('ORGANIZER', '70000000'), expense('OTHER', '30000000')] }
  assert.deepEqual(evidenceTotals(content, '2200000000'), { campaign: '2150000000', organizer: '70000000', other: '30000000', unused: '50000000', excess: '0' })
  assert.deepEqual(evidenceTotals({ expenses: [expense('CAMPAIGN', '2200000001')] }, '2200000000'), { campaign: '2200000001', organizer: '0', other: '0', unused: '0', excess: '1' })
  for (const change of [{ currency: 'VND' }, { minorUnit: 2 }, { amountMinor: '1.2' }, { amountMinor: '-1' }])
    assert.throws(() => evidenceTotals({ expenses: [{ ...expense('CAMPAIGN', '10'), ...change }] }, '100'))
})
test('document links reference uploaded IDs only and do not replace server-owned metadata', () => {
  const document = { documentId: 'd1', sha256: 'hash', storageObjectId: 'd1', kind: 'REPORT', originalName: 'file.pdf' }
  const content = { report: { outcomes: [{ criterionId: 'C1', documentIds: ['d1'] }] }, expenses: [{ expenseId: 'E1', documentIds: ['d1'] }], documents: [document] }
  assert.deepEqual(linkEvidenceDocuments(content).documents, [{ ...document, relatesToCriterionIds: ['C1'], relatesToExpenseIds: ['E1'] }])
  assert.throws(() => linkEvidenceDocuments({ ...content, documents: [] }))
  assert.throws(() => linkEvidenceDocuments({ ...content, documents: [document, document] }))
})
test('initial report retains frozen criteria and does not claim task completion or delivery', () => {
  const content = emptyAdvanceEvidence({ recipientScope: 'School', stages: [{ acceptanceCriteria: [{ criterionId: 'C1' }, { criterionId: 'C2' }] }] }, 0, '2026-10-09')
  assert.deepEqual(content.report.outcomes.map(o => o.criterionId), ['C1', 'C2'])
  assert.equal(content.giftReport.deliveredPackages, 0)
  assert.equal(content.report.summary, '')
})
test('frozen package rejects wrong bytes, version, stage, plan or deployment', () => {
  const context = { deploymentId: 'one', chainId: 31338 }
  const p = { packageId: 'package', context, campaignId: '1', milestoneIndex: '0', submissionVersion: 2, planHash: 'plan', criteriaHash: 'criteria', parentPackageId: 'first' }
  const bytes = JSON.stringify(p), hash = sha256(toHex(bytes))
  const workflow = { snapshot: { campaignId: '1' }, plan: { planHash: 'plan', criteriaHashes: ['criteria'], context }, packages: [{ id: 'package', milestoneIndex: '0', submissionVersion: 2, evidenceHash: hash }] }
  assert.equal(parseAdvancePackage(bytes, hash, workflow, 'package').parentPackageId, 'first')
  assert.throws(() => parseAdvancePackage(bytes + ' ', hash, workflow, 'package'))
  for (const change of [{ context: { ...context, deploymentId: 'two' } }, { submissionVersion: 3 }, { milestoneIndex: '1' }, { planHash: 'other' }, { campaignId: '0' }]) {
    const changed = JSON.stringify({ ...p, ...change }), digest = sha256(toHex(changed))
    assert.throws(() => parseAdvancePackage(changed, digest, { ...workflow, packages: [{ ...workflow.packages[0], evidenceHash: digest }] }, 'package'))
  }
})
