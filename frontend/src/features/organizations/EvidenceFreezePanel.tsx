import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CampaignMilestoneDraft } from '../../lib/api/campaigns'
import type { EvidenceDraft } from '../../lib/api/evidence-drafts'
import { downloadFrozenEvidenceManifest, freezeEvidenceDraft, listFrozenEvidencePackages } from '../../lib/api/evidence-drafts'
import { getPublication } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { PublicEvidenceForm } from './PublicEvidenceForm'
import { MilestoneWorkflow } from '../campaigns/MilestoneWorkflow'

export function EvidenceFreezePanel({ organizationId, campaignId, milestone, draft, draftKey, dirty, disabled }: {
  organizationId: string; campaignId: string; milestone: CampaignMilestoneDraft; draft: EvidenceDraft | null
  draftKey: (string | undefined)[]; dirty: boolean; disabled: boolean
}) {
  const { session } = useAccountSession()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const index = String(milestone.milestoneIndex)
  const packagesKey = [...draftKey, 'packages']
  const publication = useQuery({ queryKey: ['campaign-publication', session?.userId, campaignId],
    queryFn: ({ signal }) => getPublication(campaignId, signal), enabled: Boolean(session), retry: false, refetchInterval: 10_000 })
  const packages = useQuery({ queryKey: packagesKey, queryFn: ({ signal }) => listFrozenEvidencePackages(campaignId, index, signal),
    enabled: Boolean(draft), retry: false })
  const latest = packages.data?.[0]
  const missing = draft ? [
    ...(!draft.content.documents.length ? ['ít nhất một tài liệu'] : []),
    ...milestone.acceptanceCriteria.filter(criterion => !draft.content.report.outcomes.some(outcome =>
      outcome.criterionId === criterion.criterionId && outcome.description.trim())).map(criterion => `kết quả: ${criterion.description}`),
  ] : []
  const canFreeze = ['FUNDED', 'MILESTONE_ACTIVE', 'MILESTONE_SETTLED'].includes(publication.data?.state ?? '')

  async function freeze() {
    if (!draft || busy || dirty || disabled || !canFreeze || missing.length) return
    setBusy(true); setError('')
    try {
      await freezeEvidenceDraft(campaignId, index, draft.revision)
      await queryClient.invalidateQueries({ queryKey: packagesKey })
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function downloadManifest() {
    if (!latest || busy) return
    setBusy(true); setError('')
    try {
      const blob = await downloadFrozenEvidenceManifest(campaignId, index, latest.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `evidence-${latest.id}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <><section className="panel" aria-labelledby="evidence-freeze-title">
    <h2 id="evidence-freeze-title">Chốt hồ sơ bằng chứng</h2>
    <p className="muted">Bản nháp và file gốc hiện chỉ người có quyền quản lý xem được. Đóng băng sẽ kiểm tra lại file, lưu nguyên văn manifest và tạo SHA-256 cố định; bước này chưa gửi giao dịch lên blockchain.</p>
    {publication.isPending ? <p role="status">Đang kiểm tra trạng thái milestone…</p>
      : publication.isError ? <><p role="alert">{getErrorMessage(publication.error)}</p>
        <button className="button button--secondary" onClick={() => void publication.refetch()}>Thử lại</button></>
        : <p>Trạng thái đã đồng bộ: <strong>{publication.data.state ?? 'Chưa có dữ liệu'}</strong>
          {publication.data.indexedBlock && ` · block ${publication.data.indexedBlock}`}</p>}
    {canFreeze && publication.data?.state !== 'MILESTONE_ACTIVE' && <p role="status">Có thể chốt hồ sơ trước khi kích hoạt milestone. Việc nộp bằng chứng lên chain là bước riêng.</p>}
    {!canFreeze && publication.data && <p role="status">Campaign chưa ở giai đoạn chuẩn bị bằng chứng. <a
      href={`#/organizations/${organizationId}/workspace/campaigns/${campaignId}`}>Mở campaign để kiểm tra</a>.</p>}
    {!draft ? <p>Lưu báo cáo trước khi đóng băng.</p> : <>
      {dirty && <p role="status">Báo cáo có thay đổi chưa lưu. Lưu trước khi đóng băng.</p>}
      {missing.length > 0 && <p role="status">Còn thiếu: {missing.join('; ')}.</p>}
      {packages.isError && <p role="alert">Chưa đọc được các bản đã đóng băng: {getErrorMessage(packages.error)}</p>}
      {latest && <p>Gói gần nhất: phiên bản dự kiến {latest.submissionVersion}, từ bản nháp #{latest.draftRevision}<br />
        SHA-256: <code className="public-wallet-address">{latest.evidenceHash}</code><br />
        {latest.draftRevision === draft.revision ? 'Bản nháp hiện tại đã được đóng băng; có thể kiểm tra lại nếu phiên bản on-chain thay đổi.' : 'Bản nháp đã thay đổi; gói trước vẫn được giữ nguyên.'}</p>}
      {latest && <button className="button button--secondary" type="button" disabled={busy}
        onClick={() => void downloadManifest()}>Tải manifest gốc</button>}
      <button className="button button--primary" disabled={busy || disabled || dirty || !canFreeze || Boolean(missing.length) || packages.isPending || packages.isError}
        onClick={() => void freeze()}>
        {busy ? 'Đang kiểm tra và đóng băng…' : latest?.draftRevision === draft.revision ? 'Kiểm tra lại phiên bản' : 'Đóng băng hồ sơ hiện tại'}</button>
      {error && <p role="alert">{error}</p>}
    </>}
    <p className="muted">Đóng băng bản gốc chưa gửi giao dịch. Với deployment MVP, tạo bản công khai bên dưới rồi ký nộp; resolver tiếp nhận mới mở review 72 giờ.</p>
  </section>
    {latest && !dirty && latest.draftRevision === draft?.revision && <PublicEvidenceForm key={latest.id} campaignId={campaignId} milestone={milestone} frozen={latest} />}
    <MilestoneWorkflow campaignId={campaignId} index={index} />
  </>
}
