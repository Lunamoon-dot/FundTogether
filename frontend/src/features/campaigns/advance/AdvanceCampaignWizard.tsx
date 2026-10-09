import { useState } from 'react'
import type { FormEvent } from 'react'
import { advanceCreateCampaign, advanceGetDraft, advanceUpdateDraft } from '../../../lib/api/generated/advance'
import type { AdvanceDraft } from '../../../lib/api/generated/advance'
import { getErrorMessage } from '../../../lib/api/error'
import { documentKinds, editGiftPlan, giftFormInput, giftTemplate } from './advance-plan'
import type { GiftForm } from './advance-plan'

export function AdvanceCampaignWizard({ organizationId, initialCampaign, onSaved, onClose }: {
  organizationId: string; initialCampaign?: AdvanceDraft; onSaved: (campaign: AdvanceDraft) => void; onClose: () => void
}) {
  const [baseline, setBaseline] = useState(initialCampaign)
  const [form, setForm] = useState<GiftForm>(() => initialCampaign ? editGiftPlan(initialCampaign.content) : giftTemplate(1))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const field = <K extends keyof GiftForm>(key: K, value: GiftForm[K]) => setForm(current => ({ ...current, [key]: value }))
  const stage = (index: number, change: Partial<GiftForm['stages'][number]>) => setForm(current => ({ ...current,
    stages: current.stages.map((s, i) => i === index ? { ...s, ...change } : s) }))
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || baseline?.frozen) return
    setBusy(true); setError('')
    try {
      const content = giftFormInput(form)
      const saved = baseline ? await advanceUpdateDraft(baseline.id, { ...content, expectedRevision: baseline.revision })
        : await advanceCreateCampaign(organizationId, content)
      onSaved(saved)
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  async function reload() {
    if (!baseline || busy) return
    setBusy(true)
    try { const saved = await advanceGetDraft(baseline.id); setBaseline(saved); setForm(editGiftPlan(saved.content)); setError('') }
    catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  return <form className="panel advance-plan-form" onSubmit={save}>
    <h1>{baseline ? 'Chỉnh kế hoạch mua và trao quà' : 'Tạo campaign mua và trao quà'}</h1>
    <p>Ngân sách được cấp trước theo từng đợt. Chỉ mở đợt tiếp sau nghiệm thu và xử lý tiền dư.</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}
    <fieldset disabled={busy || baseline?.frozen}>
      <legend>Thông tin và phạm vi</legend>
      {!baseline && <label>Mẫu khởi đầu<select aria-label="Mẫu khởi đầu" onChange={e => {
        const template = giftTemplate(e.target.value === '3' ? 3 : 1)
        setForm(current => ({ ...current, channel: template.channel, stages: template.stages }))
      }}><option value="1">G1 · một đợt qua đơn vị</option><option value="3">G2 · ba đợt trao trực tiếp</option></select></label>}
      <label>Tên campaign<input required maxLength={200} value={form.title} onChange={e => field('title', e.target.value)} /></label>
      <label>Mục tiêu và hoạt động<textarea required value={form.description} onChange={e => field('description', e.target.value)} /></label>
      <label>Kênh tiếp nhận<select value={form.channel} onChange={e => field('channel', e.target.value as GiftForm['channel'])}>
        <option value="INSTITUTION">Qua đơn vị tiếp nhận</option><option value="DIRECT">Trao trực tiếp</option></select></label>
      <label>Phạm vi đối tượng nhận<textarea required value={form.recipientScope} onChange={e => field('recipientScope', e.target.value)} /></label>
      <p className="muted">Mô tả nhóm nhận và thẩm quyền ký nhận. Việc đơn vị đã nhận không tự chứng minh từng cá nhân đã nhận quà.</p>
      <label>Căn cứ tổ chức đủ điều kiện thực hiện<textarea required value={form.eligibilityBasis} onChange={e => field('eligibilityBasis', e.target.value)} /></label>
      <label>Số ngày gây quỹ<input type="number" min={1} max={30} required value={Number(form.fundingDuration) / 86400 || ''}
        onChange={e => field('fundingDuration', /^\d+$/.test(e.target.value) ? (BigInt(e.target.value) * 86400n).toString() : '0')} /></label>
    </fieldset>
    {form.stages.map((s, i) => <fieldset key={s.id ?? i} disabled={busy || baseline?.frozen}>
      <legend>Đợt {i + 1}</legend>
      <div className="advance-form-grid">
        <label>Tên đợt<input required maxLength={200} value={s.title} onChange={e => stage(i, { title: e.target.value })} /></label>
        <label>Ngân sách (USDC)<input required inputMode="decimal" value={s.budget} onChange={e => stage(i, { budget: e.target.value })} /></label>
        <label>Số suất<input required type="number" min={1} value={s.targetPackages} onChange={e => stage(i, { targetPackages: Number(e.target.value) })} /></label>
      </div>
      <label>Công việc cần hoàn thành<textarea required value={s.description} onChange={e => stage(i, { description: e.target.value })} /></label>
      <label>Hàng hóa mỗi suất<textarea required value={s.goods} onChange={e => stage(i, { goods: e.target.value })} /></label>
      <h3>Tiêu chí nghiệm thu</h3>
      {s.acceptanceCriteria.map((criterion, ci) => <div className="advance-form-row" key={criterion.criterionId}>
        <label>Tiêu chí {ci + 1}<textarea required value={criterion.description} onChange={e => stage(i, {
          acceptanceCriteria: s.acceptanceCriteria.map((c, n) => n === ci ? { ...c, description: e.target.value } : c) })} /></label>
        <div className="advance-checks" role="group" aria-label={`Tài liệu cho tiêu chí ${ci + 1}`}>
          {documentKinds.map(kind => <label key={kind}><input type="checkbox" checked={criterion.requiredDocuments.includes(kind)} onChange={e => stage(i, {
            acceptanceCriteria: s.acceptanceCriteria.map((c, n) => n !== ci ? c : { ...c, requiredDocuments: e.target.checked
              ? [...c.requiredDocuments, kind] : c.requiredDocuments.filter(k => k !== kind) }) })} />{kind}</label>)}
        </div>
        <button type="button" className="button button--secondary" disabled={s.acceptanceCriteria.length === 1} onClick={() => stage(i, {
          acceptanceCriteria: s.acceptanceCriteria.filter((_, n) => n !== ci),
          tasks: s.tasks.map(t => ({ ...t, criterionIds: t.criterionIds.filter(id => id !== criterion.criterionId) })) })}>Bỏ tiêu chí</button>
      </div>)}
      <button type="button" className="button button--secondary" onClick={() => stage(i, { acceptanceCriteria: [...s.acceptanceCriteria,
        { criterionId: crypto.randomUUID(), description: '', requiredDocuments: ['REPORT'] }] })}>Thêm tiêu chí</button>
      <h3>Công việc và tiêu chí liên quan</h3>
      {s.tasks.map((task, ti) => <div className="advance-form-row" key={task.taskId}>
        <label>Công việc {ti + 1}<input required value={task.description} onChange={e => stage(i, { tasks: s.tasks.map((t, n) => n === ti ? { ...t, description: e.target.value } : t) })} /></label>
        <div className="advance-checks">{s.acceptanceCriteria.map((c, ci) => <label key={c.criterionId}><input type="checkbox" checked={task.criterionIds.includes(c.criterionId)}
          onChange={e => stage(i, { tasks: s.tasks.map((t, n) => n !== ti ? t : { ...t, criterionIds: e.target.checked ? [...t.criterionIds, c.criterionId]
            : t.criterionIds.filter(id => id !== c.criterionId) }) })} />Tiêu chí {ci + 1}</label>)}</div>
        <button type="button" className="button button--secondary" disabled={s.tasks.length === 1} onClick={() => stage(i, { tasks: s.tasks.filter((_, n) => n !== ti) })}>Bỏ công việc</button>
      </div>)}
      <button type="button" className="button button--secondary" onClick={() => stage(i, { tasks: [...s.tasks,
        { taskId: crypto.randomUUID(), description: '', criterionIds: [] }] })}>Thêm công việc</button>
      <button type="button" className="button button--secondary" disabled={form.stages.length === 1} onClick={() => field('stages', form.stages.filter((_, n) => n !== i))}>Bỏ đợt {i + 1}</button>
    </fieldset>)}
    <div className="advance-actions">
      <button type="button" className="button button--secondary" disabled={busy || baseline?.frozen} onClick={() => {
        const next = giftTemplate(1).stages[0]
        const ids = new Map(next.acceptanceCriteria.map(c => [c.criterionId, crypto.randomUUID()]))
        field('stages', [...form.stages, { ...next, title: `Đợt ${form.stages.length + 1}`, acceptanceCriteria: next.acceptanceCriteria.map(c => ({ ...c, criterionId: ids.get(c.criterionId)! })),
          tasks: next.tasks.map(t => ({ ...t, taskId: crypto.randomUUID(), criterionIds: t.criterionIds.map(id => ids.get(id)!) })) }])
      }}>Thêm đợt</button>
      <button type="submit" className="button button--primary" disabled={busy || baseline?.frozen}>{busy ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
      {baseline && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void reload()}>Tải lại bản trên máy chủ</button>}
      <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>Quay lại</button>
    </div>
  </form>
}
