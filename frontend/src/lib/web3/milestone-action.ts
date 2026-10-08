import { decodeEventLog } from 'viem'
import type { Abi, TransactionReceipt } from 'viem'
import type { PreparedMilestoneAction } from '../api/milestone-workflow'
import type { MilestoneAction } from '../../../../backend/src/modules/evidence/milestone-policy'

const functions: Record<MilestoneAction, string> = { submit: 'submitEvidenceForVersion', admit: 'admitEvidence', reject: 'rejectEvidence',
  challenge: 'challengeEvidenceForVersion', material: 'addChallengeMaterial', respond: 'submitChallengeResponse', continue: 'resolveChallenge',
  resubmit: 'resolveChallenge', stop: 'resolveChallenge', expire: 'expireSubmission', timeout: 'finalizeChallengeTimeout', settle: 'settleMilestoneForVersion', bond: 'claimBond' }
export function milestoneCallArgs(abi: Abi, action: MilestoneAction, call: PreparedMilestoneAction, campaignId: string, index: string) {
  if (call.functionName !== functions[action] || call.expected.campaignId !== campaignId || String(call.args[0]) !== campaignId
    || action !== 'bond' && (call.expected.milestoneIndex !== index || String(call.args[1]) !== index))
    throw new Error('Kế hoạch giao dịch không khớp thao tác và milestone đã chọn.')
  const entry = abi.find(e => e.type === 'function' && e.name === call.functionName)
  if (!entry || entry.type !== 'function' || entry.inputs.length !== call.args.length) throw new Error('ABI không khớp kế hoạch giao dịch.')
  return call.args.map((value, n) => entry.inputs[n].type.startsWith('uint') ? BigInt(value) : value)
}
export function matchesMilestoneReceipt(receipt: TransactionReceipt, abi: Abi, call: PreparedMilestoneAction) {
  const matches = (name: string, expected: Record<string, string>) => receipt.logs.some(log => {
    if (log.address.toLowerCase() !== call.contractAddress.toLowerCase()) return false
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics, strict: true })
      const args = event.args as unknown as Record<string, unknown>
      return event.eventName === name && Object.entries(expected).every(([key, value]) => String(args[key]).toLowerCase() === value.toLowerCase())
    } catch { return false }
  })
  return receipt.status === 'success' && receipt.to?.toLowerCase() === call.contractAddress.toLowerCase()
    && receipt.from.toLowerCase() === call.wallet.toLowerCase() && matches(call.event, call.expected)
    && (!call.proof || matches(call.proof.event, call.proof.expected))
}
