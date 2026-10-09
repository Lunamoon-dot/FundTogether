import { decodeEventLog, encodeFunctionData, publicActions } from 'viem'
import type { Abi, Address, Hex, TransactionReceipt, WalletClient } from 'viem'
import type { AdvanceActionInput, AdvanceActionPreparation, AdvanceSnapshot, AdvanceSubmissionPlan } from '../api/generated/advance'
import type { DeploymentContext } from './deployment-policy'
import { verifyWalletDeployment } from './wallet-identity.ts'

export interface AdvanceActionDisplay { snapshot: AdvanceSnapshot | null; plan?: AdvanceSubmissionPlan; packageHash?: string; refund?: { base: string; supplement: string } }
export function advanceClaimBlocked(s: AdvanceSnapshot) {
  const c = s.campaign, stage = s.stages[Number(c.currentStage)], now = BigInt(s.checkpoint.chainTimestamp)
  if (c.state !== 'ADVANCE_AVAILABLE') return 'Chưa có quyền nhận vốn. Cần eligibility đầu hoặc chốt nghiệm thu đợt trước.'
  if (now >= BigInt(c.claimEnd)) return 'Đã hết hạn nhận vốn; cần xử lý quá hạn.'
  if (!stage || stage.state !== 'PENDING' || stage.advanced !== '0') return 'Đợt này đã nhận vốn hoặc không còn chờ nhận.'
  if (BigInt(c.custody) < BigInt(stage.budget)) return 'Escrow không đủ ngân sách đợt.'
  if (c.currentStage !== '0') {
    const previous = s.stages[Number(c.currentStage) - 1]
    if (previous.state !== 'FINALIZED' || BigInt(previous.returned) < BigInt(previous.declaredUnused)) return 'Đợt trước chưa chốt hoặc chưa trả đủ tiền dư.'
    if (previous.submissions.some(v => v.challengeCase.caseUsed && v.challengeCase.resolution === 'PENDING')) return 'Đợt trước còn case chưa xử lý.'
  }
  return undefined
}
const same = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'bigint' || typeof a === 'number') a = a.toString()
  if (typeof b === 'bigint' || typeof b === 'number') b = b.toString()
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase()
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>
    return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => same(x[k], y[k]))
  }
  return a === b
}
export function assertAdvanceContext(context: AdvanceActionInput['context'], deployment: DeploymentContext) {
  for (const key of ['protocolKind', 'chainId', 'deploymentId', 'contractAddress', 'tokenAddress', 'resolver', 'workflowPolicy', 'abiVersion', 'confirmations'] as const) {
    if (!same(context[key], deployment[key])) throw new Error(`Deployment B khác cấu hình ứng dụng: ${key}.`)
  }
  if (context.protocolKind !== 'ADVANCE' || context.chainId !== 31338 || !context.deploymentId || !context.workflowPolicy)
    throw new Error('Thiếu context B đầy đủ.')
}
const validHash = (value: unknown): string => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value) || /^0x0+$/.test(value)) throw new Error('Commitment không hợp lệ.')
  return value
}

export function advanceCall(input: AdvanceActionInput, prepared: AdvanceActionPreparation, display: AdvanceActionDisplay, deployment: DeploymentContext) {
  assertAdvanceContext(input.context, deployment); assertAdvanceContext(prepared.context, deployment)
  if (!same(prepared.actorWallet, input.actorWallet) || !same(prepared.contractAddress, deployment.contractAddress) || prepared.blockedReason)
    throw new Error(prepared.blockedReason ?? 'Ví hoặc contract trong intent không khớp.')
  const s = display.snapshot, c = s?.campaign, id = s?.campaignId, p = display.plan
  if (input.action === 'SUBMIT_CAMPAIGN') {
    if (s || !p || input.expectedState !== 'UNSUBMITTED' || input.expectedCurrentStage !== '0'
      || !same(p.organizer, input.actorWallet) || p.planHash !== input.expectedPlanHash) throw new Error('Kế hoạch nộp không khớp màn hình.')
    assertAdvanceContext(p.context, deployment)
  } else if (!s || c!.planHash !== input.expectedPlanHash || c!.state !== input.expectedState || c!.currentStage !== input.expectedCurrentStage) {
    throw new Error('Trạng thái, đợt hoặc kế hoạch đã đổi. Tải lại trước khi ký.')
  }
  const ref = input.evidenceRef ?? input.review?.evidenceRef
  if (ref) {
    const stage = s?.stages[Number(c?.currentStage)], version = stage?.submissions.find(v => v.version === ref.version)
    if (ref.campaignId !== id || ref.stage !== c?.currentStage || ref.version !== stage?.latestVersion || ref.evidenceHash !== version?.evidenceHash)
      throw new Error('Hồ sơ đã đổi version hoặc không thuộc đợt đang xét.')
  }
  const report = () => validHash(prepared.recordHash)
  let functionName: string, args: unknown[]
  switch (input.action) {
    case 'SUBMIT_CAMPAIGN': functionName = 'submitCampaignForDraft'; args = [p!.draftKey, p!.planHash, p!.fundingDuration, p!.budgets, p!.criteriaHashes]; break
    case 'APPROVE_CAMPAIGN': case 'CONFIRM_FIRST_ADVANCE':
      functionName = input.action === 'APPROVE_CAMPAIGN' ? 'approveCampaign' : 'confirmFirstAdvance'
      args = [id, input.expectedPlanHash, validHash(prepared.args[2]), report()]; break
    case 'PUBLISH_CAMPAIGN': case 'CANCEL_CAMPAIGN':
      functionName = input.action === 'PUBLISH_CAMPAIGN' ? 'publishCampaign' : 'cancelCampaign'; args = [id, input.expectedPlanHash]; break
    case 'DONATE': functionName = 'donate'; args = [id, input.amount]; break
    case 'CLAIM_ADVANCE':
      if (input.stage !== c!.currentStage) throw new Error('Chỉ nhận vốn của đợt hiện tại.')
      { const blocked = advanceClaimBlocked(s!); if (blocked) throw new Error(blocked) }
      functionName = 'claimAdvance'; args = [id, input.stage, input.expectedPlanHash]; break
    case 'STOP_CAMPAIGN': functionName = 'stopCampaign'; args = [id, input.expectedPlanHash, report()]; break
    case 'SUBMIT_EVIDENCE':
      if (input.stage !== c!.currentStage || !input.packageId) throw new Error('Thiếu package đúng đợt.')
      functionName = 'submitEvidence'; args = [id, input.stage, (BigInt(s!.stages[Number(input.stage)].latestVersion) + 1n).toString(), validHash(display.packageHash)]; break
    case 'APPROVE_EVIDENCE': functionName = 'approveEvidence'; args = [ref, validHash(input.review?.publicHash), report(), input.review?.decision?.campaignSpent]; break
    case 'REQUEST_SUPPLEMENT':
      if (!['NEEDS_INFORMATION', 'INCONCLUSIVE'].includes(input.review?.decision?.outcome ?? '')) throw new Error('Kết luận bổ sung không hợp lệ.')
      functionName = 'requestSupplement'; args = [ref, input.review!.decision!.outcome === 'NEEDS_INFORMATION' ? 1 : 3, report()]; break
    case 'REJECT_EVIDENCE': functionName = 'rejectEvidence'; args = [ref, report()]; break
    case 'FINALIZE_STAGE': functionName = 'finalizeStage'; args = [ref]; break
    case 'RETURN_FUNDS': functionName = 'returnFunds'; args = [id, input.stage, input.amount]; break
    case 'OPEN_CASE': functionName = 'openCase'; args = [ref, report()]; break
    case 'ADD_CASE_MATERIAL': functionName = 'addCaseMaterial'; args = [ref, report()]; break
    case 'SUBMIT_CASE_RESPONSE': functionName = 'submitCaseResponse'; args = [ref, report()]; break
    case 'RESOLVE_CASE':
      if (!input.review?.resolution) throw new Error('Thiếu kết luận case.')
      functionName = 'resolveCase'; args = [ref, ['PENDING', 'CONTINUE', 'RESUBMIT', 'STOP'].indexOf(input.review.resolution), report()]; break
    case 'FINALIZE_TIMEOUT': functionName = 'finalizeTimeout'; args = [id]; break
    case 'CLAIM_REFUND': functionName = 'claimRefund'; args = [id]; break
    default: throw new Error('Thao tác B không được hỗ trợ.')
  }
  if (prepared.functionName !== functionName || !same(prepared.args, args)) throw new Error('Hàm hoặc tham số từ API khác thao tác đang hiển thị.')
  if (prepared.approval && (!['DONATE', 'RETURN_FUNDS'].includes(input.action)
    || !same(prepared.approval.tokenAddress, deployment.tokenAddress) || !same(prepared.approval.spender, deployment.contractAddress)
    || prepared.approval.amount !== input.amount || BigInt(prepared.approval.allowance) >= BigInt(input.amount!)))
    throw new Error('Yêu cầu allowance khác token, người chi hoặc số tiền đã chọn.')
  return { functionName, args }
}

export async function verifyAdvanceWallet(wallet: WalletClient, deployment: DeploymentContext) {
  await verifyWalletDeployment(wallet, deployment)
  const reader = wallet.extend(publicActions)
  const abi = [{ type: 'function', name: 'deploymentId', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
    { type: 'function', name: 'WORKFLOW_POLICY', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] }] as const
  const [id, policy] = await Promise.all((['deploymentId', 'WORKFLOW_POLICY'] as const).map(functionName =>
    reader.readContract({ address: deployment.contractAddress, abi, functionName })))
  if (!same(id, deployment.deploymentId) || !same(policy, deployment.workflowPolicy)) throw new Error('Ví đang đọc deployment/policy B khác ứng dụng.')
}

export function advanceTrackingKey(userId: string, input: AdvanceActionInput, metadataId: string, deployment: DeploymentContext) {
  return ['ft-advance', input.context.deploymentId, deployment.genesisHash, deployment.deploymentBlockHash, input.context.contractAddress.toLowerCase(),
    input.context.chainId, userId, input.actorWallet.toLowerCase(), metadataId, input.stage ?? input.expectedCurrentStage,
    input.action, input.evidenceRef?.version ?? input.review?.evidenceRef?.version ?? input.packageId ?? '0'].join(':')
}

export function verifyAdvanceReceipt(receipt: TransactionReceipt, transaction: { to: Address | null; from: Address; input: Hex; value: bigint },
  input: AdvanceActionInput, prepared: AdvanceActionPreparation, display: AdvanceActionDisplay, deployment: DeploymentContext, abi: Abi) {
  const call = advanceCall(input, prepared, display, deployment)
  return verifyTrackedAdvanceReceipt(receipt, transaction, { to: deployment.contractAddress, from: input.actorWallet as Address,
    data: encodeFunctionData({ abi, ...call }), event: advanceExpectedEvent(input, prepared, display) }, abi)
}

export function advanceExpectedEvent(input: AdvanceActionInput, prepared: AdvanceActionPreparation, display: AdvanceActionDisplay) {
  const call = prepared
  const c = display.snapshot?.campaign, current = display.snapshot?.stages[Number(c?.currentStage ?? '0')]
  const ref = input.evidenceRef ?? input.review?.evidenceRef
  const expected: Record<string, unknown> = { campaignId: display.snapshot?.campaignId }
  let event: string
  switch (input.action) {
    case 'SUBMIT_CAMPAIGN': event = 'CampaignSubmitted'; delete expected.campaignId
      Object.assign(expected, { organizer: input.actorWallet, draftKey: display.plan!.draftKey, planHash: input.expectedPlanHash,
        fundingDuration: display.plan!.fundingDuration, goal: display.plan!.budgets.reduce((n, v) => n + BigInt(v), 0n).toString() }); break
    case 'APPROVE_CAMPAIGN': event = 'CampaignApproved'; Object.assign(expected, { resolver: input.actorWallet, planHash: input.expectedPlanHash, verificationHash: call.args[2], reasonHash: prepared.recordHash }); break
    case 'CONFIRM_FIRST_ADVANCE': event = 'AdvanceAvailable'; Object.assign(expected, { stage: '0', verificationHash: call.args[2], reasonHash: prepared.recordHash }); break
    case 'PUBLISH_CAMPAIGN': event = 'CampaignPublished'; break
    case 'CANCEL_CAMPAIGN': case 'STOP_CAMPAIGN': case 'FINALIZE_TIMEOUT': event = 'CampaignStopped'
      if (input.action === 'STOP_CAMPAIGN') expected.reasonHash = prepared.recordHash
      break
    case 'DONATE': event = 'DonationReceived'; Object.assign(expected, { donor: input.actorWallet, amount: input.amount }); break
    case 'CLAIM_ADVANCE': event = 'AdvanceClaimed'; Object.assign(expected, { stage: input.stage, organizer: c!.organizer, budget: current!.budget }); break
    case 'SUBMIT_EVIDENCE': event = 'EvidenceSubmitted'; Object.assign(expected, { stage: input.stage, version: call.args[2], evidenceHash: display.packageHash }); break
    case 'APPROVE_EVIDENCE': case 'REQUEST_SUPPLEMENT': case 'REJECT_EVIDENCE':
      event = 'EvidenceReviewed'; Object.assign(expected, ref, { reportHash: prepared.recordHash,
        outcome: input.action === 'APPROVE_EVIDENCE' ? 0 : input.action === 'REJECT_EVIDENCE' ? 2 : call.args[1] })
      if (input.action === 'APPROVE_EVIDENCE') Object.assign(expected, { publicHash: input.review!.publicHash, campaignSpent: input.review!.decision!.campaignSpent })
      break
    case 'FINALIZE_STAGE': event = 'StageFinalized'; Object.assign(expected, ref); break
    case 'RETURN_FUNDS': event = 'FundsReturned'; Object.assign(expected, { stage: input.stage, organizer: input.actorWallet, amount: input.amount }); break
    case 'OPEN_CASE': event = 'CaseOpened'; Object.assign(expected, ref, { opener: input.actorWallet, reasonHash: prepared.recordHash }); break
    case 'ADD_CASE_MATERIAL': event = 'CaseMaterialAdded'; Object.assign(expected, { stage: ref!.stage, version: ref!.version, actor: input.actorWallet, materialHash: prepared.recordHash }); break
    case 'SUBMIT_CASE_RESPONSE': event = 'CaseResponseSubmitted'; Object.assign(expected, { stage: ref!.stage, version: ref!.version, actor: input.actorWallet, responseHash: prepared.recordHash }); break
    case 'RESOLVE_CASE': event = 'CaseResolved'; Object.assign(expected, { stage: ref!.stage, version: ref!.version, actor: input.actorWallet, resolution: call.args[1], reasonHash: prepared.recordHash }); break
    case 'CLAIM_REFUND':
      if (!display.refund) throw new Error('Thiếu quyền refund đang hiển thị để đối chiếu receipt.')
      event = 'RefundClaimed'; Object.assign(expected, { donor: input.actorWallet, baseConsumed: true,
        baseAmount: display.refund.base, supplementAmount: display.refund.supplement }); break
  }
  return { name: event, args: expected }
}

export interface AdvanceTrackedCall { to: Address; from: Address; data: Hex; event: { name: string; args: Record<string, unknown> } }
export function verifyTrackedAdvanceReceipt(receipt: TransactionReceipt, transaction: { to: Address | null; from: Address; input: Hex; value: bigint }, call: AdvanceTrackedCall, abi: Abi) {
  if (receipt.status !== 'success') throw new Error('Giao dịch revert; quyền và số dư phải đối chiếu lại trước khi thử tiếp.')
  if (!same(transaction.to, call.to) || !same(transaction.from, call.from) || transaction.value !== 0n || transaction.input !== call.data)
    throw new Error('Giao dịch thay thế/hủy không còn đúng thao tác đã chọn.')
  const matches = receipt.logs.filter(log => same(log.address, call.to)).flatMap(log => {
    try { return [decodeEventLog({ abi, ...log, strict: true })] } catch { return [] }
  }).filter(log => log.eventName === call.event.name && Object.entries(call.event.args).every(([k, v]) => same((log.args as unknown as Record<string, unknown>)[k], v)))
  if (matches.length !== 1) throw new Error('Receipt thiếu event B đúng campaign/đợt/version/số tiền. Chưa xác nhận thao tác.')
  return String((matches[0].args as unknown as Record<string, unknown>).campaignId ?? '')
}

export function isAdvanceIndexed(receipt: Pick<TransactionReceipt, 'blockNumber' | 'blockHash'>, canonicalReceiptHash: string | null,
  indexer: { status: string; lastIndexedBlock?: string | null; lastIndexedBlockHash?: string | null }, canonicalIndexedHash: string | null) {
  return indexer.status === 'ready' && indexer.lastIndexedBlock != null && BigInt(indexer.lastIndexedBlock) >= receipt.blockNumber
    && same(receipt.blockHash, canonicalReceiptHash) && Boolean(canonicalIndexedHash) && same(indexer.lastIndexedBlockHash, canonicalIndexedHash)
}
