import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { decideOrganizationVerification, listOrganizationVerificationQueue } from '../../lib/api/hed-organization-verification'
import { getErrorMessage } from '../../lib/api/error'

export function HedOrganizationVerificationReview() {
  const cache = useQueryClient(), queue = useQuery({ queryKey: ['hed-organization-verification-queue'], queryFn: listOrganizationVerificationQueue, retry: false })
  const [note, setNote] = useState(''), [validUntil, setValidUntil] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState('')
  async function decide(id: string, decision: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT') { if (!note.trim() || busy) return; setBusy(id); setError(''); try { await decideOrganizationVerification(id, { decision, note, ...(decision === 'APPROVE' ? { validUntil: new Date(validUntil).toISOString() } : {}) }); setNote(''); setValidUntil(''); await cache.invalidateQueries({ queryKey: ['hed-organization-verification-queue'] }) } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy('') } }
  if (queue.isPending) return <p role="status">Đang tải hàng đợi xác minh tổ chức…</p>
  if (queue.isError) return <section className="panel"><p role="alert">{getErrorMessage(queue.error)}</p></section>
  return <section className="panel hed-plan-form"><h1>Xác minh tổ chức · ADMIN</h1><p>Không duyệt tổ chức mà bạn là OWNER. Quyết định này chỉ xác nhận hồ sơ tổ chức, không thay cho review campaign/evidence.</p>{error && <p className="toast toast--error" role="alert">{error}</p>}
    {queue.data.length === 0 ? <p>Không có hồ sơ chờ duyệt.</p> : queue.data.map(item => <article key={item.id} className="panel"><h2>{item.organizationName}</h2><p>{item.content.legalName} · {item.content.registrationNumber}</p><p>{item.content.contactName} · {item.content.contactEmail}</p><p>{item.content.address}</p><p>{item.content.activitySummary}</p><label>Ghi chú quyết định<textarea required value={note} onChange={event => setNote(event.target.value)} /></label><label>Hiệu lực đến (chỉ khi duyệt)<input type="datetime-local" value={validUntil} onChange={event => setValidUntil(event.target.value)} /></label><div className="hed-actions"><button className="button button--primary" disabled={busy === item.id || !note.trim() || !validUntil} onClick={() => void decide(item.id, 'APPROVE')}>Duyệt</button><button className="button button--secondary" disabled={busy === item.id || !note.trim()} onClick={() => void decide(item.id, 'REQUEST_CHANGES')}>Yêu cầu bổ sung</button><button className="button button--secondary" disabled={busy === item.id || !note.trim()} onClick={() => void decide(item.id, 'REJECT')}>Từ chối</button></div></article>)}
  </section>
}
