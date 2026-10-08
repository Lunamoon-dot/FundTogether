import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CampaignMilestoneDraft } from '../../lib/api/campaigns'
import type { FrozenEvidencePackage } from '../../lib/api/evidence-drafts'
import { getMilestoneDetail, publishRedactedEvidence } from '../../lib/api/milestone-workflow'
import { getErrorMessage } from '../../lib/api/error'
import { useAccountSession } from '../auth/AccountSessionProvider'

export function PublicEvidenceForm({ campaignId, milestone, frozen }: {
  campaignId: string; milestone: CampaignMilestoneDraft; frozen: FrozenEvidencePackage
}) {
  const { session } = useAccountSession(), queries = useQueryClient(), index = String(milestone.milestoneIndex)
  const key = ['milestone-workflow', session?.userId, campaignId, index]
  const detail = useQuery({ queryKey: key, queryFn: ({ signal }) => getMilestoneDetail(campaignId, index, signal), enabled: Boolean(session), retry: false })
  const [summary, setSummary] = useState(''), [files, setFiles] = useState<File[]>([])
  const [outcomes, setOutcomes] = useState<Record<string, { description: string; documentIndexes: number[] }>>({})
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const existing = detail.data?.supported ? detail.data.prepared.find(p => p.packageId === frozen.id) : null
  if (!detail.data?.supported) return null
  if (frozen.submissionVersion !== detail.data.version + 1) return <p>Gói gốc này không còn là phiên bản nộp tiếp theo. Kiểm tra lại phiên bản để đóng băng gói mới.</p>
  if (existing) return <section className="panel"><h3>Bản công khai đã chốt</h3><p>{existing.manifest.summary}</p>
    <ul>{existing.manifest.outcomes.map(o => <li key={o.criterionId}>{o.criterionId}: {o.description}</li>)}</ul>
    <p>Hash: <code>{existing.hash}</code>. Bản đã chốt không sửa được; ký nộp ở mục milestone bên dưới.</p></section>
  const valid = confirmed && summary.trim().length >= 10 && files.length > 0 && files.length <= 20 && files.every(f => f.size > 0 && f.size <= 10 * 1024 * 1024)
    && milestone.acceptanceCriteria.every(c => (outcomes[c.criterionId]?.description.trim().length ?? 0) >= 10 && outcomes[c.criterionId]?.documentIndexes.length)
  async function publish() {
    if (!valid || busy) return
    setBusy(true); setError('')
    try {
      await publishRedactedEvidence(campaignId, index, { packageId: frozen.id, confirmedRedacted: true, summary: summary.trim(),
        outcomes: milestone.acceptanceCriteria.map(c => ({ criterionId: c.criterionId, ...outcomes[c.criterionId] })) }, files)
      await queries.invalidateQueries({ queryKey: key })
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <section className="panel"><h3>Chuẩn bị bản donor được đọc</h3>
    <p>Viết bản báo cáo có thể công khai và tải các bản đã che thông tin riêng tư. Bản này có hash riêng liên kết với gói gốc; không tự sao chép file gốc.</p>
    <label>Tóm tắt công khai<textarea maxLength={8000} value={summary} disabled={busy} onChange={e => setSummary(e.target.value)} /></label>
    <label>Chọn bản đã che thông tin · PDF/JPEG/PNG, tối đa 20 file, 10 MiB/file
      <input type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e => {
        setFiles(Array.from(e.target.files ?? [])); setOutcomes(value => Object.fromEntries(Object.entries(value).map(([k, v]) => [k, { ...v, documentIndexes: [] }]))); setConfirmed(false)
      }} /></label>
    {milestone.acceptanceCriteria.map(c => <fieldset key={c.criterionId}><legend>{c.description}</legend>
      <label>Kết quả công khai<textarea maxLength={4000} disabled={busy} value={outcomes[c.criterionId]?.description ?? ''}
        onChange={e => setOutcomes(v => ({ ...v, [c.criterionId]: { documentIndexes: v[c.criterionId]?.documentIndexes ?? [], description: e.target.value } }))} /></label>
      {files.map((file, n) => <label className="checkbox-row" key={n}><input type="checkbox" disabled={busy}
        checked={outcomes[c.criterionId]?.documentIndexes.includes(n) ?? false} onChange={e => setOutcomes(v => ({ ...v, [c.criterionId]: {
          description: v[c.criterionId]?.description ?? '', documentIndexes: e.target.checked ? [...(v[c.criterionId]?.documentIndexes ?? []), n]
            : (v[c.criterionId]?.documentIndexes ?? []).filter(i => i !== n),
        } }))} />Tài liệu {n + 1}: {file.name}</label>)}
    </fieldset>)}
    <label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />
      Tôi đã xem từng file và nội dung trên; đồng ý công khai bản này. Chốt xong không thể thay thế dưới cùng hash.</label>
    <button className="button button--primary" disabled={!valid || busy} onClick={() => void publish()}>{busy ? 'Đang kiểm tra và lưu…' : 'Chốt bản công khai'}</button>
    {error && <p role="alert">{error}</p>}
  </section>
}
