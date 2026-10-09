import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sha256, toHex } from 'viem'
import { advanceVerificationHistory, advanceVerificationQueue, advanceVerifyOrganization } from '../../lib/api/generated/advance'
import type { AccountSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'
import deployment from '../../lib/web3/deployment-context'
import { reviewSources } from './advance-review'
import '../campaigns/advance/advance.css'

export function AdvanceOrganizationVerification({ session, organizationId }: { session: AccountSession; organizationId?: string }) {
  const queue = useQuery({ queryKey: ['advance-verification-queue', deployment.deploymentId, session.userId], enabled: session.roles.includes('ADMIN'),
    queryFn: ({ signal }) => advanceVerificationQueue({ signal }), retry: false })
  if (!session.roles.includes('ADMIN')) return <section className="panel"><h1>Xác thực tổ chức</h1><p>Thao tác này cần account role ADMIN. RESOLVER không tự có quyền staff.</p></section>
  if (organizationId) return <VerificationForm key={`${session.userId}:${organizationId}`} session={session} organizationId={organizationId} />
  return <section className="panel"><h1>Xác thực tổ chức</h1><p>Kiểm tra danh tính và thẩm quyền. Xác thực không bảo đảm mọi hoạt động tương lai hoặc tự mở quyền nhận vốn.</p>
    {queue.isPending ? <p role="status">Đang tải tổ chức…</p> : queue.isError ? <><p role="alert">{getErrorMessage(queue.error)}</p><button className="button button--secondary" onClick={() => void queue.refetch()}>Tải lại</button></>
      : <ul>{queue.data.map(org => <li key={org.id}><a href={`#/internal/organizations/${org.id}`}>{org.name}</a> · {org.verificationStatus}<p>{org.description}</p></li>)}</ul>}
  </section>
}
function VerificationForm({ session, organizationId }: { session: AccountSession; organizationId: string }) {
  const cache = useQueryClient()
  const [status, setStatus] = useState<'VERIFIED' | 'REVOKED'>('VERIFIED'), [summary, setSummary] = useState(''), [reason, setReason] = useState('')
  const [sources, setSources] = useState(''), [scope, setScope] = useState(''), [limits, setLimits] = useState(''), [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError(''); setSaved('')
    try {
      const record = await advanceVerifyOrganization(organizationId, { status, summary, reason, sources: reviewSources(sources), scope, limits, validUntil: new Date(until).toISOString() })
      if (sha256(toHex(record.reportBytes)) !== record.hash) throw new Error('Hash hồ sơ staff không khớp bytes.')
      setSaved(record.hash)
      await cache.invalidateQueries({ queryKey: ['advance-verification-history', deployment.deploymentId, session.userId, organizationId] })
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  return <><a href="#/internal/organizations">← Danh sách tổ chức</a><form className="panel advance-plan-form" onSubmit={e => void save(e)}><h1>Hồ sơ xác thực tổ chức</h1>
    <p className="advance-hash">Organization: {organizationId}</p><p>Account role ADMIN · tổ chức do bạn sở hữu sẽ bị từ chối tự xác thực.</p>
    <fieldset disabled={busy}><legend>Kết luận staff</legend><label>Trạng thái<select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="VERIFIED">Đã xác thực</option><option value="REVOKED">Thu hồi xác thực</option></select></label>
      <label>Tóm tắt<textarea required value={summary} onChange={e => setSummary(e.target.value)} /></label>
      <label>Lý do<textarea required value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label>Nguồn kiểm tra · mỗi dòng: căn cứ | tham chiếu<textarea required value={sources} onChange={e => setSources(e.target.value)} /></label>
      <label>Phạm vi xác thực<textarea required value={scope} onChange={e => setScope(e.target.value)} /></label>
      <label>Giới hạn kiểm tra<textarea required value={limits} onChange={e => setLimits(e.target.value)} /></label>
      <label>Có hiệu lực đến · giờ máy địa phương<input type="datetime-local" required value={until} onChange={e => setUntil(e.target.value)} /></label>
      <button className="button button--primary" type="submit">Lưu hồ sơ xác thực off-chain</button></fieldset>
    {error && <p role="alert">{error}</p>}{saved && <p role="status" className="advance-hash">Đã ghi hồ sơ {saved}. Không có giao dịch chuyển tiền hoặc duyệt campaign tự động.</p>}
  </form><AdvanceVerificationHistory key={saved} session={session} organizationId={organizationId} /></>
}
export function AdvanceVerificationHistory({ session, organizationId }: { session: AccountSession; organizationId: string }) {
  const history = useQuery({ queryKey: ['advance-verification-history', deployment.deploymentId, session.userId, organizationId], retry: false,
    queryFn: async ({ signal }) => {
      const rows = await advanceVerificationHistory(organizationId, { signal })
      return rows.map(row => {
        if (sha256(toHex(row.reportBytes)) !== row.hash) throw new Error('Bytes hồ sơ xác thực đã thay đổi.')
        return { ...row, report: JSON.parse(row.reportBytes) as { summary: string; reason: string; scope: string; limits: string; sources: { description: string; reference: string }[] } }
      })
    } })
  return <section className="panel"><h2>Lịch sử xác thực tổ chức</h2>
    {history.isPending ? <p role="status">Đang đọc hồ sơ staff…</p> : history.isError ? <><p role="alert">{getErrorMessage(history.error)}</p><button className="button button--secondary" onClick={() => void history.refetch()}>Đọc lại</button></>
      : !history.data.length ? <p>Chưa có hồ sơ xác thực. Resolver chưa thể duyệt kế hoạch hoặc eligibility đầu.</p>
        : history.data.map((r, i) => <details key={r.id} open={i === 0}><summary>{r.status} · đến {new Date(r.validUntil).toLocaleString('vi-VN')}</summary><p>{r.report.summary}</p><p>{r.report.reason}</p>
          <p>Phạm vi: {r.report.scope}</p><p>Giới hạn: {r.report.limits}</p><ul>{r.report.sources.map((s, j) => <li key={j}>{s.description} · {s.reference}</li>)}</ul><p className="advance-hash">{r.hash}</p></details>)}
  </section>
}
