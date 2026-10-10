import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sha256, toHex } from 'viem'
import { advanceVerificationHistory, advanceOrganizationRequestQueue, advanceDecideOrganizationRequest, advanceVerifyOrganization } from '../../lib/api/generated/advance'
import type { OrganizationRequest } from '../../lib/api/generated/advance'
import type { AccountSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'
import deployment from '../../lib/web3/deployment-context'
import { reviewSources } from './advance-review'
import { VerificationRequestDetails, VerificationStatus, VerificationTimeline } from '../organizations/OrganizationVerificationRequest'
import { requestLabels, useOrganizationRequests } from '../organizations/organization-requests'
import { ApprovedOrganizationRequest } from './ApprovedOrganizationRequest'
import '../campaigns/advance/advance.css'

export function AdvanceOrganizationVerification({ session, organizationId, requestId }: { session: AccountSession; organizationId?: string; requestId?: string }) {
  const [status, setStatus] = useState('UNDER_REVIEW'), [offset, setOffset] = useState(0)
  const queue = useQuery({ queryKey: ['advance-verification-queue', deployment.deploymentId, session.userId, status, offset], enabled: session.roles.includes('ADMIN') && !organizationId,
    queryFn: ({ signal }) => advanceOrganizationRequestQueue({ status, offset: String(offset) }, { signal }), retry: false, staleTime: 0,
    refetchInterval: query => query.state.status === 'error' ? false : 10_000 })
  if (!session.roles.includes('ADMIN')) return <section className="panel"><h1>Xác thực tổ chức</h1><p>Thao tác này cần account role ADMIN. RESOLVER không tự có quyền staff.</p></section>
  if (organizationId) return <OrganizationReview key={`${session.userId}:${organizationId}:${requestId ?? 'latest'}`} session={session} organizationId={organizationId} requestId={requestId} />
  return <section className="panel"><h1>Xác thực tổ chức</h1><p>Kiểm tra danh tính và thẩm quyền. Xác thực không bảo đảm mọi hoạt động tương lai hoặc tự mở quyền nhận vốn.</p>
    <div className="verification-queue-toolbar"><label>Trạng thái hồ sơ<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}>{Object.entries(requestLabels).filter(([key]) => key !== 'DRAFT')
      .map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="button button--secondary" aria-label="Làm mới danh sách" disabled={queue.isFetching} onClick={() => void queue.refetch()}>{queue.isFetching ? 'Đang tải…' : 'Làm mới danh sách'}</button></div>
    {queue.isPending ? <p role="status">Đang tải yêu cầu…</p> : queue.isError ? <><p role="alert">{getErrorMessage(queue.error)}</p><button className="button button--secondary" onClick={() => void queue.refetch()}>Tải lại</button></>
      : <><ul className="verification-queue">{queue.data.items.map(request => <li key={request.id}><div><h2><a href={`#/internal/organizations/${request.organizationId}/requests/${request.id}`}>{request.name}</a></h2><p>{requestLabels[request.status]}</p>
        <p>Gửi {request.submittedAt && new Date(request.submittedAt).toLocaleString('vi-VN')}</p></div><a className="button button--primary" href={`#/internal/organizations/${request.organizationId}/requests/${request.id}`} aria-label={`Xem hồ sơ ${request.name}`}>Xem hồ sơ</a></li>)}</ul>{!queue.data.items.length && <p>Không có yêu cầu trong trạng thái này. Hồ sơ chỉ lưu bản nháp chưa xuất hiện ở đây.</p>}
        <div className="advance-actions"><button className="button button--secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Trang trước</button>
          <button className="button button--secondary" disabled={queue.data.nextOffset === null} onClick={() => setOffset(queue.data.nextOffset!)}>Trang tiếp</button></div></>}
  </section>
}
function OrganizationReview({ session, organizationId, requestId }: { session: AccountSession; organizationId: string; requestId?: string }) {
  const query = useOrganizationRequests(session.userId, organizationId)
  if (query.isPending) return <p role="status">Đang tải hồ sơ xét duyệt…</p>
  if (query.isError) return <section className="panel"><p role="alert">{getErrorMessage(query.error)}</p><button className="button button--secondary" onClick={() => void query.refetch()}>Tải lại</button></section>
  const data = query.data, current = requestId ? data.requests.find(request => request.id === requestId) : data.requests[0]
  if (requestId && !current) return <section className="panel"><h1>Không tìm thấy yêu cầu</h1><p>Yêu cầu này không thuộc danh sách hồ sơ bạn được phép xem.</p><a href="#/internal/organizations">← Danh sách yêu cầu</a></section>
  return <><a href="#/internal/organizations">← Danh sách yêu cầu</a><section className="panel"><h1>{data.organization.name}</h1>
    <VerificationStatus value={data.verification} />
    {requestId && <p>Đang xem hồ sơ đã chọn · {current && requestLabels[current.status]}</p>}
    <p>Xác thực hồ sơ theo chính sách FundTogether; không bảo đảm campaign hoặc bằng chứng thực hiện luôn đúng.</p>
    {current ? <VerificationRequestDetails request={current} /> : <p>Organizer chưa gửi yêu cầu xác thực.</p>}
    {data.isOwner ? <p>Bạn sở hữu tổ chức này nên không thể tự xét duyệt.</p>
      : <>{current?.status === 'UNDER_REVIEW' && current.id === data.requests[0]?.id && <DecisionForm key={`${current.id}:${current.revision}`} request={current} organizationId={organizationId} reload={query.refetch} />}
        {data.verification.recordId && data.verification.status !== 'SUSPENDED' && <details><summary>Đình chỉ xác minh</summary>
          <DecisionForm organizationId={organizationId} revoke reload={query.refetch} /></details>}</>}
    {data.requests.filter(request => request.id !== current?.id).map(request => <details key={request.id}><summary>{requestLabels[request.status]} · {request.submittedAt && new Date(request.submittedAt).toLocaleString('vi-VN')}</summary>
      <VerificationRequestDetails request={request} /></details>)}<VerificationTimeline data={data} />
  </section><AdvanceVerificationHistory session={session} organizationId={organizationId} /></>
}
function DecisionForm({ request, organizationId, revoke = false, reload }: { request?: OrganizationRequest; organizationId: string; revoke?: boolean; reload: () => Promise<unknown> }) {
  const cache = useQueryClient()
  const [decision, setDecision] = useState<'APPROVE' | 'REQUEST_CHANGES' | 'REJECT'>('REQUEST_CHANGES'), [summary, setSummary] = useState(''), [reason, setReason] = useState('')
  const [sources, setSources] = useState(''), [scope, setScope] = useState(''), [limits, setLimits] = useState(''), [until, setUntil] = useState('')
  const [reviewNote, setReviewNote] = useState(''), [missing, setMissing] = useState(''), [checks, setChecks] = useState({ identity: false, representation: false, activity: false, contact: false })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError(''); setSaved('')
    try {
      if (revoke) await advanceVerifyOrganization(organizationId, { status: 'REVOKED', summary, reason, sources: reviewSources(sources), scope, limits, validUntil: new Date().toISOString() })
      else if (request) {
        const base = { expectedRevision: request.revision, reviewNote }
        if (decision === 'APPROVE') {
          if (!Object.values(checks).every(Boolean)) throw new Error('Cần hoàn thành cả bốn nhóm kiểm tra.')
          await advanceDecideOrganizationRequest(request.id, { ...base, decision, checks: { identity: true, representation: true, activity: true, contact: true },
            verification: { status: 'VERIFIED', summary, reason, sources: reviewSources(sources), scope, limits, validUntil: new Date(until).toISOString() } })
        } else if (decision === 'REQUEST_CHANGES') await advanceDecideOrganizationRequest(request.id, { ...base, decision, missingItems: missing.split('\n').map(s => s.trim()).filter(Boolean) })
        else await advanceDecideOrganizationRequest(request.id, { ...base, decision })
      }
      setSaved('Đã lưu quyết định.')
    } catch (cause) { setError(getErrorMessage(cause)) } finally {
      await reload(); await cache.invalidateQueries({ queryKey: ['advance-verification-history'] })
      await cache.invalidateQueries({ queryKey: ['advance-verification-queue'] }); setBusy(false)
    }
  }
  return <form className="advance-plan-form" onSubmit={e => void save(e)}>
    <fieldset disabled={busy}><legend>{revoke ? 'Đình chỉ có lý do' : 'Quyết định xét duyệt'}</legend>
      {!revoke && <><label>Quyết định<select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="REQUEST_CHANGES">Yêu cầu bổ sung</option><option value="APPROVE">Duyệt</option><option value="REJECT">Từ chối</option></select></label>
        <label>Nhận xét gửi organizer<textarea required maxLength={10000} value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></label>
        {decision === 'REQUEST_CHANGES' && <label>Mục cần bổ sung · mỗi dòng một mục<textarea required value={missing} onChange={e => setMissing(e.target.value)} /></label>}
        {decision === 'APPROVE' && Object.entries({ identity: 'Danh tính tổ chức', representation: 'Thẩm quyền đại diện', activity: 'Hoạt động', contact: 'Liên hệ' }).map(([key, label]) =>
          <label key={key}><input type="checkbox" required checked={checks[key as keyof typeof checks]} onChange={e => setChecks({ ...checks, [key]: e.target.checked })} />Đã kiểm tra {label.toLowerCase()}</label>)}</>}
      {(revoke || decision === 'APPROVE') && <>
      <label>Tóm tắt<textarea required value={summary} onChange={e => setSummary(e.target.value)} /></label>
      <label>Lý do<textarea required value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label>Nguồn kiểm tra · mỗi dòng: căn cứ | tham chiếu<textarea required value={sources} onChange={e => setSources(e.target.value)} /></label>
      <label>Phạm vi xác thực<textarea required value={scope} onChange={e => setScope(e.target.value)} /></label>
      <label>Giới hạn kiểm tra<textarea required value={limits} onChange={e => setLimits(e.target.value)} /></label>
      {!revoke && <label>Có hiệu lực đến · giờ máy địa phương<input type="datetime-local" required value={until} onChange={e => setUntil(e.target.value)} /></label>}</>}
      <button className="button button--primary" type="submit">{busy ? 'Đang lưu…' : revoke ? 'Đình chỉ xác minh' : 'Ghi quyết định'}</button></fieldset>
    {error && <p role="alert">{error} Đã đọc lại trạng thái trước khi cho phép thử lại.</p>}{saved && <p role="status">{saved}</p>}
  </form>
}
export function AdvanceVerificationHistory({ session, organizationId }: { session: AccountSession; organizationId: string }) {
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const allowed = session.roles.includes('ADMIN') || session.roles.includes('RESOLVER')
  const history = useQuery({ queryKey: ['advance-verification-history', deployment.deploymentId, session.userId, organizationId], enabled: allowed, retry: false,
    queryFn: async ({ signal }) => {
      const rows = await advanceVerificationHistory(organizationId, { signal })
      return rows.map(row => {
        if (sha256(toHex(row.reportBytes)) !== row.hash) throw new Error('Bytes hồ sơ xác thực đã thay đổi.')
        return { ...row, report: JSON.parse(row.reportBytes) as { summary: string; reason: string; scope: string; limits: string; sources: { description: string; reference: string }[]; request?: { id: string; snapshotHash: string } } }
      })
    } })
  if (!allowed) return <p role="alert">Cần quyền ADMIN hoặc RESOLVER để đọc lịch sử xác thực.</p>
  return <section className="panel"><h2>Lịch sử xác thực tổ chức</h2>
    {history.isPending ? <p role="status">Đang đọc hồ sơ staff…</p> : history.isError ? <><p role="alert">{getErrorMessage(history.error)}</p><button className="button button--secondary" onClick={() => void history.refetch()}>Đọc lại</button></>
      : !history.data.length ? <p>Chưa có hồ sơ xác thực. Resolver chưa thể duyệt kế hoạch hoặc eligibility đầu.</p>
        : history.data.map((r, i) => <details key={r.id} open={i === 0}><summary>{r.status} · đến {new Date(r.validUntil).toLocaleString('vi-VN')}</summary><p>{r.report.summary}</p><p>{r.report.reason}</p>
          {!r.report.request && r.status === 'VERIFIED' && <p>Xác minh trước luồng hồ sơ.</p>}
          <p>Phạm vi: {r.report.scope}</p><p>Giới hạn: {r.report.limits}</p><ul>{r.report.sources.map((s, j) => <li key={j}>{s.description} · {s.reference}</li>)}</ul><p className="advance-hash">{r.hash}</p>
          {r.report.request && r.status === 'VERIFIED' && <><button className="button button--secondary" aria-expanded={openRequest === r.id}
            onClick={() => setOpenRequest(openRequest === r.id ? null : r.id)}>{openRequest === r.id ? 'Ẩn hồ sơ' : 'Xem hồ sơ đã được duyệt'}</button>
            {openRequest === r.id && <ApprovedOrganizationRequest key={`${session.userId}:${r.id}`} session={session}
              binding={{ organizationId, verificationRecordId: r.id, requestId: r.report.request.id, snapshotHash: r.report.request.snapshotHash }} />}</>}
        </details>)}
  </section>
}
