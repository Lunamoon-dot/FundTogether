import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close() })

const wizard = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-evidence-wizard.ts')
const root = path.resolve(import.meta.dirname, '..')
const file = (name, type, size = 1024) => ({ name, type, size })

test('accepts PDF, JPEG and PNG up to the backend 10 MiB limit', () => {
  for (const candidate of [file('proof.pdf', 'application/pdf'), file('proof.jpg', 'image/jpeg'), file('proof.png', 'image/png')]) {
    assert.equal(wizard.validateVNextEvidenceFile(candidate), null)
  }
  assert.equal(wizard.MAX_VNEXT_EVIDENCE_BYTES, 10 * 1024 * 1024)
})

test('rejects invalid media types, empty files and oversized files', () => {
  assert.match(wizard.validateVNextEvidenceFile(file('proof.txt', 'text/plain')), /PDF, PNG hoặc JPEG/)
  assert.match(wizard.validateVNextEvidenceFile(file('empty.pdf', 'application/pdf', 0)), /1 byte đến 10 MiB/)
  assert.match(wizard.validateVNextEvidenceFile(file('large.pdf', 'application/pdf', 10 * 1024 * 1024 + 1)), /1 byte đến 10 MiB/)
})

test('browser SHA-256 matches the backend 0x-prefixed node algorithm', async () => {
  const bytes = new TextEncoder().encode('milestone evidence')
  const expected = `0x${createHash('sha256').update(bytes).digest('hex')}`
  assert.equal(await wizard.sha256VNextEvidence(bytes), expected)
})

test('selecting a different file invalidates the previous hash and confirmation', () => {
  const first = wizard.selectVNextEvidenceFile(file('first.pdf', 'application/pdf'))
  first.evidenceHash = `0x${'1'.repeat(64)}`
  first.confirmed = true
  const second = wizard.selectVNextEvidenceFile(file('second.png', 'image/png'))
  assert.equal(second.evidenceHash, null)
  assert.equal(second.confirmed, false)
})

test('non-Creator and unsupported milestone states cannot submit', () => {
  const base = {
    wallet: '0x2222222222222222222222222222222222222222',
    creator: '0x1111111111111111111111111111111111111111',
    campaignState: 3,
    milestoneState: 0,
    chainTimestamp: 10n,
    submissionDeadline: 20n,
    correctionDeadline: 0n,
  }
  assert.match(wizard.vnextEvidenceSubmissionBlockReason(base), /Creator canonical/)
  assert.match(wizard.vnextEvidenceSubmissionBlockReason({ ...base, wallet: base.creator, milestoneState: 3 }), /review active/)
})

test('canonical Review Case must match milestone, revision and SHA-256', () => {
  const hash = `0x${'a'.repeat(64)}`
  const reviewCaseId = `0x${'b'.repeat(64)}`
  const projection = { milestoneId: 2, evidenceRevision: '3', evidenceHash: hash, reviewCaseId, state: 2, paid: false, lastBlockNumber: '9' }
  assert.equal(wizard.matchVNextCanonicalSubmission([projection], 2, hash, '3'), projection)
  assert.equal(wizard.matchVNextCanonicalSubmission([projection], 2, hash, '2'), null)
  assert.equal(wizard.matchVNextCanonicalSubmission([projection], 2, `0x${'c'.repeat(64)}`, '3'), null)
})

test('an indexer delay cannot enable a duplicate on-chain submission', () => {
  const input = { evidenceHash: `0x${'a'.repeat(64)}`, confirmed: true, preflightReady: true }
  assert.equal(wizard.canSendVNextEvidenceTransaction(input), true)
  assert.equal(wizard.canSendVNextEvidenceTransaction({ ...input, submittedTxHash: `0x${'d'.repeat(64)}` }), false)
})

test('AVAILABLE metadata and READY policy are both required for completion', () => {
  const hash = `0x${'a'.repeat(64)}`
  const response = {
    canonicalEvidenceHash: hash,
    access: 'CREATOR',
    assignments: [],
    evidence: [{ reviewCaseId: `0x${'b'.repeat(64)}`, evidenceHash: hash, sha256: hash, mediaType: 'application/pdf', sizeBytes: 10, summary: 'proof', createdAt: 'now', availability: 'AVAILABLE' }],
    availabilityPolicy: { reviewCaseId: `0x${'b'.repeat(64)}`, reviewPhase: 'ENROLLMENT', status: 'READY', timeoutAtSeconds: '10' },
  }
  assert.equal(wizard.isVNextEvidenceReady(response, hash), true)
  assert.equal(wizard.isVNextEvidenceReady({ ...response, availabilityPolicy: { ...response.availabilityPolicy, status: 'WAITING_FOR_EVIDENCE' } }, hash), false)
  assert.equal(wizard.isVNextEvidenceReady({ ...response, evidence: [{ ...response.evidence[0], availability: 'MISSING' }] }, hash), false)
})

test('correction and resubmission follow current contract deadline restrictions', () => {
  const base = {
    wallet: '0x1111111111111111111111111111111111111111',
    creator: '0x1111111111111111111111111111111111111111',
    campaignState: 3,
    milestoneState: 11,
    chainTimestamp: 19n,
    submissionDeadline: 0n,
    correctionDeadline: 20n,
  }
  assert.equal(wizard.vnextEvidenceSubmissionBlockReason(base), null)
  assert.match(wizard.vnextEvidenceSubmissionBlockReason({ ...base, chainTimestamp: 20n }), /deadline/)
  assert.equal(wizard.vnextEvidenceSubmissionBlockReason({ ...base, milestoneState: 12 }), null)
})

test('wizard keeps upload retry separate from the single on-chain transaction', () => {
  const component = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextEvidenceSubmissionWizard.tsx'), 'utf8')
  assert.match(component, /submitMilestoneEvidence/)
  assert.match(component, /vnextUploadEvidence\(reviewCaseId, summary\.trim\(\), selection\.file\)/)
  assert.match(component, /setLockedSubmission/)
  assert.match(component, /current \?\?/)
  assert.match(component, /milestoneEvidenceHash/)
  assert.match(component, /canonicalTargetHash/)
  assert.match(component, /This does not send another transaction/)
  assert.match(component, /Upload exact file/)
  assert.doesNotMatch(component, /localStorage/)
})

test('wizard exposes every required status without manual hash input', () => {
  assert.deepEqual(wizard.vnextEvidenceWizardStatuses, [
    'NOT_STARTED', 'HASHING', 'READY_TO_SUBMIT', 'WALLET_CONFIRMATION', 'TRANSACTION_SUBMITTED',
    'RECEIPT_CONFIRMED', 'WAITING_FOR_INDEXER', 'UPLOADING', 'VERIFYING_AVAILABILITY', 'READY',
    'ACTION_REQUIRED', 'FAILED',
  ])
  const panel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextActionPanel.tsx'), 'utf8')
  assert.match(panel, /VNextEvidenceSubmissionWizard/)
  assert.doesNotMatch(panel, /vnext-evidence-hash-/)
})
