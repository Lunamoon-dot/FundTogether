import { formatUnits, parseUnits } from 'viem'
import type { AdvanceDraft, GiftDraft } from '../../../lib/api/generated/advance'

export const documentKinds = ['REPORT', 'INVOICE', 'RECEIPT', 'PAYMENT_PROOF', 'DELIVERY_RECORD', 'PHOTO', 'OTHER'] as const
export type GiftForm = Omit<GiftDraft, 'stages'> & { stages: (AdvanceDraft['content']['stages'][number] & { budget: string })[] }
export function amountUnits(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value) || value.length > 85) throw new Error('Ngân sách phải lớn hơn 0, tối đa 6 chữ số thập phân.')
  const units = parseUnits(value, 6)
  if (units <= 0n || units > (1n << 256n) - 1n) throw new Error('Ngân sách vượt giới hạn token.')
  return units.toString()
}
export function giftTemplate(count: 1 | 3): GiftForm {
  return { activityType: 'GIFT_DISTRIBUTION', channel: count === 1 ? 'INSTITUTION' : 'DIRECT', checklistVersion: 'gift.v1',
    title: '', description: '', recipientScope: '', eligibilityBasis: '', fundingDuration: '604800',
    stages: Array.from({ length: count }, (_, i) => {
      const prefix = `S${i + 1}`
      return { title: `Mua và trao quà đợt ${i + 1}`, description: '', budgetUnits: count === 1 ? '2200000000' : '1100000000',
        budget: count === 1 ? '2200' : '1100', targetPackages: count === 1 ? 100 : 50, goods: '2 kg gạo, 1 lít dầu, 5 gói mì mỗi suất',
        tasks: [{ taskId: `${prefix}-purchase`, description: 'Mua hàng và đối chiếu thanh toán', criterionIds: [`${prefix}-C1`, `${prefix}-C2`] },
          { taskId: `${prefix}-handover`, description: 'Vận chuyển, kiểm đếm và bàn giao đúng đối tượng', criterionIds: [`${prefix}-C3`, `${prefix}-C4`] }],
        acceptanceCriteria: [
          { criterionId: `${prefix}-C1`, description: 'Đủ số suất và thành phần đã cam kết', requiredDocuments: ['REPORT', 'PHOTO'] },
          { criterionId: `${prefix}-C2`, description: 'Hóa đơn khớp thanh toán; tách tiền campaign và tiền tổ chức', requiredDocuments: ['INVOICE', 'PAYMENT_PROOF'] },
          { criterionId: `${prefix}-C3`, description: 'Đúng phạm vi nhận và người ký nhận có thẩm quyền', requiredDocuments: ['DELIVERY_RECORD'] },
          { criterionId: `${prefix}-C4`, description: 'Đối chiếu đã chi và tiền dư cần trả lại', requiredDocuments: ['REPORT'] },
        ] }
    }) }
}
export function editGiftPlan(content: AdvanceDraft['content']): GiftForm {
  return { ...content, stages: content.stages.map(s => ({ ...s, budget: formatUnits(BigInt(s.budgetUnits), 6) })) }
}
export function giftFormInput(form: GiftForm) {
  if (!form.title.trim() || !form.description.trim() || !form.recipientScope.trim() || !form.eligibilityBasis.trim())
    throw new Error('Điền mô tả, phạm vi đối tượng và căn cứ đủ điều kiện của tổ chức.')
  if (!['DIRECT', 'INSTITUTION'].includes(form.channel) || form.activityType !== 'GIFT_DISTRIBUTION' || form.checklistVersion !== 'gift.v1')
    throw new Error('Chọn đúng loại mua và trao quà, cùng kênh tiếp nhận.')
  if (!/^\d+$/.test(form.fundingDuration) || BigInt(form.fundingDuration) < 86400n || BigInt(form.fundingDuration) > 2592000n)
    throw new Error('Thời gian gây quỹ từ 1 đến 30 ngày.')
  if (!form.stages.length) throw new Error('Cần ít nhất một đợt thực hiện.')
  const stages = form.stages.map(({ budget, ...s }, i) => {
    if (!s.title.trim() || !s.description.trim() || !s.goods.trim() || !Number.isSafeInteger(s.targetPackages) || s.targetPackages <= 0)
      throw new Error(`Đợt ${i + 1}: điền công việc, hàng hóa và số suất.`)
    const ids = new Set(s.acceptanceCriteria.map(c => c.criterionId))
    if (!ids.size || ids.size !== s.acceptanceCriteria.length || s.acceptanceCriteria.some(c => !c.criterionId.trim() || !c.description.trim()
      || !c.requiredDocuments.length || c.requiredDocuments.some(k => !documentKinds.includes(k)))) throw new Error(`Đợt ${i + 1}: tiêu chí cần ID riêng, mô tả và loại tài liệu.`)
    if (!s.tasks.length || new Set(s.tasks.map(t => t.taskId)).size !== s.tasks.length || s.tasks.some(t => !t.taskId.trim() || !t.description.trim()
      || !t.criterionIds.length || new Set(t.criterionIds).size !== t.criterionIds.length || t.criterionIds.some(id => !ids.has(id))))
      throw new Error(`Đợt ${i + 1}: mỗi công việc phải gắn với tiêu chí hợp lệ.`)
    return { ...s, budgetUnits: amountUnits(budget) }
  })
  if (stages.reduce((sum, s) => sum + BigInt(s.budgetUnits), 0n) > (1n << 256n) - 1n) throw new Error('Tổng goal vượt giới hạn token.')
  return { ...form, stages }
}
