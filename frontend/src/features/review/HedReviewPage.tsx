import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEventLogs } from 'viem'
import type { Abi } from 'viem'
import deployment from '../../lib/web3/deployment-context'
import generatedAbi from '../../../../backend/src/blockchain/generated/hed/fund-together-disbursement.abi.json'
import { listHedPendingReviews, prepareHedRequestApproval, recordHedReview } from '../../lib/api/hed'
import type { HedReviewInput } from '../../lib/api/hed'
import { getErrorMessage } from '../../lib/api/error'

const abi = generatedAbi as Abi
const criteria = ['NEED-01', 'NEED-02', 'NEED-03', 'NEED-04', 'NEED-05'] as const
const blank = (): HedReviewInput => ({ evidenceVersion: 1, criterionId: 'NEED-01', outcome: 'MET', reasonCode: '', reason: '', manifestHash: '' as `0x${string}`, publicHash: '' as `0x${string}`, sourceReferences: [] })

export function HedReviewPage() {
  const cache = useQueryClient(), key = ['hed-review-queue']
  const queue = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedPendingReviews(signal), retry: false })
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [forms, setForms] = useState<Record<string, HedReviewInput>>({})
  const form = (id: string, sourceReferences: string[]) => forms[id] ?? { ...blank(), sourceReferences }
  const update = (id: string, sourceReferences: string[], value: Partial<HedReviewInput>) => setForms(current => ({ ...current, [id]: { ...form(id, sourceReferences), ...value } }))
  async function review(event: FormEvent, id: string, sourceReferences: string[]) { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await recordHedReview(id, form(id, sourceReferences)); await cache.invalidateQueries({ queryKey: key }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function approve(id: string) { if (busy || !account.address || !client || !wallet) return; setBusy(true); setError(''); try {
    if (account.chainId !== deployment.chainId) throw new Error(`Chuyển ví sang mạng HED ${deployment.chainId} trước khi reserve request.`)
    const prepared = await prepareHedRequestApproval(id)
    const call = await client.simulateContract({ account: account.address, address: deployment.contractAddress, abi, functionName: 'approveRequest', args: [BigInt(prepared.onchainCampaignId), BigInt(prepared.onchainRequestId), prepared.expectedRequestHash] })
    const hash = await wallet.writeContract(call.request), receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 })
    if (receipt.status !== 'success') throw new Error('Giao dịch reserve request bị revert.')
    const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'RequestReserved', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()) as { args: { campaignId: bigint; requestId: bigint; amount: bigint } } | undefined
    if (!event || event.args.campaignId !== BigInt(prepared.onchainCampaignId) || event.args.requestId !== BigInt(prepared.onchainRequestId)) throw new Error('Receipt không chứa RequestReserved đúng request.')
    await cache.invalidateQueries({ queryKey: key })
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  if (queue.isPending) return <p role="status">Đang tải queue HED…</p>
  if (queue.isError) return <section className="panel"><p role="alert">{getErrorMessage(queue.error)}</p><button className="button button--secondary" onClick={() => void queue.refetch()}>Thử lại</button></section>
  return <section className="panel"><h1>HED · xét yêu cầu thanh toán</h1><p>Ghi review không reserve tiền. Chỉ khi NEED-01…05 đều MET, RESOLVER mới ký reserve trên chain.</p>{error && <p className="toast toast--error" role="alert">{error}</p>}
    {queue.data.length === 0 ? <p>Không có request đã submit trên chain cần xét.</p> : queue.data.map(item => { const value = form(item.requestId, item.content.needEvidenceReferences); return <article key={item.requestId} className="panel"><h2>{item.content.purpose}</h2><p>Campaign #{item.onchainCampaignId} · request #{item.onchainRequestId} · {item.content.amount} base units</p><p className="advance-hash">{item.requestHash}</p><form className="advance-plan-form" onSubmit={event => void review(event, item.requestId, item.content.needEvidenceReferences)}><label>Tiêu chí NEED<select value={value.criterionId} onChange={event => update(item.requestId, item.content.needEvidenceReferences, { criterionId: event.target.value as HedReviewInput['criterionId'] })}>{criteria.map(criterion => <option key={criterion}>{criterion}</option>)}</select></label><label>Kết luận<select value={value.outcome} onChange={event => update(item.requestId, item.content.needEvidenceReferences, { outcome: event.target.value as HedReviewInput['outcome'] })}><option>MET</option><option>NOT_MET</option><option>NEEDS_INFO</option></select></label><label>Mã lý do<input required value={value.reasonCode} onChange={event => update(item.requestId, item.content.needEvidenceReferences, { reasonCode: event.target.value })} /></label><label>Lý do/đối chiếu<textarea required minLength={10} value={value.reason} onChange={event => update(item.requestId, item.content.needEvidenceReferences, { reason: event.target.value })} /></label><label>Manifest hash<input required pattern="0x[0-9a-f]{64}" value={value.manifestHash} onChange={event => update(item.requestId, item.content.needEvidenceReferences, { manifestHash: event.target.value as `0x${string}` })} /></label>{value.outcome === 'MET' && <label>Public bundle hash<input required pattern="0x[0-9a-f]{64}" value={value.publicHash} onChange={event => update(item.requestId, item.content.needEvidenceReferences, { publicHash: event.target.value as `0x${string}` })} /></label>}<p>Nguồn evidence: {item.content.needEvidenceReferences.join(', ') || 'chưa có'}</p><button className="button button--secondary" disabled={busy || !item.content.needEvidenceReferences.length} type="submit">Lưu review</button><button className="button button--primary" disabled={busy || !account.address} type="button" onClick={() => void approve(item.requestId)}>Ký reserve khi đủ NEED</button></form></article> })}
  </section>
}
