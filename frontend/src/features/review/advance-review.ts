import type { AdvanceActionInput, AdvanceReviewInput, GiftDraft } from '../../lib/api/generated/advance'
import type { EvidencePackage } from '../campaigns/advance/advance-evidence'

export const reviewOutcomes = ['MET', 'NEEDS_INFORMATION', 'NOT_MET', 'INCONCLUSIVE'] as const
export const reviewOutcomeLabels = { MET: 'Đạt', NEEDS_INFORMATION: 'Thiếu thông tin', NOT_MET: 'Không đạt', INCONCLUSIVE: 'Chưa thể kết luận' }
export function reviewSources(text: string) {
  const lines = text.split('\n').map(v => v.trim()).filter(Boolean)
  if (!lines.length) throw new Error('Cần ít nhất một nguồn kiểm tra.')
  return lines.map(line => {
    const separator = line.indexOf('|')
    if (separator < 1 || !line.slice(separator + 1).trim()) throw new Error('Mỗi nguồn cần dạng: căn cứ kiểm tra | tài liệu/đường dẫn tham chiếu.')
    return { description: line.slice(0, separator).trim(), reference: line.slice(separator + 1).trim() }
  })
}
export function reviewAction(review: AdvanceReviewInput): AdvanceActionInput['action'] {
  switch (review.kind) {
    case 'APPROVE_CAMPAIGN': return 'APPROVE_CAMPAIGN'
    case 'FIRST_ELIGIBILITY': return 'CONFIRM_FIRST_ADVANCE'
    case 'STOP': return 'STOP_CAMPAIGN'
    case 'CASE': return 'RESOLVE_CASE'
    case 'EVIDENCE': return review.decision?.outcome === 'MET' ? 'APPROVE_EVIDENCE'
      : review.decision?.outcome === 'NOT_MET' ? 'REJECT_EVIDENCE' : 'REQUEST_SUPPLEMENT'
  }
}
export function criterionReviewReason(review: AdvanceReviewInput, criteria: GiftDraft['stages'][number]['acceptanceCriteria'],
  evidence: EvidencePackage, budget: string): string | undefined {
  const decision = review.decision
  if (!decision || decision.conflictOfInterest || review.conflictOfInterest) return 'Cần giải quyết xung đột lợi ích trước khi xét duyệt.'
  if (!/^(0|[1-9]\d*)$/.test(decision.campaignSpent) || BigInt(decision.campaignSpent) > BigInt(budget)) return 'Chi từ quỹ campaign vượt budget hoặc không hợp lệ; tách nguồn tổ chức.'
  if (decision.criteria.length !== criteria.length || new Set(decision.criteria.map(c => c.criterionId)).size !== criteria.length) return 'Cần kết luận đúng một lần cho mọi tiêu chí đã chốt.'
  for (const criterion of criteria) {
    const c = decision.criteria.find(c => c.criterionId === criterion.criterionId)
    if (!c || !c.reason.trim() || !c.limits.trim() || !c.sources.some(s => s.trim())) return `Điền lý do, nguồn kiểm tra và giới hạn cho ${criterion.criterionId}.`
    const docs = c.documentIds.map(id => evidence.documents.find(d => d.documentId === id))
    if (docs.some(d => !d || !d.relatesToCriterionIds.includes(c.criterionId))) return `Chứng từ không thuộc ${criterion.criterionId} của package này.`
    if (c.outcome === 'MET' && criterion.requiredDocuments.some(kind => !docs.some(d => d?.kind === kind))) return `${criterion.criterionId} còn thiếu loại chứng từ bắt buộc.`
  }
  if (decision.outcome === 'MET') {
    if (decision.criteria.some(c => c.outcome !== 'MET')) return 'Chỉ kết luận đạt khi mọi tiêu chí đều đạt.'
    if (!review.publicHash) return 'Cần bản công khai đã che dữ liệu, đang truy cập được.'
  } else if (!decision.criteria.some(c => c.outcome === decision.outcome)) return 'Kết luận tổng hợp cần có tiêu chí tương ứng.'
  return undefined
}
