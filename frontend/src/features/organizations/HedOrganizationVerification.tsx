import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage } from '../../lib/api/error'
import { listOrganizationVerificationRequests, saveOrganizationVerification, submitOrganizationVerification, uploadOrganizationVerificationDocument } from '../../lib/api/hed-organization-verification'
import type { Organization, } from '../../lib/api/organizations'

export function HedOrganizationVerification({ organization }: { organization: Organization }) {
  const cache = useQueryClient(), key = ['hed-organization-verification', organization.id]
  const requests = useQuery({ queryKey: key, queryFn: () => listOrganizationVerificationRequests(organization.id), retry: false })
  const latest = requests.data?.[0]
  const [value, setValue] = useState(() => ({ legalName: organization.name, registrationNumber: '', contactName: '', contactEmail: '', address: '', activitySummary: '', declaration: false }))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [document, setDocument] = useState<File | null>(null)
  async function save(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await saveOrganizationVerification(organization.id, { ...value, declaration: true }); await cache.invalidateQueries({ queryKey: key }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function submit() { if (!latest || !document || busy) return; setBusy(true); setError(''); try { await uploadOrganizationVerificationDocument(latest.id, document); await submitOrganizationVerification(latest.id); setDocument(null); await cache.invalidateQueries({ queryKey: key }); } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  return <section className="panel hed-plan-form"><h2>Xác minh tổ chức</h2>
    <p>Chủ tổ chức nộp hồ sơ; ADMIN độc lập quyết định. Xác minh không thay cho thẩm định campaign hoặc outcome.</p>
    {!organization.representativeWallet && <p className="toast toast--error">Chọn ví đại diện trước khi lưu hồ sơ xác minh.</p>}
    {requests.isPending ? <p role="status">Đang tải hồ sơ xác minh…</p> : latest?.status === 'UNDER_REVIEW' || latest?.status === 'APPROVED' ? <div><p><strong>{latest.status === 'APPROVED' ? 'Đã xác minh' : 'Đang chờ ADMIN xét duyệt'}</strong></p>{latest.reviewNote && <p>Ghi chú: {latest.reviewNote}</p>}</div> : <form onSubmit={save}>
      {error && <p className="toast toast--error" role="alert">{error}</p>}
      {latest?.reviewNote && <p className="toast toast--error">ADMIN yêu cầu: {latest.reviewNote}</p>}
      <label>Tên pháp lý<input required value={value.legalName} onChange={e => setValue(v => ({ ...v, legalName: e.target.value }))} /></label>
      <label>Mã đăng ký / giấy phép<input required value={value.registrationNumber} onChange={e => setValue(v => ({ ...v, registrationNumber: e.target.value }))} /></label>
      <label>Người liên hệ<input required value={value.contactName} onChange={e => setValue(v => ({ ...v, contactName: e.target.value }))} /></label>
      <label>Email liên hệ<input required type="email" value={value.contactEmail} onChange={e => setValue(v => ({ ...v, contactEmail: e.target.value }))} /></label>
      <label>Địa chỉ<textarea required value={value.address} onChange={e => setValue(v => ({ ...v, address: e.target.value }))} /></label>
      <label>Tóm tắt hoạt động<textarea required minLength={20} value={value.activitySummary} onChange={e => setValue(v => ({ ...v, activitySummary: e.target.value }))} /></label>
      <label><input required type="checkbox" checked={value.declaration} onChange={e => setValue(v => ({ ...v, declaration: e.target.checked }))} /> Tôi xác nhận hồ sơ là đúng.</label>
      <label>Giấy tờ đại diện / đăng ký (PDF, PNG, JPG)<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setDocument(event.target.files?.[0] ?? null)} /></label>
      <div className="hed-actions"><button className="button button--secondary" disabled={busy || !organization.representativeWallet} type="submit">Lưu hồ sơ</button>{latest && <button className="button button--primary" disabled={busy || !document} onClick={event => { event.preventDefault(); void submit() }}>Nộp ADMIN xét duyệt</button>}</div>
    </form>}
  </section>
}
