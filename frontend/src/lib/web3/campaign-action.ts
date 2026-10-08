import type { Address, Hash } from 'viem'
import type { SubmissionPlan } from '../api/campaign-submission'

export type CampaignAction = 'approve' | 'publish' | 'cancel'
const publishedStates = ['FUNDING', 'FUNDED', 'FUNDING_FAILED', 'MILESTONE_ACTIVE', 'IN_REVIEW', 'CHALLENGED', 'MILESTONE_SETTLED', 'COMPLETED', 'EVIDENCE_PENDING', 'FAILED']
const publishedChainStates = [2, 3, 4, 6, 7, 8, 9, 10, 11, 12]

export interface CampaignActionIdentity { plan: SubmissionPlan; onchainCampaignId: string; actor: Address }

function planIdentity(plan: SubmissionPlan) {
  return JSON.stringify([plan.chainId, plan.contractAddress.toLowerCase(), plan.tokenAddress.toLowerCase(), plan.organizer.toLowerCase(),
    plan.genesisHash.toLowerCase(), plan.contractCodeHash.toLowerCase(), plan.tokenCodeHash.toLowerCase(), plan.confirmations,
    plan.deploymentBlockNumber ?? null, plan.deploymentBlockHash?.toLowerCase() ?? null,
    plan.draftKey.toLowerCase(), plan.title, plan.fundingDeadline, plan.budgetUnits, plan.criteriaHashes.map(hash => hash.toLowerCase()), plan.goalUnits, plan.bondUnits])
}

export function assertCampaignActionIdentity(cached: CampaignActionIdentity, fresh: CampaignActionIdentity) {
  if (campaignActionIdentityKey(fresh) !== campaignActionIdentityKey(cached))
    throw new Error('Campaign ID, quyền ký hoặc kế hoạch đã thay đổi. Tải lại hồ sơ trước khi ký.')
}

export function campaignActionIdentityKey(identity: CampaignActionIdentity) {
  return JSON.stringify([identity.onchainCampaignId, identity.actor.toLowerCase(), planIdentity(identity.plan)])
}

export async function verifyCampaignActionSnapshot(identity: CampaignActionIdentity, action: CampaignAction, reader: {
  getBlock: (options: { blockTag: 'latest' } | { blockNumber: bigint }) => Promise<{ number: bigint; hash: Hash }>
  read: (functionName: string, args: unknown[], blockNumber: bigint) => Promise<unknown>
}) {
  const { plan } = identity
  const block = await reader.getBlock({ blockTag: 'latest' })
  const read = (name: string, args: unknown[]) => reader.read(name, args, block.number)
  const id = BigInt(identity.onchainCampaignId)
  if (await read('campaignForDraft', [plan.organizer, plan.draftKey]) !== id + 1n)
    throw new Error('Campaign ID trên chain không khớp hồ sơ đang mở. Tải lại trước khi ký.')
  const [campaign, deadline, count, chainState] = await Promise.all([
    read('campaigns', [id]), read('fundingDeadlines', [id]), read('milestoneCount', [id]), read('campaignState', [id]),
  ])
  const [title, token, goal, bond, organizer, locked, amount] = campaign as [string, Address, bigint, bigint, Address, boolean, bigint]
  if (title !== plan.title || token.toLowerCase() !== plan.tokenAddress.toLowerCase() || organizer.toLowerCase() !== plan.organizer.toLowerCase()
    || goal !== BigInt(plan.goalUnits) || bond !== BigInt(plan.bondUnits) || deadline !== BigInt(plan.fundingDeadline) || count !== BigInt(plan.budgetUnits.length))
    throw new Error('Dữ liệu campaign không khớp kế hoạch đã chốt. Tải lại trước khi ký.')
  await Promise.all(plan.budgetUnits.map(async (budget, index) => {
    const [milestone, criteria] = await Promise.all([read('milestones', [id, BigInt(index)]), read('milestoneCriteria', [id, BigInt(index)])])
    if ((milestone as [bigint, number])[0] !== BigInt(budget)) throw new Error('Ngân sách milestone không khớp kế hoạch đã chốt.')
    if (String(criteria).toLowerCase() !== plan.criteriaHashes[index].toLowerCase()) throw new Error('Tiêu chí milestone không khớp kế hoạch đã chốt.')
  }))
  const state = Number(chainState)
  if (action !== 'cancel' && state === (action === 'approve' ? 0 : 1) && (!locked || amount < BigInt(plan.bondUnits)))
    throw new Error('Campaign chưa khóa đủ bond. Chưa thể duyệt hoặc công bố.')
  if (action === 'approve' && String(await read('resolver', [])).toLowerCase() !== identity.actor.toLowerCase())
    throw new Error('Resolver trên chain không khớp quyền ký đang dùng.')
  if ((await reader.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Block đã thay đổi trong lúc đối chiếu. Tải lại hồ sơ trước khi ký.')
  return { state, blockNumber: block.number, blockHash: block.hash }
}

export function isCampaignActionIndexed(action: CampaignAction, projection: { state: string | null; indexedBlock: string | null }, receiptBlock?: bigint) {
  if (!projection.indexedBlock || (receiptBlock !== undefined && BigInt(projection.indexedBlock) < receiptBlock)) return false
  if (action === 'cancel') return projection.state === 'CANCELLED'
  return (action === 'approve' && projection.state === 'APPROVED') || publishedStates.includes(projection.state ?? '')
}

export async function runCampaignAction(action: CampaignAction, dependencies: {
  authorize: () => Promise<void>
  readState: () => Promise<number>
  send: () => Promise<Hash>
  wait: (hash: Hash) => Promise<{ status: 'success' | 'reverted' | 'cancelled'; blockNumber: bigint }>
  loadPending: () => Hash | null
  savePending: (hash: Hash) => void
  clearPending: () => void
}) {
  await dependencies.authorize()
  let state = await dependencies.readState()
  const completed = () => action === 'cancel' ? state === 5 : (action === 'approve' && state === 1) || publishedChainStates.includes(state)
  let hash = dependencies.loadPending()
  let receiptBlock: bigint | undefined
  if (completed()) return { state, receiptBlock, hash }
  if (!hash) {
    if (action === 'cancel' ? ![0, 1, 2].includes(state) : state !== (action === 'approve' ? 0 : 1)) throw new Error('Campaign không ở trạng thái cho phép thao tác này.')
    hash = await dependencies.send()
    dependencies.savePending(hash)
  }
  const receipt = await dependencies.wait(hash)
  if (receipt.status !== 'success') {
    dependencies.clearPending()
    if (receipt.status === 'cancelled') throw new Error('Bạn đã hủy giao dịch trong ví. Đối chiếu trạng thái trước khi thử lại.')
    throw new Error('Giao dịch bị revert. Đối chiếu trạng thái trước khi thử lại.')
  }
  receiptBlock = receipt.blockNumber
  state = await dependencies.readState()
  if (!completed()) throw new Error('Receipt đã có nhưng trạng thái chưa khớp. Kiểm tra RPC và đối chiếu lại.')
  return { state, receiptBlock, hash }
}
