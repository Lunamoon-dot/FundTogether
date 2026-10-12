import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEventLogs } from 'viem'
import type { Abi } from 'viem'
import deployment from '../../../lib/web3/deployment-context'
import generatedAbi from '../../../../../backend/src/blockchain/generated/hed/fund-together-disbursement.abi.json'
import { createHedActivity, createHedCampaignDraft, createHedDeliveryPackage, createHedOutcomePackage, createHedRequestDraft, freezeHedActivity, freezeHedCampaignDraft, freezeHedRequestDraft, listHedActivities, listHedCampaignDrafts, listHedRequestDrafts, registerHedOnchainActivity, registerHedOnchainCampaign, registerHedOnchainRequest, uploadHedEvidence, uploadHedRequestEvidence } from '../../../lib/api/hed'
import type { HedActivityInput, HedCampaignDraft, HedCampaignDraftInput, HedRequestDraftInput } from '../../../lib/api/hed'
import { getErrorMessage } from '../../../lib/api/error'
import { listOrganizations } from '../../../lib/api/organizations'
import './hed.css'

const initial = (): HedCampaignDraftInput => ({ title: '', description: '', purpose: '', beneficiaryScope: '', allowedExpenseCategories: ['GOODS'],
  outcomeCriteria: [''], goal: '', fundingDuration: 86_400, policyHash: deployment.policyHash! })
const abi = generatedAbi as Abi

export function HedOrganizationCampaigns({ organizationId, userId, section }: { organizationId: string; userId: string; section: string }) {
  const base = `/organizations/${organizationId}/workspace/campaigns`, creating = section === '/campaigns/new'
  const cache = useQueryClient(), key = ['hed-campaign-drafts', deployment.policyHash, userId, organizationId]
  const organizations = useQuery({ queryKey: ['organizations', userId], queryFn: listOrganizations, retry: false })
  const verified = organizations.data?.find(value => value.id === organizationId)?.verificationStatus === 'verified'
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedCampaignDrafts(organizationId, signal), enabled: !creating, retry: false })
  if (creating && !verified) return <section className="panel"><h1>Cần xác minh tổ chức</h1><p>ADMIN phải xác minh tổ chức trước khi tạo hoặc publish campaign HED.</p><a className="button button--primary" href={`#/organizations/${organizationId}`}>Đến hồ sơ tổ chức</a></section>
  if (creating) return <HedCampaignWizard organizationId={organizationId} onSaved={() => { void cache.invalidateQueries({ queryKey: key }); window.location.hash = base }} onClose={() => { window.location.hash = base }} />
  return <>
    <div className="feed-heading"><h1>Campaign · giải ngân theo yêu cầu</h1>{verified ? <a className="button button--primary" href={`#${base}/new`}>Tạo campaign HED</a> : <a className="button button--secondary" href={`#/organizations/${organizationId}`}>Xác minh tổ chức trước</a>}</div>
    <p>Đủ goal trước khi giải ngân · Tổ chức nhận trực tiếp · 4 giai đoạn xác thực · chain {deployment.chainId}. Chốt hồ sơ chưa gửi transaction.</p>
    {!organizations.isPending && !verified && <p className="toast toast--error">Tổ chức chưa được ADMIN xác minh nên chưa thể tạo hoặc publish campaign HED.</p>}
    {list.isPending ? <p role="status">Đang tải campaign…</p> : list.isError ? <section className="panel"><p role="alert">{getErrorMessage(list.error)}</p><button className="button button--secondary" onClick={() => void list.refetch()}>Thử lại</button></section>
      : list.data.length === 0 ? <section className="panel"><h2>Chưa có campaign HED</h2><p>Tạo hồ sơ purpose, scope và outcome trước khi chốt commitment.</p></section>
        : <ul className="organization-list">{list.data.map(draft => <HedCampaignEntry key={draft.id} value={draft} onFrozen={() => void list.refetch()} />)}</ul>}
  </>
}

function HedCampaignEntry({ value, onFrozen }: { value: HedCampaignDraft; onFrozen: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const state = useQuery({ queryKey: ['hed-campaign-state', value.onchainCampaignId], enabled: Boolean(client && value.onchainCampaignId),
    queryFn: () => client!.readContract({ address: deployment.contractAddress, abi, functionName: 'campaign', args: [BigInt(value.onchainCampaignId!)] }).then(v => Number((v as { state: number }).state)), refetchInterval: 10_000 })
  async function freeze() { if (busy || value.frozenAt) return; setBusy(true); setError(''); try { await freezeHedCampaignDraft(value.id); onFrozen() } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function publish() { if (busy || !value.commitmentHash || !account.address || !client || !wallet) return; setBusy(true); setError(''); try {
    if (account.chainId !== deployment.chainId) throw new Error(`Chuyển ví sang mạng HED ${deployment.chainId} trước khi publish.`)
    const request = await client.simulateContract({ account: account.address, address: deployment.contractAddress, abi, functionName: 'createCampaign', args: [value.commitmentHash, BigInt(value.goal), BigInt(value.fundingDuration)] })
    const hash = await wallet.writeContract(request.request)
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 })
    if (receipt.status !== 'success') throw new Error('Giao dịch tạo campaign bị revert.')
    const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'CampaignCreated', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()) as { args: { campaignId: bigint; commitmentHash: string; organizer: string } } | undefined
    if (!event || event.args.commitmentHash?.toLowerCase() !== value.commitmentHash.toLowerCase() || event.args.organizer?.toLowerCase() !== account.address.toLowerCase()) throw new Error('Receipt không chứa CampaignCreated đúng commitment và ví đang ký.')
    await registerHedOnchainCampaign(value.id, String(event.args.campaignId)); onFrozen()
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <li className="panel"><div className="organization-card-heading"><h2>{value.title}</h2><span className="organization-role">{value.frozenAt ? 'Đã chốt' : 'Bản nháp'}</span></div>
    <p className="organization-description">{value.description}</p><p>Mục tiêu: {value.goal} base units MockUSDC · {value.fundingDuration / 86_400} ngày gây quỹ</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    {value.frozenAt ? <><p className="hed-hash">Commitment: {value.commitmentHash}</p>{value.onchainCampaignId ? <><p>Campaign HED on-chain: {value.onchainCampaignId}</p><a className="button button--secondary" href={`#/hed/campaigns/${value.onchainCampaignId}`}>Mở trang công khai HED</a>{state.data === 1 ? <><HedActivityWorkspace campaignId={value.id} onchainCampaignId={value.onchainCampaignId} /><HedRequestWorkspace campaignId={value.id} onchainCampaignId={value.onchainCampaignId} /></> : <p className="muted">Request chỉ mở sau khi resolver kích hoạt campaign trên chain.</p>}</> : <button className="button button--primary" disabled={busy || !account.address} onClick={() => void publish()}>{busy ? 'Đang xử lý…' : 'Tạo campaign trên HED chain'}</button>}</> : <button className="button button--primary" disabled={busy} onClick={() => void freeze()}>{busy ? 'Đang chốt…' : 'Chốt commitment'}</button>}
  </li>
}

function HedActivityWorkspace({ campaignId, onchainCampaignId }: { campaignId: string; onchainCampaignId: string }) {
  const cache = useQueryClient(), key = ['hed-activities', campaignId]
  const activities = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedActivities(campaignId, signal), retry: false })
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [form, setForm] = useState<HedActivityInput>({ title: '', beneficiaryScope: '', targetQuantity: 1, outcomeCriteria: [''], ceiling: '', deliveryDeadline: '', outcomeDeadline: '' })
  async function create(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await createHedActivity(campaignId, form); await cache.invalidateQueries({ queryKey: key }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function freeze(id: string) { if (busy) return; setBusy(true); setError(''); try { await freezeHedActivity(campaignId, id); await cache.invalidateQueries({ queryKey: key }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function publish(activity: { id: string; commitmentHash: string | null; ceiling: string }) { if (busy || !activity.commitmentHash || !account.address || !client || !wallet) return; setBusy(true); setError(''); try {
    if (account.chainId !== deployment.chainId) throw new Error(`Chuyển ví sang mạng HED ${deployment.chainId} trước khi publish.`)
    const request = await client.simulateContract({ account: account.address, address: deployment.contractAddress, abi, functionName: 'createActivity', args: [BigInt(onchainCampaignId), activity.commitmentHash, BigInt(activity.ceiling)] })
    const hash = await wallet.writeContract(request.request), receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 })
    if (receipt.status !== 'success') throw new Error('Giao dịch tạo activity bị revert.')
    const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'ActivityCreated', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()) as { args: { campaignId: bigint; activityId: bigint; commitmentHash: string; ceiling: bigint } } | undefined
    if (!event || event.args.campaignId !== BigInt(onchainCampaignId) || event.args.commitmentHash.toLowerCase() !== activity.commitmentHash.toLowerCase() || event.args.ceiling !== BigInt(activity.ceiling)) throw new Error('Receipt không chứa ActivityCreated đúng campaign, commitment và ceiling.')
    await registerHedOnchainActivity(campaignId, activity.id, String(event.args.activityId)); await cache.invalidateQueries({ queryKey: key })
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <section className="panel"><h3>Activity outcome</h3><p>Activity khóa scope, target, deadline và trần chi; đây không phải milestone giải ngân.</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    {activities.data?.map(activity => <div key={activity.id}><p>{activity.title} · ceiling {activity.ceiling} · {activity.onchainActivityId === null ? activity.frozenAt ? 'Đã chốt, chưa publish' : 'Bản nháp' : `chain #${activity.onchainActivityId}`}</p>{!activity.frozenAt ? <button className="button button--secondary" disabled={busy} onClick={() => void freeze(activity.id)}>Chốt activity</button> : activity.onchainActivityId === null ? <button className="button button--secondary" disabled={busy || !account.address} onClick={() => void publish(activity)}>Tạo activity trên chain</button> : <HedOutcomeEvidence campaignId={campaignId} activityId={activity.id} targetQuantity={activity.targetQuantity} />}</div>)}
    <form className="hed-plan-form" onSubmit={create}><label>Tên activity<input required value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} /></label><label>Nhóm thụ hưởng<textarea required value={form.beneficiaryScope} onChange={e => setForm(v => ({ ...v, beneficiaryScope: e.target.value }))} /></label><label>Số lượng mục tiêu<input required type="number" min={1} value={form.targetQuantity} onChange={e => setForm(v => ({ ...v, targetQuantity: Number(e.target.value) }))} /></label><label>Ceiling (base units MockUSDC)<input required inputMode="numeric" value={form.ceiling} onChange={e => setForm(v => ({ ...v, ceiling: e.target.value }))} /></label><label>Tiêu chí outcome<textarea required value={form.outcomeCriteria[0]} onChange={e => setForm(v => ({ ...v, outcomeCriteria: [e.target.value] }))} /></label><label>Hạn giao<input required type="datetime-local" onChange={e => setForm(v => ({ ...v, deliveryDeadline: new Date(e.target.value).toISOString() }))} /></label><label>Hạn outcome<input required type="datetime-local" onChange={e => setForm(v => ({ ...v, outcomeDeadline: new Date(e.target.value).toISOString() }))} /></label><button className="button button--secondary" disabled={busy} type="submit">Tạo activity</button></form>
  </section>
}

function HedOutcomeEvidence({ campaignId, activityId, targetQuantity }: { campaignId: string; activityId: string; targetQuantity: number }) {
  const [file, setFile] = useState<File | null>(null), [publicFile, setPublicFile] = useState<File | null>(null), [quantity, setQuantity] = useState(String(targetQuantity)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); if (busy || !file || !publicFile) return; setBusy(true); setError(''); setSaved(''); try { const document = await uploadHedEvidence(campaignId, { kind: 'OUTCOME', activityId, visibility: 'PRIVATE', file }); const publicDocument = await uploadHedEvidence(campaignId, { kind: 'OUTCOME', activityId, visibility: 'PUBLIC', file: publicFile }); const outcome = await createHedOutcomePackage(campaignId, { kind: 'OUTCOME', activityId, evidenceVersion: 1, publicDocumentId: publicDocument.id, deliveredQuantity: Number(quantity), documentIds: [document.id] }); setSaved(`Đã khóa outcome package ${outcome.id}; chờ RESOLVER xét OUT-01…04.`); setFile(null); setPublicFile(null) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <form className="hed-plan-form" onSubmit={submit}><p>Outcome package không xác nhận delivery/payment; bản public phải được che PII và server tự khóa hash của file đó.</p>{error && <p className="toast toast--error" role="alert">{error}</p>}{saved && <p className="toast toast--success" role="status">{saved}</p>}<label>Bằng chứng outcome private<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><label>Bản outcome public đã che PII<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setPublicFile(event.target.files?.[0] ?? null)} /></label><label>Số lượng đã trao<input required type="number" min={0} value={quantity} onChange={event => setQuantity(event.target.value)} /></label><button className="button button--secondary" disabled={busy || !file || !publicFile} type="submit">{busy ? 'Đang khóa outcome…' : 'Nộp outcome package'}</button></form>
}

function HedRequestWorkspace({ campaignId, onchainCampaignId }: { campaignId: string; onchainCampaignId: string }) {
  const cache = useQueryClient(), key = ['hed-requests', campaignId], activityKey = ['hed-activities', campaignId]
  const requests = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedRequestDrafts(campaignId, signal), retry: false })
  const activities = useQuery({ queryKey: activityKey, queryFn: ({ signal }) => listHedActivities(campaignId, signal), retry: false })
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<HedRequestDraftInput>({ activityId: '', purpose: '', itemLines: [{ description: '', quantity: 1, unitAmount: '' }], amount: '', deposit: '0', expectedDeliveryAt: '', acceptanceCriteria: [''], terms: '', needEvidenceReferences: [] })
  async function create(event: FormEvent) { event.preventDefault(); if (busy || !file) return; setBusy(true); setError(''); try {
    const draft = await createHedRequestDraft(campaignId, form); await uploadHedRequestEvidence(campaignId, draft.id, 'QUOTE', file); await cache.invalidateQueries({ queryKey: key }); setFile(null)
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function freeze(id: string) { if (busy) return; setBusy(true); setError(''); try { await freezeHedRequestDraft(campaignId, id); await cache.invalidateQueries({ queryKey: key }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function publish(request: HedRequestDraftInput & { id: string; requestHash: string | null; onchainRequestId: string | null }) { if (busy || !request.requestHash || !account.address || !client || !wallet) return; setBusy(true); setError(''); try {
    const activity = activities.data?.find(value => value.id === request.activityId)
    if (!activity?.onchainActivityId) throw new Error('Activity không còn hợp lệ.')
    if (account.chainId !== deployment.chainId) throw new Error(`Chuyển ví sang mạng HED ${deployment.chainId} trước khi gửi request.`)
    const call = await client.simulateContract({ account: account.address, address: deployment.contractAddress, abi, functionName: 'submitRequest', args: [BigInt(onchainCampaignId), BigInt(activity.onchainActivityId), request.requestHash, account.address as `0x${string}`, BigInt(request.amount)] })
    const hash = await wallet.writeContract(call.request), receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 })
    if (receipt.status !== 'success') throw new Error('Giao dịch gửi request bị revert.')
    const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'RequestSubmitted', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()) as { args: { campaignId: bigint; requestId: bigint; requestHash: string; recipient: string; amount: bigint } } | undefined
    if (!event || event.args.requestHash.toLowerCase() !== request.requestHash.toLowerCase() || event.args.amount !== BigInt(request.amount)) throw new Error('Receipt không chứa RequestSubmitted đúng hash và amount.')
    await registerHedOnchainRequest(campaignId, request.id, String(event.args.requestId)); await cache.invalidateQueries({ queryKey: key })
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <section className="panel"><h3>Yêu cầu giải ngân</h3><p>Đề xuất dự toán đợt chi. Tiền giải ngân được chuyển trực tiếp vào ví tổ chức khi Resolver phê duyệt; tổ chức sau đó nộp chứng từ/hóa đơn thực chi.</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    {requests.data?.map(request => <HedRequestEntry key={request.id} request={request} campaignMetadataId={campaignId} campaignId={onchainCampaignId} onFreeze={() => void freeze(request.id)} onPublish={() => void publish(request)} busy={busy} walletReady={Boolean(account.address)} />)}
    {!activities.data?.some(activity => activity.onchainActivityId !== null) ? <p role="status">Tạo, chốt và publish activity trước khi lập request.</p> : <form className="hed-plan-form" onSubmit={create}>
      <label>Activity đã khóa<select required value={form.activityId} onChange={e => setForm(v => ({ ...v, activityId: e.target.value }))}><option value="">Chọn activity đã publish</option>{activities.data.filter(activity => activity.onchainActivityId !== null).map(activity => <option key={activity.id} value={activity.id}>{activity.title} · chain #{activity.onchainActivityId}</option>)}</select></label><label>Mục đích chi<textarea required value={form.purpose} onChange={e => setForm(v => ({ ...v, purpose: e.target.value }))} /></label>
      <label>Hạng mục chi (Line item)<input required value={form.itemLines[0].description} onChange={e => setForm(v => ({ ...v, itemLines: [{ ...v.itemLines[0], description: e.target.value }] }))} /></label><label>Số tiền đề nghị giải ngân (base units MockUSDC)<input required inputMode="numeric" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value, itemLines: [{ ...v.itemLines[0], unitAmount: e.target.value }] }))} /></label>
      <label>Dự kiến hoàn thành chi tiêu<input required type="datetime-local" onChange={e => setForm(v => ({ ...v, expectedDeliveryAt: new Date(e.target.value).toISOString() }))} /></label><label>Tiêu chí nghiệm thu/chứng từ dự kiến<textarea required value={form.acceptanceCriteria[0]} onChange={e => setForm(v => ({ ...v, acceptanceCriteria: [e.target.value] }))} /></label><label>Ghi chú/Điều khoản<textarea required value={form.terms} onChange={e => setForm(v => ({ ...v, terms: e.target.value }))} /></label><label>Báo giá hoặc hồ sơ dự toán private<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      <button className="button button--primary" disabled={busy || !file} type="submit">{busy ? 'Đang lưu…' : 'Tạo request và upload dự toán'}</button></form>}
  </section>
}

function HedRequestEntry({ request, campaignMetadataId, campaignId, onFreeze, onPublish, busy, walletReady }: { request: HedRequestDraftInput & { id: string; version: number; requestHash: string | null; frozenAt: string | null; onchainRequestId: string | null }; campaignMetadataId: string; campaignId: string; onFreeze: () => void; onPublish: () => void; busy: boolean; walletReady: boolean }) {
  const client = usePublicClient({ chainId: deployment.chainId })
  const state = useQuery({ queryKey: ['hed-request-state', campaignId, request.onchainRequestId], enabled: Boolean(client && request.onchainRequestId), queryFn: () => client!.readContract({ address: deployment.contractAddress, abi, functionName: 'request', args: [BigInt(campaignId), BigInt(request.onchainRequestId!)] }).then(value => value as { state: number; grossPaid: bigint }), refetchInterval: 10_000 })
  const s = state.data?.state
  const stateLabel = s === 1 ? 'Chờ Resolver duyệt giải ngân' : s === 2 ? 'Đã giải ngân · Chờ nộp hóa đơn/chứng từ chi tiêu' : s === 3 ? 'Đang mở challenge chi tiêu (3 ngày)' : s === 4 ? 'Đã quyết toán tài chính hoàn tất' : s === 5 ? 'Đã hủy' : ''
  return <div><p>{request.purpose} · {request.amount} base units · {request.onchainRequestId !== null ? `chain #${request.onchainRequestId} ${stateLabel ? `(${stateLabel})` : ''}` : request.frozenAt ? `Đã chốt ${request.requestHash}` : 'Chưa chốt'}</p>{!request.frozenAt ? <button className="button button--secondary" disabled={busy} onClick={onFreeze}>Chốt request đã có dự toán</button> : request.onchainRequestId === null ? <button className="button button--secondary" disabled={busy || !walletReady} onClick={onPublish}>Gửi request lên chain</button> : <>{s === 2 && <HedDeliveryEvidence campaignId={campaignMetadataId} request={request} />}</>}</div>
}

function HedDeliveryEvidence({ campaignId, request }: { campaignId: string; request: HedRequestDraftInput & { id: string; version: number } }) {
  const [file, setFile] = useState<File | null>(null), [publicFile, setPublicFile] = useState<File | null>(null), [acceptedValue, setAcceptedValue] = useState(request.amount), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); if (busy || !file || !publicFile) return; setBusy(true); setError(''); setSaved(''); try {
    const document = await uploadHedEvidence(campaignId, { kind: 'DELIVERY', activityId: request.activityId, requestDraftId: request.id, visibility: 'PRIVATE', file })
    const publicDocument = await uploadHedEvidence(campaignId, { kind: 'DELIVERY', activityId: request.activityId, requestDraftId: request.id, visibility: 'PUBLIC', file: publicFile })
    const packageResult = await createHedDeliveryPackage(campaignId, { kind: 'DELIVERY', requestDraftId: request.id, activityId: request.activityId, evidenceVersion: request.version, publicDocumentId: publicDocument.id, acceptedValue, documentIds: [document.id] })
    setSaved(`Đã khóa chứng từ chi tiêu package ${packageResult.id}; chờ RESOLVER xét duyệt hóa đơn DEL-01…04.`); setFile(null); setPublicFile(null)
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <form className="hed-plan-form" onSubmit={submit}><p>Nộp chứng từ hóa đơn chi tiêu: hóa đơn VAT / biên nhận thực tế (bản gốc private; bản public che PII được hash và công khai khi mở challenge).</p>{error && <p className="toast toast--error" role="alert">{error}</p>}{saved && <p className="toast toast--success" role="status">{saved}</p>}<label>Chứng từ / hóa đơn VAT private<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><label>Bản hóa đơn / bảng kê public đã che PII<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setPublicFile(event.target.files?.[0] ?? null)} /></label><label>Số tiền thực chi đề nghị quyết toán<input required inputMode="numeric" pattern="[0-9]+" value={acceptedValue} onChange={event => setAcceptedValue(event.target.value)} /></label><button className="button button--secondary" disabled={busy || !file || !publicFile} type="submit">{busy ? 'Đang khóa chứng từ…' : 'Nộp chứng từ chi tiêu'}</button></form>
}

function HedCampaignWizard({ organizationId, onSaved, onClose }: { organizationId: string; onSaved: () => void; onClose: () => void }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const set = <K extends keyof HedCampaignDraftInput>(key: K, next: HedCampaignDraftInput[K]) => setValue(current => ({ ...current, [key]: next }))
  async function submit(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await createHedCampaignDraft(organizationId, value); onSaved() } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <form className="panel hed-plan-form" onSubmit={submit}><h1>Tạo campaign giải ngân theo yêu cầu</h1>
    <p>Không chia milestone cấp vốn. Sau full funding, từng yêu cầu chi tiêu được Resolver duyệt giải ngân, tổ chức thực chi và nộp chứng từ/hóa đơn, sau đó mở 3 ngày challenge trước khi quyết toán.</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    <fieldset disabled={busy}><legend>Cam kết campaign</legend>
      <label>Tên campaign<input required maxLength={200} value={value.title} onChange={event => set('title', event.target.value)} /></label>
      <label>Mô tả<textarea required minLength={20} value={value.description} onChange={event => set('description', event.target.value)} /></label>
      <label>Mục đích<textarea required minLength={10} value={value.purpose} onChange={event => set('purpose', event.target.value)} /></label>
      <label>Nhóm thụ hưởng<textarea required minLength={10} value={value.beneficiaryScope} onChange={event => set('beneficiaryScope', event.target.value)} /></label>
      <label>Goal (base units MockUSDC)<input required inputMode="numeric" pattern="[1-9][0-9]*" value={value.goal} onChange={event => set('goal', event.target.value)} /></label>
      <label>Số ngày gây quỹ<input required type="number" min={1} max={30} value={value.fundingDuration / 86_400} onChange={event => set('fundingDuration', Number(event.target.value) * 86_400)} /></label>
    </fieldset>
    <fieldset disabled={busy}><legend>Outcome và chi phí được phép</legend>
      <label>Nhóm chi phí (mỗi dòng một nhóm)<textarea required value={value.allowedExpenseCategories.join('\n')} onChange={event => set('allowedExpenseCategories', event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} /></label>
      <label>Tiêu chí outcome (mỗi dòng một tiêu chí)<textarea required value={value.outcomeCriteria.join('\n')} onChange={event => set('outcomeCriteria', event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} /></label>
    </fieldset>
    <div className="hed-actions"><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Đang lưu…' : 'Lưu bản nháp HED'}</button><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>Quay lại</button></div>
  </form>
}
