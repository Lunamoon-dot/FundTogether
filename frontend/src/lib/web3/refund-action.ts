import { decodeEventLog } from 'viem'
import type { Abi, Address, Hash, TransactionReceipt } from 'viem'
import type { PublicCampaign } from '../api/public-campaigns'

export type RefundAction = 'claimRefund' | 'finalizeFundingFailure' | 'cancelCampaign' | 'finalizeMilestoneTimeout'

export async function readRefundSnapshot(campaign: PublicCampaign, donor: Address, reader: {
  getBlock: (options: { blockTag: 'latest' } | { blockNumber: bigint }) => Promise<{ number: bigint; hash: Hash; timestamp: bigint }>
  read: (name: string, args: unknown[], blockNumber: bigint) => Promise<unknown>
}) {
  const block = await reader.getBlock({ blockTag: 'latest' })
  const id = BigInt(campaign.onchainCampaignId)
  const read = (name: string, args: unknown[]) => reader.read(name, args, block.number)
  const [record, state, deadline, open, pool, contribution, claimed] = await Promise.all([
    read('campaigns', [id]), read('campaignState', [id]), read('fundingDeadlines', [id]),
    read('refundSnapshotted', [id]), read('refundPool', [id]), read('contributions', [id, donor]), read('claimedRefund', [id, donor]),
  ])
  const [title, token, goal, , organizer, , , total] = record as [string, Address, bigint, bigint, Address, boolean, bigint, bigint]
  if (title !== campaign.title || token.toLowerCase() !== campaign.tokenAddress.toLowerCase() || goal !== BigInt(campaign.goalUnits)
    || organizer.toLowerCase() !== campaign.organizer.toLowerCase() || deadline !== BigInt(campaign.fundingDeadline))
    throw new Error('Danh tính campaign trên chain không khớp hồ sơ. Tải lại trước khi ký.')
  const milestoneIndex = await read('currentMilestoneIndex', [id]) as bigint
  const timeoutState = [3, 6, 9].includes(Number(state))
  const milestoneDeadline = timeoutState ? await read(Number(state) === 6 ? 'evidenceDeadlines' : 'activationDeadlines',
    Number(state) === 6 ? [id, milestoneIndex] : [id]) as bigint : 0n
  if ((await reader.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Block đã thay đổi. Đối chiếu lại trước khi ký.')
  return { block, state: Number(state), open: Boolean(open), claimed: Boolean(claimed), contribution: contribution as bigint,
    milestoneIndex, canFinalizeMilestone: timeoutState && milestoneDeadline > 0n && block.timestamp >= milestoneDeadline,
    amount: open && total > 0n ? (contribution as bigint) * (pool as bigint) / total : 0n,
    canFinalize: Number(state) === 2 && block.timestamp >= (deadline as bigint) && total < goal }
}

export function assertRefundAction(action: RefundAction, snapshot: Awaited<ReturnType<typeof readRefundSnapshot>>, donor: Address, organizer: Address) {
  if (action === 'claimRefund' && (!snapshot.open || snapshot.claimed || snapshot.contribution === 0n))
    throw new Error(snapshot.claimed ? 'Ví này đã nhận hoàn tiền.' : 'Ví này chưa có quyền nhận hoàn tiền.')
  if (action === 'finalizeFundingFailure' && !snapshot.canFinalize) throw new Error('Campaign chưa đủ điều kiện chốt gây quỹ thất bại.')
  if (action === 'finalizeMilestoneTimeout' && !snapshot.canFinalizeMilestone) throw new Error('Milestone chưa đủ điều kiện chốt thất bại do quá hạn.')
  if (action === 'cancelCampaign' && (snapshot.state !== 2 || donor.toLowerCase() !== organizer.toLowerCase()))
    throw new Error('Chỉ ví organizer được hủy campaign đang gây quỹ.')
}

export function verifyRefundReceipt(action: RefundAction, receipt: TransactionReceipt, abi: Abi, contract: Address, id: string, donor: Address, amountUnits: string, milestoneIndex?: string) {
  if (receipt.status !== 'success') throw new Error('Giao dịch bị revert. Quyền nhận chưa bị sử dụng; đối chiếu lại trước khi thử tiếp.')
  const expectedEvent = action === 'claimRefund' ? 'RefundClaimed' : action === 'cancelCampaign' ? 'CampaignCancelled' : action === 'finalizeMilestoneTimeout' ? 'CampaignFailed' : 'FundingFinalized'
  const found = receipt.logs.some(log => {
    if (log.address.toLowerCase() !== contract.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics })
      const args = event.args as { campaignId?: bigint; donor?: Address; amount?: bigint; state?: number; organizer?: Address; milestoneIndex?: bigint }
      return event.eventName === expectedEvent && args.campaignId === BigInt(id) && (action === 'claimRefund'
        ? args.donor?.toLowerCase() === donor.toLowerCase() && args.amount === BigInt(amountUnits)
        : action === 'cancelCampaign' ? args.organizer?.toLowerCase() === donor.toLowerCase()
          : action === 'finalizeMilestoneTimeout' ? milestoneIndex !== undefined && args.milestoneIndex === BigInt(milestoneIndex) : Number(args.state) === 4)
    } catch { return false }
  })
  if (!found) throw new Error('Receipt không chứa sự kiện đúng campaign, ví và số tiền. Chưa xác nhận thao tác thành công.')
}
