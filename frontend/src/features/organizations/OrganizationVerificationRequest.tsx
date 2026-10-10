import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { advanceCancelOrganizationRequest, advanceCreateOrganizationRequest, advanceDownloadOrganizationDocument,
  advanceSaveOrganizationRequest, advanceSubmitOrganizationRequest, advanceUploadOrganizationDocument } from '../../lib/api/generated/advance'
import type { OrganizationRequest, OrganizationRequestList, OrganizationVerificationSummary } from '../../lib/api/generated/advance'
import { getErrorMessage } from '../../lib/api/error'
import { requestLabels, organizationLabels, profileFields, useOrganizationRequests } from './organization-requests'
import '../campaigns/advance/advance.css'

const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—'
const documentLabels: Record<string, string> = { IDENTITY: 'Danh tính tổ chức', REPRESENTATION: 'Đại diện / ủy quyền', ACTIVITY: 'Hoạt động', OTHER: 'Khác' }
export function VerificationStatus({ value }: { value: OrganizationVerificationSummary }) {
  if (value.error || !value.status) return <p role="alert">{value.error || 'Chưa kiểm tra được hiệu lực xác minh.'}</p>
  return <div><p><strong>{organizationLabels[value.status]}</strong></p>
    {value.verificationExpiresAt && <p>Xác minh ngày {date(value.verifiedAt)} · hết hạn {date(value.verificationExpiresAt)}</p>}
    {value.requiresReverification && <p>Thông tin quan trọng đã thay đổi. Cần xét duyệt lại hồ sơ hiện tại.</p>}
  </div>
}
export function OrganizationVerificationBadge({ userId, organizationId }: { userId: string; organizationId: string }) {
  const query = useOrganizationRequests(userId, organizationId)
  if (query.isError) return <span>Chưa kiểm tra được xác minh</span>
  if (!query.data) return <span>Đang kiểm tra xác minh…</span>
  return <span>{query.data.verification.status ? organizationLabels[query.data.verification.status] : 'Chưa kiểm tra được xác minh'}</span>
}
export function VerificationDocuments({ request }: { request: OrganizationRequest }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState('')
  async function download(file: OrganizationRequest['documents'][number]) {
    setError(''); setBusy(file.id)
    try {
      const blob = await advanceDownloadOrganizationDocument(request.id, file.id, { responseType: 'blob' })
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = file.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy('') }
  }
  return <><ul>{request.documents.map(file => <li key={file.id}>{file.originalName} · {documentLabels[file.kind] || 'Chưa rõ loại tài liệu'} · {Math.ceil(file.byteSize / 1024)} KiB{' '}
    <button type="button" className="button button--secondary" disabled={Boolean(busy)} onClick={() => void download(file)}>
      {busy === file.id ? 'Đang tải…' : 'Tải tài liệu'}</button></li>)}</ul>{error && <p role="alert">{error}</p>}</>
}
export function VerificationRequestDetails({ request }: { request: OrganizationRequest }) {
  return <div><p>Hồ sơ: <strong>{requestLabels[request.status]}</strong> · gửi {date(request.submittedAt)}</p>
    <p>{request.content.profile.kind === 'REGISTERED_ORGANIZATION' ? 'Tổ chức đã đăng ký' : 'Nhóm thiện nguyện'}</p>
    <dl>{profileFields.map(([key, label]) => <div className="advance-form-row" key={key}><dt>{label}</dt><dd>{request.content.profile[key] || '—'}</dd></div>)}</dl>
    <VerificationDocuments request={request} />
    {request.content.responseToReview && <p>Trả lời bổ sung: {request.content.responseToReview}</p>}
    {request.reviewNote && <><p>Kết luận ngày {date(request.reviewedAt)} · người xét duyệt {request.reviewedBy}</p><p>{request.reviewNote}</p>
      {request.missingItems.length > 0 && <ul>{request.missingItems.map((item, i) => <li key={i}>{item}</li>)}</ul>}</>}
  </div>
}
export function VerificationTimeline({ data }: { data: OrganizationRequestList }) {
  const labels: Record<string, string> = { CREATED: 'Mở hồ sơ', SAVED: 'Cập nhật hồ sơ', DOCUMENT_ADDED: 'Thêm tài liệu', SUBMITTED: 'Gửi xác thực', ...requestLabels }
  return <section><h3>Lịch sử xử lý</h3>{!data.audit.length ? <p>Chưa có yêu cầu xác thực.</p> : <ol>{data.audit.map(event =>
    <li key={event.id}>{date(event.happenedAt)} · {labels[event.action] || event.action} · tài khoản {event.actorId}
      {event.changedFields.length > 0 && <p>Đã thay đổi: {event.changedFields.map(field => profileFields.find(([key]) => field === `profile.${key}`)?.[1]
        || ({ documents: 'Tài liệu', responseToReview: 'Trả lời bổ sung', 'profile.kind': 'Loại tổ chức' }[field]) || field).join(', ')}</p>}</li>)}</ol>}</section>
}

export function OrganizationVerificationRequest({ userId, organizationId, representativeWalletSelected }: { userId: string; organizationId: string; representativeWalletSelected: boolean }) {
  const query = useOrganizationRequests(userId, organizationId), cache = useQueryClient()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), running = useRef(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [documentKind, setDocumentKind] = useState<'IDENTITY' | 'REPRESENTATION' | 'ACTIVITY' | 'OTHER'>('IDENTITY')
  async function run(action: () => Promise<unknown>, message: string) {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(message) } catch (cause) { setError(getErrorMessage(cause)) }
    finally {
      await query.refetch(); await cache.invalidateQueries({ queryKey: ['organizations', userId] })
      running.current = false; setBusy(false)
    }
  }
  if (query.isPending) return <section className="panel"><p role="status">Đang tải yêu cầu xác thực…</p></section>
  if (query.isError) return <section className="panel"><p role="alert">{getErrorMessage(query.error)}</p>
    <button className="button button--secondary" onClick={() => void query.refetch()}>Tải lại hồ sơ trước khi tiếp tục</button></section>
  const data = query.data, current = data.requests[0], previous = data.requests[1]
  return <section className="panel advance-plan-form"><h2>Xác thực hồ sơ tổ chức</h2><VerificationStatus value={data.verification} />
    <p>FundTogether kiểm tra hồ sơ tổ chức theo chính sách xác minh. Kết quả này không bảo đảm campaign hoặc bằng chứng thực hiện luôn đúng.</p>
    {data.isOwner && (!current || !['DRAFT', 'UNDER_REVIEW'].includes(current.status)) && <>
      {current && <VerificationRequestDetails request={current} />}
      <button className="button button--primary" disabled={busy} onClick={() => void run(() => advanceCreateOrganizationRequest(organizationId), 'Đã mở hồ sơ để chỉnh sửa.')}>
        {current ? 'Chỉnh sửa và gửi yêu cầu mới' : 'Chuẩn bị hồ sơ xác thực'}</button></>}
    {data.isOwner && current?.status === 'DRAFT' && <VerificationDraft key={`${current.id}:${current.revision}`} request={current}
      previous={previous} busy={busy} run={run} representativeWalletSelected={representativeWalletSelected} file={pendingFile} setFile={setPendingFile} kind={documentKind} setKind={setDocumentKind} />}
    {current?.status === 'UNDER_REVIEW' && <><VerificationRequestDetails request={current} /><p>Hồ sơ đã khóa trong lúc xét duyệt. Muốn sửa, hủy yêu cầu rồi mở hồ sơ mới.</p>
      {data.isOwner && <button className="button button--secondary" disabled={busy} onClick={() => void run(() => advanceCancelOrganizationRequest(current.id,
        { expectedRevision: current.revision }), 'Đã hủy yêu cầu; nội dung từng gửi vẫn được lưu.')}>Hủy yêu cầu để chỉnh sửa</button>}</>}
    {error && <p role="alert">{error} Đã kiểm tra lại trạng thái hồ sơ; đọc kết quả trước khi thử lại.</p>}{notice && <p role="status">{notice}</p>}
    {data.requests.slice(1).map(request => <details key={request.id}><summary>{requestLabels[request.status]} · gửi {date(request.submittedAt)}</summary><VerificationRequestDetails request={request} /></details>)}
    <VerificationTimeline data={data} />
  </section>
}
function VerificationDraft({ request, previous, busy, run, representativeWalletSelected, file, setFile, kind, setKind }: { request: OrganizationRequest; previous?: OrganizationRequest; busy: boolean; representativeWalletSelected: boolean; file: File | null; setFile: (file: File | null) => void;
  kind: 'IDENTITY' | 'REPRESENTATION' | 'ACTIVITY' | 'OTHER'; setKind: (kind: 'IDENTITY' | 'REPRESENTATION' | 'ACTIVITY' | 'OTHER') => void;
  run: (action: () => Promise<unknown>, notice: string) => Promise<void> }) {
  const [content, setContent] = useState(request.content), [declaration, setDeclaration] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(content) !== JSON.stringify(request.content)
  const save = () => dirty ? advanceSaveOrganizationRequest(request.id, { expectedRevision: request.revision, content }) : Promise.resolve(request)
  async function submit() { const saved = await save(); return advanceSubmitOrganizationRequest(saved.id, { expectedRevision: saved.revision, declaration: true }) }
  async function upload() {
    if (!file) return
    const saved = await save()
    await advanceUploadOrganizationDocument(saved.id, { expectedRevision: saved.revision, kind, file })
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }
  return <form onSubmit={event => { event.preventDefault(); if (declaration && representativeWalletSelected && !file) void run(submit, 'Đã gửi hồ sơ. ADMIN sẽ xét duyệt.')}}>
    {!representativeWalletSelected && <div role="alert">
      <p>Chưa gửi đến ADMIN: tổ chức này chưa có ví đại diện. Liên kết ví với tài khoản chưa đủ; cần chọn và xác nhận ví cho tổ chức này.</p>
      <button type="button" className="button button--secondary" onClick={() => {
        const choice = document.getElementById('organization-wallet')
        document.getElementById('organization-wallet-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        choice?.focus({ preventScroll: true })
      }}>Chọn ví đại diện cho tổ chức</button>
    </div>}
    {previous?.status === 'CHANGES_REQUESTED' && <div><h3>Nội dung cần bổ sung</h3><p>{previous.reviewNote}</p><ul>{previous.missingItems.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
    <fieldset disabled={busy}><legend>Thông tin xét duyệt</legend><p>Bản nháp · chưa gửi đến ADMIN. Lưu và tải tài liệu chưa đưa hồ sơ vào hàng chờ xét duyệt.</p>
      <label>Loại tổ chức<select value={content.profile.kind} onChange={e => setContent({ ...content, profile: { ...content.profile, kind: e.target.value as typeof content.profile.kind } })}>
        <option value="VOLUNTEER_GROUP">Nhóm thiện nguyện</option><option value="REGISTERED_ORGANIZATION">Tổ chức đã đăng ký</option></select></label>
      {profileFields.map(([key, label, max]) => <label key={key}>{label}<textarea maxLength={max} required={key !== 'registrationNumber' || content.profile.kind === 'REGISTERED_ORGANIZATION'}
        value={content.profile[key]} onChange={e => setContent({ ...content, profile: { ...content.profile, [key]: e.target.value } })} /></label>)}
      <label>Trả lời yêu cầu bổ sung<textarea maxLength={10000} required={previous?.status === 'CHANGES_REQUESTED'} value={content.responseToReview}
        onChange={e => setContent({ ...content, responseToReview: e.target.value })} /></label>
      <VerificationDocuments request={request} />
      {request.documents.map(doc => <label key={doc.id}><input type="checkbox" checked={content.documentIds.includes(doc.id)}
        onChange={e => setContent({ ...content, documentIds: e.target.checked ? [...content.documentIds, doc.id] : content.documentIds.filter(id => id !== doc.id) })} />Giữ {doc.originalName} trong hồ sơ này</label>)}
      <label>Loại tài liệu<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="IDENTITY">Danh tính tổ chức</option>
        <option value="REPRESENTATION">Đại diện / ủy quyền</option><option value="ACTIVITY">Hoạt động</option><option value="OTHER">Khác</option></select></label>
      <label>Tài liệu PDF, PNG hoặc JPEG · tối đa 10 MiB/file, 20 file<input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      {file && <div role="status"><p>File “{file.name}” chưa được tải lên. Bấm “Tải tài liệu lên” hoặc bỏ chọn trước khi gửi xác thực.</p>
        {file.size > 10485760 && <p>File vượt giới hạn 10 MiB. Hãy chọn file nhỏ hơn.</p>}
        <button type="button" className="button button--secondary" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = '' }}>Bỏ chọn file</button></div>}
      <div className="advance-actions"><button type="button" className="button button--secondary" disabled={!file || file.size > 10485760 || content.documentIds.length >= 20}
        onClick={() => void run(upload, 'Đã lưu tài liệu. Hồ sơ vẫn là bản nháp.')}>Tải tài liệu lên</button>
        <button type="button" className="button button--secondary" onClick={() => void run(save, 'Đã lưu bản nháp.')}>Lưu bản nháp</button></div>
      <label><input type="checkbox" checked={declaration} onChange={e => setDeclaration(e.target.checked)} />Tôi xác nhận thông tin đúng và có quyền đại diện tổ chức gửi hồ sơ này.</label>
      <p>Cần chọn ví đại diện đã liên kết ở phía trên trước khi gửi. Gửi hồ sơ không yêu cầu ký ví và không tốn gas.</p>
      <button type="submit" className="button button--primary" disabled={!representativeWalletSelected || !declaration || !content.documentIds.length || Boolean(file)}>{busy ? 'Đang lưu…' : 'Gửi xác thực'}</button>
    </fieldset>
  </form>
}
