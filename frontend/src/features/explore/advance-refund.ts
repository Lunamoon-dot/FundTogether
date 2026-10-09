import type { AdvanceRefundsItemsItem, AdvanceSnapshot } from '../../lib/api/generated/advance'

export function refundPosition(snapshot: AdvanceSnapshot, right: AdvanceRefundsItemsItem) {
  const c = snapshot.campaign
  if (right.campaignId !== snapshot.campaignId) throw new Error('Quyền refund không thuộc campaign này.')
  const total = BigInt(c.contributed), contribution = BigInt(right.contribution)
  if (total === 0n || contribution > total) throw new Error('Contribution không khớp denominator refund.')
  const baseEntitlement = contribution * BigInt(right.basePool) / total
  const supplementEntitlement = contribution * BigInt(right.supplementPool) / total
  const basePaid = right.baseConsumed ? baseEntitlement : 0n, supplementPaid = BigInt(right.supplementPaid)
  if (supplementPaid > supplementEntitlement || BigInt(right.base) !== baseEntitlement - basePaid || BigInt(right.supplement) !== supplementEntitlement - supplementPaid)
    throw new Error('Quyền đã trả/claimable không khớp pool. Cần tải lại projection.')
  return { baseEntitlement: baseEntitlement.toString(), supplementEntitlement: supplementEntitlement.toString(), basePaid: basePaid.toString(),
    supplementPaid: supplementPaid.toString(), claimable: (BigInt(right.base) + BigInt(right.supplement)).toString(),
    consumeZeroBase: c.refundSnapshotted && !right.baseConsumed && right.base === '0' && right.supplement === '0' }
}
