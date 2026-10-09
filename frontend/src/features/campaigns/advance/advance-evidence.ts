import { sha256, toHex } from 'viem'
import type { AdvanceDraft, AdvanceEvidenceDraft, AdvanceOwnerWorkflow } from '../../../lib/api/generated/advance'

export type EvidenceContent = AdvanceEvidenceDraft['content']
export type EvidencePackage = EvidenceContent & { packageId: string; campaignId: string; milestoneIndex: string; submissionVersion: number;
  planHash: string; criteriaHash: string; parentPackageId: string | null; context: AdvanceOwnerWorkflow['plan']['context'] }
export function emptyAdvanceEvidence(plan: AdvanceDraft['content'], stage: number, date: string): EvidenceContent {
  return { report: { summary: '', performedFrom: date, performedTo: date,
    outcomes: plan.stages[stage].acceptanceCriteria.map(c => ({ criterionId: c.criterionId, description: '', documentIds: [] })) },
    documents: [], expenses: [], giftReport: { deliveredPackages: 0, recipientScope: plan.recipientScope, distributionFrom: date,
      distributionTo: date, handoverSummary: '', limitations: '' } }
}
export function evidenceTotals(content: EvidenceContent, budget: string) {
  let campaign = 0n, organizer = 0n, other = 0n
  for (const expense of content.expenses) {
    if (expense.currency !== 'USDC' || expense.minorUnit !== 6 || !/^(0|[1-9]\d*)$/.test(expense.amountMinor))
      throw new Error('Báo cáo pilot B dùng USDC với 6 số thập phân. Không cộng lẫn đơn vị tiền.')
    const amount = BigInt(expense.amountMinor)
    if (expense.fundingSource === 'CAMPAIGN') campaign += amount
    else if (expense.fundingSource === 'ORGANIZER') organizer += amount
    else other += amount
  }
  const cap = BigInt(budget)
  return { campaign: campaign.toString(), organizer: organizer.toString(), other: other.toString(),
    unused: (campaign < cap ? cap - campaign : 0n).toString(), excess: (campaign > cap ? campaign - cap : 0n).toString() }
}
export function linkEvidenceDocuments(content: EvidenceContent): EvidenceContent {
  const docs = new Set(content.documents.map(d => d.documentId))
  if (docs.size !== content.documents.length) throw new Error('Document ID bị trùng.')
  for (const item of [...content.report.outcomes, ...content.expenses]) {
    if (new Set(item.documentIds).size !== item.documentIds.length || item.documentIds.some(id => !docs.has(id))) throw new Error('Tham chiếu chứng từ không tồn tại hoặc bị trùng.')
  }
  return { ...content, documents: content.documents.map(d => ({ ...d,
    relatesToCriterionIds: content.report.outcomes.filter(o => o.documentIds.includes(d.documentId)).map(o => o.criterionId),
    relatesToExpenseIds: content.expenses.filter(e => e.documentIds.includes(d.documentId)).map(e => e.expenseId) })) }
}
export function parseAdvancePackage(bytes: string, hash: string, workflow: AdvanceOwnerWorkflow, packageId: string): EvidencePackage {
  if (sha256(toHex(bytes)) !== hash) throw new Error('Bytes hồ sơ không khớp hash đã chốt.')
  const p = JSON.parse(bytes) as EvidencePackage
  const expected = workflow.packages.find(v => v.id === packageId)
  if (!expected || p.packageId !== packageId || p.planHash !== workflow.plan.planHash || p.campaignId !== workflow.snapshot?.campaignId
    || p.milestoneIndex !== expected.milestoneIndex || p.submissionVersion !== expected.submissionVersion
    || p.criteriaHash !== workflow.plan.criteriaHashes[Number(p.milestoneIndex)] || expected.evidenceHash !== hash
    || Object.entries(workflow.plan.context).some(([k, v]) => p.context?.[k as keyof typeof p.context] !== v))
    throw new Error('Package thuộc deployment, campaign, đợt hoặc version khác.')
  return p
}
