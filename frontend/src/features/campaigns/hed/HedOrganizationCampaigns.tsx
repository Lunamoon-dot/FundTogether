import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import deployment from '../../../lib/web3/deployment-context'
import { createHedCampaignDraft, freezeHedCampaignDraft, listHedCampaignDrafts } from '../../../lib/api/hed'
import type { HedCampaignDraft, HedCampaignDraftInput } from '../../../lib/api/hed'
import { getErrorMessage } from '../../../lib/api/error'
import '../advance/advance.css'

const initial = (): HedCampaignDraftInput => ({ title: '', description: '', purpose: '', beneficiaryScope: '', allowedExpenseCategories: ['GOODS'],
  outcomeCriteria: [''], goal: '', fundingDuration: 86_400, policyHash: deployment.policyHash! })

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
  async function freeze() { if (busy || value.frozenAt) return; setBusy(true); setError(''); try { await freezeHedCampaignDraft(value.id); onFrozen() } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <li className="panel"><div className="organization-card-heading"><h2>{value.title}</h2><span className="organization-role">{value.frozenAt ? 'Đã chốt' : 'Bản nháp'}</span></div>
    <p className="organization-description">{value.description}</p><p>Mục tiêu: {value.goal} base units MockUSDC · {value.fundingDuration / 86_400} ngày gây quỹ</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    {value.frozenAt ? <p className="advance-hash">Commitment: {value.commitmentHash}</p> : <button className="button button--primary" disabled={busy} onClick={() => void freeze()}>{busy ? 'Đang chốt…' : 'Chốt commitment'}</button>}
  </li>
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
