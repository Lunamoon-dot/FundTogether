import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import axios from 'axios'
import { parseUnits, formatUnits } from 'viem'
import {
  createCampaignDraft,
  getCampaignDraft,
  updateCampaignDraft,
} from '../../lib/api/campaigns'
import type { CampaignDraftDetail } from '../../lib/api/campaigns'
import { CampaignSubmission } from './CampaignSubmission'
import { getErrorMessage } from '../../lib/api/error'
import { listOrganizations } from '../../lib/api/organizations'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { OrganizationWallet } from '../organizations/OrganizationWallet'

interface Criterion {
  id: string
  description: string
}
interface Milestone {
  id: string
  title: string
  description: string
  budget: string
  criteria: Criterion[]
}

function newMilestone(): Milestone {
  return {
    id: crypto.randomUUID(),
    budget: '',
    title: '',
    description: '',
    criteria: [{ id: crypto.randomUUID(), description: '' }],
  }
}

function campaignMilestones(campaign?: CampaignDraftDetail): Milestone[] {
  return campaign?.milestones.length
    ? campaign.milestones.map((milestone) => ({
        id: milestone.id,
        budget: milestone.budgetUnits ? formatUnits(BigInt(milestone.budgetUnits), 6) : '',
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

function budgetUnits(value: string): bigint | null {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value) || value.length > 85) return null
  const units = parseUnits(value, 6)
  return units > 0n && units <= (1n << 256n) - 1n ? units : null
}

function milestoneErrors(milestone: Milestone) {
  const errors: Record<string, string> = {}
  if (budgetUnits(milestone.budget) === null) errors[`${milestone.id}.budget`] = 'Nhập ngân sách USDC lớn hơn 0, tối đa 6 chữ số thập phân.'
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
  organizationId,
}: {
  onClose: () => void
  onSaved: (campaign: CampaignDraftDetail) => void
  initialCampaign?: CampaignDraftDetail
  organizationId?: string
}) {
  const [baseline, setBaseline] = useState(initialCampaign)
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const { session } = useAccountSession()
  const [step, setStep] = useState(0)
  const organizationQuery = useQuery({ queryKey: ['organizations', session?.userId], queryFn: listOrganizations,
    enabled: step === 2 && Boolean(session), retry: false })
  const organizations = organizationQuery.data ?? []
  const submissionOrganizationId = organizationId ?? baseline?.organizationId ??
    (selectedOrganizationId || (organizations.length === 1 ? organizations[0].id : ''))
  const submissionOrganization = organizations.find(item => item.id === submissionOrganizationId)
  const [title, setTitle] = useState(initialCampaign?.title ?? '')
  const [description, setDescription] = useState(
    initialCampaign?.description ?? '',
  )
  const [milestones, setMilestones] = useState<Milestone[]>(() =>
    campaignMilestones(initialCampaign),
  )
  const [active, setActive] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [bondPopup, setBondPopup] = useState(false)
  const amounts = milestones.map((item) => budgetUnits(item.budget) ?? 0n)
  const goal = amounts.reduce((sum, amount) => sum + amount, 0n)
  const bond = amounts.reduce((max, amount) => amount > max ? amount : max, 0n)
  const [confirmed, setConfirmed] = useState(false)
  const [chainBusy, setChainBusy] = useState(false)
  const frozen = Boolean(baseline && baseline.status !== 'draft')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [latest, setLatest] = useState<CampaignDraftDetail | null>(null)
  const saveController = useRef<AbortController | null>(null)

  useEffect(() => () => saveController.current?.abort(), [])

  async function saveDraft(forSubmission = false) {
    if (forSubmission && frozen) return baseline
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
          budgetUnits: budgetUnits(milestone.budget)!.toString(),
          title: milestone.title,
          description: milestone.description,
          acceptanceCriteria: milestone.criteria.map((criterion) => ({
            criterionId: criterion.id,
            description: criterion.description,
          })),
        })),
      }
      const copyToOrganization = forSubmission && baseline && !baseline.organizationId && submissionOrganizationId
      const saved = baseline && !copyToOrganization
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
        : await createCampaignDraft(input, controller.signal, forSubmission ? submissionOrganizationId : organizationId)
      if (controller.signal.aborted) return
      if (forSubmission) { setBaseline(saved); return saved }
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
      else if (goal > (1n << 256n) - 1n) setErrors({ goal: 'Tổng ngân sách vượt giới hạn cho phép.' })
      else setBondPopup(true)
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
          disabled={saving || chainBusy}
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
      {bondPopup && (
        <div className="bond-overlay">
          <section className="panel bond-dialog" role="dialog" aria-modal="true" aria-labelledby="bond-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setBondPopup(false)
              if (event.key === 'Tab') {
                const buttons = event.currentTarget.querySelectorAll('button')
                const target = event.target
                if (event.shiftKey && target === buttons[0]) { event.preventDefault(); buttons[1].focus() }
                else if (!event.shiftKey && target === buttons[1]) { event.preventDefault(); buttons[0].focus() }
              }
            }}>
            <h2 id="bond-title">Xác nhận bond</h2>
            <p>Bond cần khóa: <strong>{formatUnits(bond, 6)} USDC</strong></p>
            <p>Bằng ngân sách milestone lớn nhất. Tổng goal: {formatUnits(goal, 6)} USDC.</p>
            <p>Bond sẽ được khóa trong escrow bằng giao dịch ví trước khi publish campaign. Việc xác nhận ở đây chưa chuyển token. Bond được hoàn trả theo kết quả campaign và quy tắc giao thức.</p>
            <div className="wizard-actions">
              <button autoFocus type="button" className="button button--secondary" onClick={() => setBondPopup(false)}>Quay lại</button>
              <button type="button" className="button button--primary" onClick={() => { setBondPopup(false); setStep(2) }}>Xác nhận & tiếp tục</button>
            </div>
          </section>
        </div>
      )}
      <form onSubmit={next} noValidate inert={bondPopup}>
        <fieldset className="wizard-fieldset" disabled={saving || chainBusy}>
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
                      <label>
                        Ngân sách (USDC)
                        <input inputMode="decimal" value={milestone.budget}
                          onChange={(event) => updateMilestone(milestone.id, { budget: event.target.value })}
                          placeholder="Ví dụ: 100.50" aria-invalid={Boolean(errors[`${milestone.id}.budget`])} />
                        {fieldError(`${milestone.id}.budget`)}
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
              {fieldError('goal')}
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
                    disabled={frozen || chainBusy}
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
                    disabled={frozen || chainBusy}
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
                    <p>Ngân sách: {milestone.budget} USDC</p>
                    <ul>
                      {milestone.criteria.map((criterion) => (
                        <li key={criterion.id}>{criterion.description}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </section>
              <section className="panel wizard-panel"><p>Tổng goal: {formatUnits(goal, 6)} USDC</p><p>Bond cần khóa: {formatUnits(bond, 6)} USDC</p></section>
              {!organizationId && !baseline?.organizationId && <section className="panel wizard-panel">
                <label>Tổ chức nộp campaign
                  <select value={submissionOrganizationId} onChange={event => setSelectedOrganizationId(event.target.value)}>
                    <option value="">Chọn tổ chức của bạn</option>
                    {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                {organizationQuery.isPending && <p role="status">Đang tải tổ chức…</p>}
                {organizationQuery.isError && <p role="alert">{getErrorMessage(organizationQuery.error)}</p>}
                {organizationQuery.isSuccess && organizations.length === 0 && <p>Bạn chưa có tổ chức. Tạo tổ chức rồi bấm tải lại; nội dung campaign vẫn được giữ tại đây.</p>}
                <button type="button" className="button button--secondary" disabled={organizationQuery.isFetching}
                  onClick={() => void organizationQuery.refetch()}>Tải lại tổ chức</button>
                <p>Chọn tổ chức để nộp nội dung bên trên. Nếu đã lưu nháp cá nhân, hệ thống tạo một bản cho tổ chức khi bạn bấm nộp và giữ bản cá nhân.</p>
                <a href="#/organizations">Tạo hoặc quản lý tổ chức</a>
              </section>}
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
                {submissionOrganizationId
                  ? 'Bạn có thể lưu nháp để mở lại sau. Xác nhận thông tin bên trên để nộp campaign và khóa bond qua ví.'
                  : 'Chọn tổ chức bên trên và xác nhận thông tin để mở phần nộp campaign & khóa bond.'}
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
              disabled={frozen || chainBusy}
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
                  disabled={conflict || frozen}
                >
                  {saving
                    ? 'Đang lưu…'
                    : baseline
                      ? 'Lưu thay đổi'
                      : 'Lưu nháp'}
                </button>
                {!submissionOrganizationId && <button type="button" className="button button--primary" disabled aria-describedby="submission-status">Nộp campaign & khóa bond</button>}

              </div>
            )}
          </div>
        </fieldset>
      </form>
      {step === 2 && (confirmed || frozen) && submissionOrganization && session && <OrganizationWallet
        key={`${session.userId}:${submissionOrganization.id}`} organization={submissionOrganization} userId={session.userId} />}
      {step === 2 && (confirmed || frozen) && submissionOrganizationId && <CampaignSubmission campaign={baseline?.organizationId ? baseline : undefined}
        ensureCampaign={() => saveDraft(true)} onBusyChange={setChainBusy} onPrepared={setBaseline}
        onComplete={(id) => { window.location.hash = `/organizations/${submissionOrganizationId}/workspace/campaigns/${id}` }} />}
    </section>
  )
}
