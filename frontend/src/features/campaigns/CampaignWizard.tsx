import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  createCampaignDraft,
  getCampaignDraft,
  updateCampaignDraft,
} from '../../lib/api/campaigns'
import type { CampaignDraftDetail } from '../../lib/api/campaigns'
import { getErrorMessage } from '../../lib/api/error'

interface Criterion {
  id: string
  description: string
}
interface Milestone {
  id: string
  title: string
  description: string
  criteria: Criterion[]
}

function newMilestone(): Milestone {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    criteria: [{ id: crypto.randomUUID(), description: '' }],
  }
}

function campaignMilestones(campaign?: CampaignDraftDetail): Milestone[] {
  return campaign?.milestones.length
    ? campaign.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        description: milestone.description ?? '',
        criteria: milestone.acceptanceCriteria.length
          ? milestone.acceptanceCriteria.map((criterion) => ({
              id: criterion.criterionId,
              description: criterion.description,
            }))
          : [{ id: crypto.randomUUID(), description: '' }],
      }))
    : [newMilestone()]
}

function milestoneErrors(milestone: Milestone) {
  const errors: Record<string, string> = {}
  if (!milestone.title.trim())
    errors[`${milestone.id}.title`] = 'Nhập tên milestone.'
  if (!milestone.description.trim())
    errors[`${milestone.id}.description`] = 'Mô tả công việc cần thực hiện.'
  milestone.criteria.forEach((criterion) => {
    if (!criterion.description.trim())
      errors[criterion.id] = 'Nhập tiêu chí hoàn thành.'
  })
  return errors
}

export function CampaignWizard({
  onClose,
  onSaved,
  initialCampaign,
}: {
  onClose: () => void
  onSaved: (campaign: CampaignDraftDetail) => void
  initialCampaign?: CampaignDraftDetail
}) {
  const [baseline, setBaseline] = useState(initialCampaign)
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState(initialCampaign?.title ?? '')
  const [description, setDescription] = useState(
    initialCampaign?.description ?? '',
  )
  const [milestones, setMilestones] = useState<Milestone[]>(() =>
    campaignMilestones(initialCampaign),
  )
  const [active, setActive] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [latest, setLatest] = useState<CampaignDraftDetail | null>(null)
  const saveController = useRef<AbortController | null>(null)

  useEffect(() => () => saveController.current?.abort(), [])

  async function saveDraft() {
    if (saveController.current) return
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true)
    setSaveError('')
    try {
      const input = {
        title,
        description,
        milestones: milestones.map((milestone) => ({
          title: milestone.title,
          description: milestone.description,
          acceptanceCriteria: milestone.criteria.map((criterion) => ({
            criterionId: criterion.id,
            description: criterion.description,
          })),
        })),
      }
      const saved = baseline
        ? await updateCampaignDraft(
            baseline.id,
            {
              ...input,
              expectedRevision: baseline.revision,
              milestones: input.milestones.map((milestone, index) => ({
                ...milestone,
                id: baseline.milestones.some(
                  (item) => item.id === milestones[index].id,
                )
                  ? milestones[index].id
                  : undefined,
              })),
            },
            controller.signal,
          )
        : await createCampaignDraft(input, controller.signal)
      if (controller.signal.aborted) return
      setStep(0)
      setTitle('')
      setDescription('')
      setMilestones([newMilestone()])
      setActive(0)
      setErrors({})
      setConfirmed(false)
      onSaved(saved)
    } catch (cause) {
      if (!controller.signal.aborted) {
        const stale =
          axios.isAxiosError(cause) &&
          cause.response?.status === 409 &&
          cause.response.data?.code === 'CAMPAIGN_NOT_EDITABLE_OR_STALE'
        setConflict(stale)
        setSaveError(
          stale
            ? 'Bản đã lưu đã thay đổi hoặc không còn được sửa. Nội dung bạn đang nhập vẫn được giữ; xem bản mới nhất trước khi tiếp tục.'
            : getErrorMessage(cause),
        )
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false)
      saveController.current = null
    }
  }

  async function viewLatest() {
    if (!baseline || saveController.current) return
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true)
    try {
      const loaded = await getCampaignDraft(baseline.id, controller.signal)
      if (!controller.signal.aborted) setLatest(loaded)
    } catch (cause) {
      if (!controller.signal.aborted) setSaveError(getErrorMessage(cause))
    } finally {
      if (!controller.signal.aborted) setSaving(false)
      saveController.current = null
    }
  }

  function useLatest() {
    if (!latest) return
    setBaseline(latest)
    setTitle(latest.title)
    setDescription(latest.description ?? '')
    setMilestones(campaignMilestones(latest))
    setActive(0)
    setStep(0)
    setErrors({})
    setConfirmed(false)
    setSaveError('')
    setConflict(false)
    setLatest(null)
  }

  function edited() {
    setErrors({})
    setConfirmed(false)
    if (!conflict) setSaveError('')
  }

  function updateMilestone(id: string, update: Partial<Milestone>) {
    setMilestones((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    )
    edited()
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 0) {
      const nextErrors: Record<string, string> = {}
      if (!title.trim()) nextErrors.title = 'Nhập tên campaign.'
      if (!description.trim())
        nextErrors.description = 'Mô tả mục đích của campaign.'
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length === 0) setStep(1)
    } else if (step === 1) {
      const nextErrors = Object.assign({}, ...milestones.map(milestoneErrors))
      setErrors(nextErrors)
      const invalid = milestones.findIndex(
        (item) => Object.keys(milestoneErrors(item)).length > 0,
      )
      if (invalid >= 0) setActive(invalid)
      else setStep(2)
    }
  }

  function addMilestone() {
    const invalid = milestones.findIndex(
      (item) => Object.keys(milestoneErrors(item)).length > 0,
    )
    if (invalid >= 0) {
      setActive(invalid)
      setErrors(milestoneErrors(milestones[invalid]))
      return
    }
    setMilestones((current) => [...current, newMilestone()])
    setActive(milestones.length)
    edited()
  }

  function removeMilestone(index: number) {
    setMilestones((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )
    setActive(
      Math.min(active > index ? active - 1 : active, milestones.length - 2),
    )
    edited()
  }

  function fieldError(key: string) {
    return errors[key] ? (
      <span className="field-error" id={`error-${key}`}>
        {errors[key]}
      </span>
    ) : null
  }

  return (
    <section
      className="campaign-wizard"
      aria-label={baseline ? 'Chỉnh sửa campaign' : 'Tạo campaign'}
    >
      <div className="wizard-toolbar">
        <button
          type="button"
          className="button button--quiet"
          onClick={onClose}
          disabled={saving}
        >
          ← Campaigns
        </button>
        <span className="small-copy">Create campaign</span>
      </div>
      <ol className="wizard-steps" aria-label="Các bước tạo campaign">
        {['Thông tin', 'Milestones', 'Xem lại & xác nhận'].map(
          (label, index) => (
            <li
              key={label}
              className={
                index === step
                  ? 'is-current'
                  : index < step
                    ? 'is-complete'
                    : ''
              }
              aria-current={index === step ? 'step' : undefined}
            >
              <span>{index < step ? '✓' : index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <form onSubmit={next} noValidate>
        <fieldset className="wizard-fieldset" disabled={saving}>
          {step === 0 && (
            <section className="panel wizard-panel form-grid">
              <label>
                Tên campaign
                <input
                  autoFocus
                  maxLength={200}
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    edited()
                  }}
                  placeholder="Ví dụ: Nước sạch cho trường học"
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? 'error-title' : undefined}
                />
                {fieldError('title')}
              </label>
              <label>
                Mô tả
                <textarea
                  rows={5}
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value)
                    edited()
                  }}
                  placeholder="Campaign giúp ai và muốn đạt được điều gì?"
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={
                    errors.description ? 'error-description' : undefined
                  }
                />
                {fieldError('description')}
              </label>
            </section>
          )}

          {step === 1 && (
            <div className="milestone-editor">
              {milestones.map((milestone, index) => (
                <section className="panel milestone-card" key={milestone.id}>
                  <div className="milestone-card-heading">
                    <button
                      type="button"
                      className="milestone-toggle"
                      aria-expanded={active === index}
                      aria-controls={`milestone-${milestone.id}`}
                      onClick={() => setActive(index)}
                    >
                      <span className="milestone-number">{index + 1}</span>
                      <span>
                        <strong>Milestone {index + 1}</strong>
                        {active !== index && (
                          <span className="milestone-preview">
                            {milestone.title || 'Chưa điền thông tin'}
                          </span>
                        )}
                      </span>
                      <span className="milestone-chevron" aria-hidden="true">
                        {active === index ? '−' : '+'}
                      </span>
                    </button>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        className="button button--quiet"
                        aria-label={`Xóa milestone ${index + 1}`}
                        onClick={() => removeMilestone(index)}
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                  {active === index && (
                    <div
                      id={`milestone-${milestone.id}`}
                      className="form-grid milestone-fields"
                    >
                      <label>
                        Tên milestone
                        <input
                          maxLength={200}
                          value={milestone.title}
                          onChange={(event) =>
                            updateMilestone(milestone.id, {
                              title: event.target.value,
                            })
                          }
                          placeholder="Ví dụ: Lắp đặt hệ thống lọc"
                          aria-invalid={Boolean(
                            errors[`${milestone.id}.title`],
                          )}
                          aria-describedby={
                            errors[`${milestone.id}.title`]
                              ? `error-${milestone.id}.title`
                              : undefined
                          }
                        />
                        {fieldError(`${milestone.id}.title`)}
                      </label>
                      <label>
                        Công việc dự kiến
                        <textarea
                          rows={3}
                          value={milestone.description}
                          onChange={(event) =>
                            updateMilestone(milestone.id, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Mô tả công việc sẽ thực hiện trong giai đoạn này"
                          aria-invalid={Boolean(
                            errors[`${milestone.id}.description`],
                          )}
                          aria-describedby={
                            errors[`${milestone.id}.description`]
                              ? `error-${milestone.id}.description`
                              : undefined
                          }
                        />
                        {fieldError(`${milestone.id}.description`)}
                      </label>
                      <fieldset className="criteria-editor">
                        <legend>Tiêu chí hoàn thành</legend>
                        {milestone.criteria.map((criterion, criterionIndex) => (
                          <div key={criterion.id} className="criterion-row">
                            <label>
                              <span className="sr-only">
                                Tiêu chí {criterionIndex + 1} của milestone{' '}
                                {index + 1}
                              </span>
                              <input
                                value={criterion.description}
                                onChange={(event) =>
                                  updateMilestone(milestone.id, {
                                    criteria: milestone.criteria.map((item) =>
                                      item.id === criterion.id
                                        ? {
                                            ...item,
                                            description: event.target.value,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                                placeholder={`Tiêu chí ${criterionIndex + 1}: Kết quả có thể kiểm tra được`}
                                aria-invalid={Boolean(errors[criterion.id])}
                                aria-describedby={
                                  errors[criterion.id]
                                    ? `error-${criterion.id}`
                                    : undefined
                                }
                              />
                              {fieldError(criterion.id)}
                            </label>
                            {milestone.criteria.length > 1 && (
                              <button
                                className="button button--quiet"
                                type="button"
                                aria-label={`Xóa tiêu chí ${criterionIndex + 1}`}
                                onClick={() =>
                                  updateMilestone(milestone.id, {
                                    criteria: milestone.criteria.filter(
                                      (item) => item.id !== criterion.id,
                                    ),
                                  })
                                }
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            updateMilestone(milestone.id, {
                              criteria: [
                                ...milestone.criteria,
                                { id: crypto.randomUUID(), description: '' },
                              ],
                            })
                          }
                        >
                          + Thêm tiêu chí
                        </button>
                      </fieldset>
                    </div>
                  )}
                </section>
              ))}
              <button
                type="button"
                className="add-milestone"
                onClick={addMilestone}
              >
                + Add milestone
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="campaign-review">
              <section className="panel wizard-panel">
                <div className="panel-heading">
                  <h2>Thông tin campaign</h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setStep(0)
                      setConfirmed(false)
                    }}
                  >
                    Chỉnh sửa
                  </button>
                </div>
                <h3>{title}</h3>
                <p className="review-description">{description}</p>
              </section>
              <section className="panel wizard-panel">
                <div className="panel-heading">
                  <h2>Milestones ({milestones.length})</h2>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setStep(1)
                      setConfirmed(false)
                    }}
                  >
                    Chỉnh sửa
                  </button>
                </div>
                {milestones.map((milestone, index) => (
                  <article key={milestone.id} className="review-milestone">
                    <h3>
                      {index + 1}. {milestone.title}
                    </h3>
                    <p className="review-description">
                      {milestone.description}
                    </p>
                    <ul>
                      {milestone.criteria.map((criterion) => (
                        <li key={criterion.id}>{criterion.description}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </section>
              <label className="confirmation-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  Tôi đã kiểm tra thông tin và tiêu chí của các milestones.
                </span>
              </label>
              <p className="submission-unavailable" id="submission-status">
                Bạn có thể lưu nháp để mở lại sau. Nộp hồ sơ để xét duyệt chưa
                khả dụng; lưu nháp không phải nộp campaign.
              </p>
            </div>
          )}

          {saveError && (
            <div className="toast toast--error" role="alert">
              {saveError}
            </div>
          )}
          {conflict && (
            <section className="panel">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void viewLatest()}
              >
                Xem bản mới nhất
              </button>
              {latest && (
                <>
                  <h3>{latest.title}</h3>
                  <p className="review-description">{latest.description}</p>
                  {latest.milestones.map((milestone) => (
                    <article className="review-milestone" key={milestone.id}>
                      <h3>
                        {milestone.milestoneIndex + 1}. {milestone.title}
                      </h3>
                      <p className="review-description">
                        {milestone.description}
                      </p>
                      <ul>
                        {milestone.acceptanceCriteria.map((criterion) => (
                          <li key={criterion.criterionId}>
                            {criterion.description}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={useLatest}
                  >
                    Bỏ nội dung đang sửa, dùng bản này
                  </button>
                </>
              )}
            </section>
          )}
          <div className="wizard-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                if (step > 0) setStep(step - 1)
                else onClose()
              }}
            >
              {step > 0 ? 'Back' : 'Đóng'}
            </button>
            {step < 2 ? (
              <button className="button button--primary" type="submit">
                {step === 0 ? 'Next → Milestones' : 'Next → Xem lại'}
              </button>
            ) : (
              <div className="wizard-final-actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void saveDraft()}
                  disabled={conflict}
                >
                  {saving
                    ? 'Đang lưu…'
                    : baseline
                      ? 'Lưu thay đổi'
                      : 'Lưu nháp'}
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  disabled
                  aria-describedby="submission-status"
                >
                  Nộp campaign
                </button>
              </div>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  )
}
