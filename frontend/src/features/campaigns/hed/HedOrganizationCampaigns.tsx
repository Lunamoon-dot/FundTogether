import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEventLogs } from 'viem'
import type { Abi } from 'viem'
import deployment from '../../../lib/web3/deployment-context'
import generatedAbi from '../../../../../backend/src/blockchain/generated/hed/fund-together-disbursement.abi.json'
import { createHedCampaignDraft, createHedRequestDraft, freezeHedCampaignDraft, freezeHedRequestDraft, listHedCampaignDrafts, listHedRequestDrafts, listHedVendorOptions, registerHedOnchainCampaign, uploadHedRequestEvidence } from '../../../lib/api/hed'
import type { HedCampaignDraft, HedCampaignDraftInput, HedRequestDraftInput } from '../../../lib/api/hed'
import { getErrorMessage } from '../../../lib/api/error'
import '../advance/advance.css'

const initial = (): HedCampaignDraftInput => ({ title: '', description: '', purpose: '', beneficiaryScope: '', allowedExpenseCategories: ['GOODS'],
  outcomeCriteria: [''], goal: '', fundingDuration: 86_400, policyHash: deployment.policyHash! })
const abi = generatedAbi as Abi

export function HedOrganizationCampaigns({ organizationId, userId, section }: { organizationId: string; userId: string; section: string }) {
  const base = `/organizations/${organizationId}/workspace/campaigns`, creating = section === '/campaigns/new'
  const cache = useQueryClient(), key = ['hed-campaign-drafts', deployment.policyHash, userId, organizationId]
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedCampaignDrafts(organizationId, signal), enabled: !creating, retry: false })
  if (creating) return <HedCampaignWizard organizationId={organizationId} onSaved={() => { void cache.invalidateQueries({ queryKey: key }); window.location.hash = base }} onClose={() => { window.location.hash = base }} />
  return <>
    <div className="feed-heading"><h1>Campaign · giải ngân theo yêu cầu</h1><a className="button button--primary" href={`#${base}/new`}>Tạo campaign HED</a></div>
    <p>Đủ goal trước khi giải ngân · vendor nhận trực tiếp · chain {deployment.chainId}. Chốt hồ sơ chưa gửi transaction.</p>
    {list.isPending ? <p role="status">Đang tải campaign…</p> : list.isError ? <section className="panel"><p role="alert">{getErrorMessage(list.error)}</p><button className="button button--secondary" onClick={() => void list.refetch()}>Thử lại</button></section>
      : list.data.length === 0 ? <section className="panel"><h2>Chưa có campaign HED</h2><p>Tạo hồ sơ purpose, scope và outcome trước khi chốt commitment.</p></section>
        : <ul className="organization-list">{list.data.map(draft => <HedCampaignEntry key={draft.id} value={draft} onFrozen={() => void list.refetch()} />)}</ul>}
  </>
}

function HedCampaignEntry({ value, onFrozen }: { value: HedCampaignDraft; onFrozen: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
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
    {value.frozenAt ? <><p className="advance-hash">Commitment: {value.commitmentHash}</p><button className="button button--primary" disabled={busy || !account.address} onClick={() => void publish()}>{busy ? 'Đang xử lý…' : 'Tạo campaign trên HED chain'}</button><HedRequestWorkspace campaignId={value.id} /></> : <button className="button button--primary" disabled={busy} onClick={() => void freeze()}>{busy ? 'Đang chốt…' : 'Chốt commitment'}</button>}
  </li>
}

function HedRequestWorkspace({ campaignId }: { campaignId: string }) {
  const cache = useQueryClient(), key = ['hed-requests', campaignId], vendorKey = ['hed-vendors', campaignId]
  const requests = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedRequestDrafts(campaignId, signal), retry: false })
  const vendors = useQuery({ queryKey: vendorKey, queryFn: ({ signal }) => listHedVendorOptions(campaignId, signal), retry: false })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<HedRequestDraftInput>({ vendorVerificationId: '', activityReference: '', purpose: '', itemLines: [{ description: '', quantity: 1, unitAmount: '' }], amount: '', deposit: '0', expectedDeliveryAt: '', acceptanceCriteria: [''], terms: '', needEvidenceReferences: [] })
  const ready = vendors.data?.length ? vendors.data : []
  async function create(event: FormEvent) { event.preventDefault(); if (busy || !file) return; setBusy(true); setError(''); try {
    const draft = await createHedRequestDraft(campaignId, form); await uploadHedRequestEvidence(campaignId, draft.id, 'QUOTE', file); await cache.invalidateQueries({ queryKey: key }); setFile(null)
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function freeze(id: string) { if (busy) return; setBusy(true); setError(''); try { await freezeHedRequestDraft(campaignId, id); await cache.invalidateQueries({ queryKey: key }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <section className="panel"><h3>Yêu cầu thanh toán</h3><p>Hồ sơ chưa là reserve, vendor acknowledgement hay payout. Upload chỉ lưu evidence private.</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    {requests.data?.map(request => <div key={request.id}><p>{request.purpose} · {request.amount} base units · {request.frozenAt ? `Đã chốt ${request.requestHash}` : 'Chưa chốt'}</p>{!request.frozenAt && <button className="button button--secondary" disabled={busy} onClick={() => void freeze(request.id)}>Chốt request đã có evidence</button>}</div>)}
    {ready.length === 0 ? <p role="status">Chưa có vendor verified khả dụng.</p> : <form className="advance-plan-form" onSubmit={create}><label>Vendor<select required value={form.vendorVerificationId} onChange={e => setForm(v => ({ ...v, vendorVerificationId: e.target.value }))}><option value="">Chọn vendor đã verify</option>{ready.map(v => <option key={v.id} value={v.id}>{v.content.legalName} · {v.vendorWallet}</option>)}</select></label>
      <label>Activity reference<input required value={form.activityReference} onChange={e => setForm(v => ({ ...v, activityReference: e.target.value }))} /></label><label>Mục đích<textarea required value={form.purpose} onChange={e => setForm(v => ({ ...v, purpose: e.target.value }))} /></label>
      <label>Line item<input required value={form.itemLines[0].description} onChange={e => setForm(v => ({ ...v, itemLines: [{ ...v.itemLines[0], description: e.target.value }] }))} /></label><label>Đơn giá / amount<input required inputMode="numeric" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value, itemLines: [{ ...v.itemLines[0], unitAmount: e.target.value }] }))} /></label><label>Cọc<input required inputMode="numeric" value={form.deposit} onChange={e => setForm(v => ({ ...v, deposit: e.target.value }))} /></label>
      <label>Hạn giao<input required type="datetime-local" onChange={e => setForm(v => ({ ...v, expectedDeliveryAt: new Date(e.target.value).toISOString() }))} /></label><label>Tiêu chí nghiệm thu<textarea required value={form.acceptanceCriteria[0]} onChange={e => setForm(v => ({ ...v, acceptanceCriteria: [e.target.value] }))} /></label><label>Terms<textarea required value={form.terms} onChange={e => setForm(v => ({ ...v, terms: e.target.value }))} /></label><label>Báo giá hoặc hồ sơ nhu cầu private<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      <button className="button button--primary" disabled={busy || !file} type="submit">{busy ? 'Đang lưu…' : 'Tạo request và upload evidence'}</button></form>}
  </section>
}

function HedCampaignWizard({ organizationId, onSaved, onClose }: { organizationId: string; onSaved: () => void; onClose: () => void }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const set = <K extends keyof HedCampaignDraftInput>(key: K, next: HedCampaignDraftInput[K]) => setValue(current => ({ ...current, [key]: next }))
  async function submit(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await createHedCampaignDraft(organizationId, value); onSaved() } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <form className="panel advance-plan-form" onSubmit={submit}><h1>Tạo campaign giải ngân theo yêu cầu</h1>
    <p>Không chia milestone cấp vốn. Sau full funding, từng request phải được reserve, vendor acknowledge, nghiệm thu và challenge trước final payment.</p>
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
    <div className="advance-actions"><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Đang lưu…' : 'Lưu bản nháp HED'}</button><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>Quay lại</button></div>
  </form>
}
