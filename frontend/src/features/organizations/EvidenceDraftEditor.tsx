import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import type { CampaignMilestoneDraft } from '../../lib/api/campaigns'
import { createEvidenceDraft, getEvidenceDraft, updateEvidenceDraft } from '../../lib/api/evidence-drafts'
import type { EvidenceDraft, EvidenceDraftContent } from '../../lib/api/evidence-drafts'
import { getErrorMessage } from '../../lib/api/error'
import { EvidenceDocuments } from './EvidenceDocuments'
import { EvidenceFreezePanel } from './EvidenceFreezePanel'

export function EvidenceDraftEditor({ organizationId, campaignId, milestone, initialDraft, draftKey }: {
  organizationId: string
  campaignId: string
  milestone: CampaignMilestoneDraft
  initialDraft: EvidenceDraft | null
  draftKey: (string | undefined)[]
}) {
  const [summary, setSummary] = useState(initialDraft?.content.report.summary ?? '')
  const [from, setFrom] = useState(initialDraft?.content.report.performedFrom ?? '')
  const [to, setTo] = useState(initialDraft?.content.report.performedTo ?? '')
  const [results, setResults] = useState<Record<string, string>>(() => Object.fromEntries([
    ...milestone.acceptanceCriteria.map((item) => [item.criterionId, '']),
    ...(initialDraft?.content.report.outcomes ?? []).map((item) => [item.criterionId, item.description]),
  ]))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [milestoneChanged, setMilestoneChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()
  useEffect(() => () => controllerRef.current?.abort(), [])
  const index = String(milestone.milestoneIndex)
  const dirty = summary !== (initialDraft?.content.report.summary ?? '') ||
    from !== (initialDraft?.content.report.performedFrom ?? '') || to !== (initialDraft?.content.report.performedTo ?? '') ||
    milestone.acceptanceCriteria.some((criterion) => (results[criterion.criterionId] ?? '') !==
      (initialDraft?.content.report.outcomes.find((outcome) => outcome.criterionId === criterion.criterionId)?.description ?? ''))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (controllerRef.current || conflict || fileBusy) return
    const invalid: Record<string, string> = {}
    if (!summary.trim()) invalid.summary = 'Nhập nội dung báo cáo.'
    if (!from) invalid.from = 'Chọn ngày bắt đầu.'
    if (!to) invalid.to = 'Chọn ngày kết thúc.'
    if (from && to && from > to) invalid.to = 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'
    const existing = initialDraft?.content.report.outcomes ?? []
    milestone.acceptanceCriteria.forEach((criterion) => {
      if (existing.some((item) => item.criterionId === criterion.criterionId) && !results[criterion.criterionId]?.trim()) {
        invalid[criterion.criterionId] = 'Nhập kết quả cho tiêu chí đã có trong hồ sơ.'
      }
    })
    setErrors(invalid)
    setError('')
    if (Object.keys(invalid).length) return
    // Preserve stored expenses, documents and document references when editing the report.
    const content: EvidenceDraftContent = {
      expenses: initialDraft?.content.expenses ?? [],
      documents: initialDraft?.content.documents ?? [],
      report: {
        summary: summary.trim(), performedFrom: from, performedTo: to,
        outcomes: [
          ...existing.map((item) => ({
            ...item,
            description: milestone.acceptanceCriteria.some((criterion) => criterion.criterionId === item.criterionId)
              ? results[item.criterionId].trim() : item.description,
          })),
          ...milestone.acceptanceCriteria.filter((criterion) =>
            !existing.some((item) => item.criterionId === criterion.criterionId) && results[criterion.criterionId]?.trim(),
          ).map((criterion) => ({
            criterionId: criterion.criterionId, description: results[criterion.criterionId].trim(), documentIds: [],
          })),
        ],
      },
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    try {
      const saved = initialDraft
        ? await updateEvidenceDraft(campaignId, index, initialDraft.revision, content, controller.signal)
        : await createEvidenceDraft(campaignId, index, content, milestone.id, controller.signal)
      if (!controller.signal.aborted) queryClient.setQueryData(draftKey, saved)
    } catch (cause) {
      if (!controller.signal.aborted) {
        const stale = axios.isAxiosError(cause) && cause.response?.status === 409
        const changedMilestone = axios.isAxiosError(cause) &&
          (cause.response?.data?.code === 'MILESTONE_CHANGED' || cause.response?.data?.message === 'Milestone not found')
        setMilestoneChanged(changedMilestone)
        setConflict(stale || changedMilestone)
        setError(changedMilestone
          ? 'Milestone đã thay đổi hoặc bị xóa. Nội dung đang nhập vẫn được giữ; tải lại campaign trước khi lưu.'
          : stale ? 'Hồ sơ đã được lưu hoặc thay đổi ở nơi khác. Nội dung bạn đang nhập vẫn được giữ.' : getErrorMessage(cause))
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      controllerRef.current = null
    }
  }

  async function loadLatest() {
    if (controllerRef.current || !window.confirm('Thay thế nội dung đang nhập bằng hồ sơ mới nhất đã lưu?')) return
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    try {
      const latest = await getEvidenceDraft(campaignId, index, controller.signal)
      if (!controller.signal.aborted) queryClient.setQueryData(draftKey, latest)
    } catch (cause) {
      if (!controller.signal.aborted) setError(getErrorMessage(cause))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      controllerRef.current = null
    }
  }

  return (
    <>
    <section className="panel">
      <div className="organization-card-heading">
        <h2>Milestone {milestone.milestoneIndex + 1}: {milestone.title}</h2>
        <span className="organization-role">{initialDraft ? 'Hồ sơ đã lưu' : 'Chưa có hồ sơ'}</span>
      </div>
      {initialDraft && <p className="muted" role="status">Đã lưu lúc {new Date(initialDraft.updatedAt).toLocaleString()}.</p>}
      <form className="organization-form" onSubmit={(event) => void save(event)}>
        <fieldset className="wizard-fieldset form-grid" disabled={busy || fileBusy}>
          <div className="form-grid">
            <label htmlFor="evidence-summary">Báo cáo công việc</label>
            <textarea id="evidence-summary" value={summary} aria-invalid={Boolean(errors.summary)}
              aria-describedby={errors.summary ? 'summary-error' : undefined} onChange={(event) => setSummary(event.target.value)} />
            {errors.summary && <span id="summary-error" className="field-error">{errors.summary}</span>}
          </div>
          <div className="date-grid">
            <label>Bắt đầu thực hiện
              <input type="date" value={from} aria-invalid={Boolean(errors.from)} onChange={(event) => setFrom(event.target.value)} />
              {errors.from && <span className="field-error">{errors.from}</span>}
            </label>
            <label>Kết thúc thực hiện
              <input type="date" value={to} min={from || undefined} aria-invalid={Boolean(errors.to)} onChange={(event) => setTo(event.target.value)} />
              {errors.to && <span className="field-error">{errors.to}</span>}
            </label>
          </div>
          <div className="form-grid">
            <h3>Kết quả theo tiêu chí</h3>
            <p className="muted">Ghi nhận kết quả thực tế. Có thể bổ sung dần trước khi nộp.</p>
            {milestone.acceptanceCriteria.map((criterion) => (
              <label key={criterion.criterionId}>{criterion.description}
                <textarea value={results[criterion.criterionId] ?? ''} aria-invalid={Boolean(errors[criterion.criterionId])}
                  onChange={(event) => setResults((current) => ({ ...current, [criterion.criterionId]: event.target.value }))} />
                {errors[criterion.criterionId] && <span className="field-error">{errors[criterion.criterionId]}</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted">Hồ sơ vẫn có thể sửa sau khi lưu. Chưa nộp xét duyệt.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="organization-form-actions">
          <button className="button button--primary" type="submit" disabled={busy || fileBusy || conflict}>
            {busy ? 'Đang xử lý…' : 'Lưu hồ sơ'}
          </button>
          {conflict && !milestoneChanged && <button className="button button--secondary" type="button" disabled={busy || fileBusy}
            onClick={() => void loadLatest()}>Tải bản mới nhất</button>}
          {milestoneChanged && <button className="button button--secondary" type="button" disabled={busy || fileBusy}
            onClick={() => {
              if (window.confirm('Tải lại campaign sẽ bỏ nội dung chưa lưu. Tiếp tục?')) window.location.reload()
            }}>Tải lại campaign</button>}
        </div>
      </form>
    </section>
    {initialDraft ? <EvidenceDocuments campaignId={campaignId} draft={initialDraft} draftKey={draftKey}
      disabled={dirty || busy || conflict} onBusy={setFileBusy} onConflict={() => {
        setConflict(true)
        setError('Hồ sơ đã thay đổi. Tải bản mới nhất trước khi tiếp tục.')
      }} /> : <section className="panel"><h2>Tài liệu</h2><p className="muted">Lưu hồ sơ trước khi thêm tài liệu.</p></section>}
    <EvidenceFreezePanel organizationId={organizationId} campaignId={campaignId} milestone={milestone}
      draft={initialDraft} draftKey={draftKey} dirty={dirty} disabled={busy || fileBusy || conflict} />
    </>
  )
}
