import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { formatUnits } from 'viem'
import { advanceDownloadOriginal, advanceFreezeEvidence, advanceGetEvidenceDraft, advanceGetOriginalManifest, advanceGetPublication,
  advancePublishRedacted, advanceSaveEvidenceDraft, advanceUploadOriginal } from '../../../lib/api/generated/advance'
import type { AdvanceDraft, AdvanceEvidenceDraft, AdvanceOwnerWorkflow, AdvanceUploadOriginalBodyKind } from '../../../lib/api/generated/advance'
import { getErrorMessage } from '../../../lib/api/error'
import deployment from '../../../lib/web3/deployment-context'
import { AdvanceWalletAction } from './AdvanceWalletAction'
import { amountUnits, documentKinds } from './advance-plan'
import { chainDate, ownerActionInput } from './advance-journey'
import { emptyAdvanceEvidence, evidenceTotals, linkEvidenceDocuments, parseAdvancePackage } from './advance-evidence'
import type { EvidenceContent, EvidencePackage } from './advance-evidence'

export function AdvanceEvidence({ data, plan, userId, onRefresh }: { data: AdvanceOwnerWorkflow; plan: AdvanceDraft['content']; userId: string; onRefresh: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  if (!data.snapshot || data.snapshot.campaign.advanced === '0') return null
  const index = selected ?? data.snapshot.campaign.currentStage
  const stage = data.snapshot.stages[Number(index)]
  return <section className="panel"><h2>Hồ sơ thực hiện</h2><label>Đợt báo cáo <select value={index} onChange={e => setSelected(e.target.value)}>
    {plan.stages.map((s, i) => <option key={i} value={i} disabled={data.snapshot!.stages[i].advanced === '0'}>Đợt {i + 1}: {s.title}</option>)}</select></label>
    <p>Đã nộp {stage.latestVersion}/3 phiên bản. Hạn nộp/bổ sung: {chainDate(stage.submissionEnd)} · hạn tuyệt đối: {chainDate(stage.hardStop)}.</p>
    <AdvanceEvidenceStage key={`${userId}:${data.metadataId}:${index}`} data={data} plan={plan} userId={userId} index={index} onRefresh={onRefresh} />
  </section>
}

function AdvanceEvidenceStage({ data, plan, userId, index, onRefresh }: { data: AdvanceOwnerWorkflow; plan: AdvanceDraft['content']; userId: string; index: string; onRefresh: () => void }) {
  const cache = useQueryClient(), key = ['advance-evidence', deployment.deploymentId, userId, data.metadataId, index]
  const [reload, setReload] = useState(0)
  const draft = useQuery({ queryKey: key, retry: false, refetchOnWindowFocus: false, queryFn: async ({ signal }) => {
    try { return await advanceGetEvidenceDraft(data.metadataId, index, { signal }) }
    catch (cause) { if (axios.isAxiosError(cause) && cause.response?.status === 404) return null; throw cause }
  } })
  const stage = data.snapshot!.stages[Number(index)], latest = Number(stage.latestVersion)
  const packages = data.packages.filter(p => p.milestoneIndex === index).sort((a, b) => a.submissionVersion - b.submissionVersion)
  const prepared = packages.find(p => p.submissionVersion === latest + 1)
  const editable = !prepared && data.snapshot!.campaign.currentStage === index && ['EXECUTING', 'SUPPLEMENT_DUE'].includes(data.snapshot!.campaign.state)
    && BigInt(data.checkpoint.chainTimestamp) < BigInt(stage.submissionEnd) && latest < 3
  return <>
    <p>Lưu báo cáo và tải file chưa nộp hồ sơ on-chain. Chốt version sẽ giữ nguyên bytes; bản bổ sung liên kết bản trước và không cấp lại ngân sách.</p>
    {draft.isPending ? <p role="status">Đang tải báo cáo…</p> : draft.isError ? <><p role="alert">{getErrorMessage(draft.error)}</p>
      <button className="button button--secondary" onClick={() => void draft.refetch()}>Tải lại báo cáo</button></>
      : editable ? <AdvanceEvidenceEditor key={`${draft.data?.revision ?? 0}:${reload}`} initial={draft.data} data={data} plan={plan} index={index}
        onSaved={value => { cache.setQueryData(key, value); onRefresh() }} onReload={() => { void draft.refetch().then(() => setReload(v => v + 1)) }} onRefresh={onRefresh} />
        : <p>Báo cáo hiện chỉ đọc. {prepared ? 'Version đã chốt đang chờ nộp.' : 'Chỉ sửa khi đợt hiện tại còn hạn nộp hoặc được yêu cầu bổ sung.'}</p>}
    {packages.map(p => <AdvanceEvidencePackage key={p.id} data={data} packageId={p.id} userId={userId} onRefresh={onRefresh} />)}
  </>
}

function AdvanceEvidenceEditor({ initial, data, plan, index, onSaved, onReload, onRefresh }: { initial: AdvanceEvidenceDraft | null | undefined;
  data: AdvanceOwnerWorkflow; plan: AdvanceDraft['content']; index: string; onSaved: (value: AdvanceEvidenceDraft) => void; onReload: () => void; onRefresh: () => void }) {
  const [content, setContent] = useState<EvidenceContent>(() => initial?.content ?? emptyAdvanceEvidence(plan, Number(index), new Date(Number(BigInt(data.checkpoint.chainTimestamp) * 1000n)).toISOString().slice(0, 10)))
  const [amounts, setAmounts] = useState<Record<string, string>>({}), [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<AdvanceUploadOriginalBodyKind>('REPORT'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [frozen, setFrozen] = useState(false)
  const [revision, setRevision] = useState(initial?.revision ?? 0)
  function readyContent() {
    return linkEvidenceDocuments({ ...content, expenses: content.expenses.map(e => ({ ...e,
      amountMinor: amounts[e.expenseId] === undefined ? e.amountMinor : amounts[e.expenseId] === '0' ? '0' : amountUnits(amounts[e.expenseId]) })) })
  }
  let totals, totalsError = ''
  try { totals = evidenceTotals(readyContent(), plan.stages[Number(index)].budgetUnits) } catch (cause) { totalsError = getErrorMessage(cause) }
  async function perform(action: 'save' | 'upload' | 'freeze') {
    if (busy || frozen) return
    setBusy(true); setError('')
    try {
      const prepared = readyContent(); evidenceTotals(prepared, plan.stages[Number(index)].budgetUnits)
      let saved = await advanceSaveEvidenceDraft(data.metadataId, index, { expectedRevision: revision, content: prepared })
      setRevision(saved.revision); setContent(saved.content); setAmounts({})
      if (action === 'upload') {
        if (!file) throw new Error('Chọn một PDF/JPEG/PNG gốc để tải lên.')
        if (file.size > 10 * 1024 * 1024) throw new Error('File vượt 10 MiB.')
        saved = await advanceUploadOriginal(data.metadataId, index, { expectedRevision: saved.revision, file, kind })
      }
      if (action === 'freeze') {
        await advanceFreezeEvidence(data.metadataId, index, { expectedRevision: saved.revision }); setFrozen(true)
      }
      onSaved(saved); onRefresh()
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  function docChoices(ids: string[], update: (ids: string[]) => void) {
    return <div className="advance-checks">{content.documents.map(d => <label key={d.documentId}><input type="checkbox" checked={ids.includes(d.documentId)}
      onChange={e => update(e.target.checked ? [...ids, d.documentId] : ids.filter(id => id !== d.documentId))} />{d.kind}: {d.originalName}</label>)}</div>
  }
  return <form className="advance-plan-form" onSubmit={e => { e.preventDefault(); void perform('save') }}>
    <fieldset disabled={busy || frozen}><legend>Báo cáo kết quả · revision {revision}</legend>
      <label>Tóm tắt thực hiện<textarea required value={content.report.summary} onChange={e => setContent({ ...content, report: { ...content.report, summary: e.target.value } })} /></label>
      <div className="advance-form-grid"><label>Bắt đầu<input required type="date" value={content.report.performedFrom} onChange={e => setContent({ ...content, report: { ...content.report, performedFrom: e.target.value } })} /></label>
        <label>Kết thúc<input required type="date" value={content.report.performedTo} onChange={e => setContent({ ...content, report: { ...content.report, performedTo: e.target.value } })} /></label>
        <label>Số suất đã bàn giao<input type="number" min="0" required value={content.giftReport.deliveredPackages} onChange={e => setContent({ ...content, giftReport: { ...content.giftReport, deliveredPackages: Number(e.target.value) } })} /></label></div>
      <label>Phạm vi người/đơn vị đã nhận<textarea required value={content.giftReport.recipientScope} onChange={e => setContent({ ...content, giftReport: { ...content.giftReport, recipientScope: e.target.value } })} /></label>
      <div className="advance-form-grid">{(['distributionFrom', 'distributionTo'] as const).map((key, i) => <label key={key}>{i ? 'Trao đến ngày' : 'Trao từ ngày'}<input type="date" required value={content.giftReport[key]} onChange={e => setContent({ ...content, giftReport: { ...content.giftReport, [key]: e.target.value } })} /></label>)}</div>
      <label>Cách bàn giao và căn cứ người ký nhận<textarea required value={content.giftReport.handoverSummary} onChange={e => setContent({ ...content, giftReport: { ...content.giftReport, handoverSummary: e.target.value } })} /></label>
      <label>Giới hạn kiểm tra/điểm chưa xác minh<textarea required value={content.giftReport.limitations} onChange={e => setContent({ ...content, giftReport: { ...content.giftReport, limitations: e.target.value } })} /></label>
      <h3>Kết quả từng tiêu chí</h3><p>Ghi rõ cả phần chưa đạt hoặc chưa có chứng từ. Người xét duyệt sẽ kết luận riêng.</p>
      {content.report.outcomes.map((o, i) => <div className="advance-form-row" key={o.criterionId}><strong>{o.criterionId} · {plan.stages[Number(index)].acceptanceCriteria.find(c => c.criterionId === o.criterionId)?.description}</strong>
        <label>Kết quả và nguồn kiểm tra<textarea required value={o.description} onChange={e => setContent({ ...content, report: { ...content.report, outcomes: content.report.outcomes.map((v, j) => j === i ? { ...v, description: e.target.value } : v) } })} /></label>
        {docChoices(o.documentIds, ids => setContent({ ...content, report: { ...content.report, outcomes: content.report.outcomes.map((v, j) => j === i ? { ...v, documentIds: ids } : v) } }))}</div>)}
      <h3>Chi phí</h3><p>Nhập USDC theo nguồn chi. Tiền tổ chức tự chi được ghi riêng, không làm giảm tiền dư của campaign.</p>
      {content.expenses.map((expense, i) => <div className="advance-form-row" key={expense.expenseId}>
        <label>Nội dung<input required value={expense.description} onChange={e => setContent({ ...content, expenses: content.expenses.map((v, j) => j === i ? { ...v, description: e.target.value } : v) })} /></label>
        <div className="advance-form-grid"><label>Số USDC<input required inputMode="decimal" value={amounts[expense.expenseId] ?? formatUnits(BigInt(expense.amountMinor), 6)} onChange={e => setAmounts({ ...amounts, [expense.expenseId]: e.target.value })} /></label>
          <label>Nguồn chi<select value={expense.fundingSource} onChange={e => setContent({ ...content, expenses: content.expenses.map((v, j) => j === i ? { ...v, fundingSource: e.target.value as typeof v.fundingSource } : v) })}><option value="CAMPAIGN">Quỹ campaign</option><option value="ORGANIZER">Tổ chức tự chi</option><option value="OTHER">Nguồn khác</option></select></label>
          <label>Ngày chi<input type="date" required value={expense.incurredAt} onChange={e => setContent({ ...content, expenses: content.expenses.map((v, j) => j === i ? { ...v, incurredAt: e.target.value } : v) })} /></label></div>
        {docChoices(expense.documentIds, ids => setContent({ ...content, expenses: content.expenses.map((v, j) => j === i ? { ...v, documentIds: ids } : v) }))}
        <button type="button" className="button button--secondary" onClick={() => setContent({ ...content, expenses: content.expenses.filter((_, j) => i !== j) })}>Xóa dòng chi phí</button>
      </div>)}
      <button type="button" className="button button--secondary" onClick={() => setContent({ ...content, expenses: [...content.expenses, { expenseId: crypto.randomUUID(), description: '', amountMinor: '0', currency: 'USDC', minorUnit: 6, incurredAt: content.report.performedTo, documentIds: [], fundingSource: 'CAMPAIGN' }] })}>Thêm chi phí</button>
      {totals && <p>Quỹ campaign đã chi (khai báo): {formatUnits(BigInt(totals.campaign), 6)} · tổ chức tự chi: {formatUnits(BigInt(totals.organizer), 6)} · nguồn khác: {formatUnits(BigInt(totals.other), 6)} USDC.
        {' '}Dư theo báo cáo: {formatUnits(BigInt(totals.unused), 6)} USDC; vượt budget từ nguồn campaign: {formatUnits(BigInt(totals.excess), 6)} USDC. Khoản dư chưa được trả tự động.</p>}
      {totalsError && <p role="alert">{totalsError}</p>}
      <div className="advance-actions"><button className="button button--primary" type="submit">Lưu báo cáo</button>
        <button className="button button--secondary" type="button" onClick={() => void perform('freeze')}>Lưu và chốt phiên bản</button></div>
      <h3>Tài liệu gốc riêng tư · {content.documents.length}/20</h3>
      <p>Điền và lưu báo cáo trước khi tải file; hệ thống kiểm tra định dạng và hash từ bytes.</p>
      {content.documents.map(d => <p key={d.documentId}>{d.kind} · {d.originalName} · {d.byteSize} bytes</p>)}
      <label>Loại chứng từ<select value={kind} onChange={e => setKind(e.target.value as AdvanceUploadOriginalBodyKind)}>{documentKinds.map(k => <option key={k}>{k}</option>)}</select></label>
      <label>PDF/JPEG/PNG · tối đa 10 MiB<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      <button className="button button--secondary" type="button" disabled={!file || content.documents.length >= 20} onClick={() => void perform('upload')}>Lưu và tải bản gốc</button>
    </fieldset>
    {frozen && <p role="status">Đã chốt hồ sơ. Đang tải hash để nộp on-chain…</p>}
    {error && <p role="alert">{error}</p>}
    <button className="button button--secondary" type="button" disabled={busy} onClick={onReload}>Bỏ chỉnh sửa chưa lưu và tải lại revision</button>
  </form>
}

export function AdvanceEvidencePackage({ data, packageId, userId, onRefresh }: { data: AdvanceOwnerWorkflow; packageId: string; userId: string; onRefresh: () => void }) {
  const original = useQuery({ queryKey: ['advance-original-manifest', deployment.deploymentId, userId, packageId], retry: false,
    queryFn: async ({ signal }) => { const v = await advanceGetOriginalManifest(packageId, { signal }); return parseAdvancePackage(v.manifestBytes, v.evidenceHash, data, packageId) } })
  if (original.isPending) return <p role="status">Đang kiểm tra hash hồ sơ đã chốt…</p>
  if (original.isError) return <><p role="alert">{getErrorMessage(original.error)}</p><button className="button button--secondary" onClick={() => void original.refetch()}>Đọc lại hồ sơ</button></>
  return <AdvanceFrozenEvidence data={data} content={original.data} userId={userId} onRefresh={onRefresh} />
}
function AdvanceFrozenEvidence({ data, content, userId, onRefresh }: { data: AdvanceOwnerWorkflow; content: EvidencePackage; userId: string; onRefresh: () => void }) {
  const [files, setFiles] = useState<Record<string, File>>({}), [summary, setSummary] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const publication = useQuery({ queryKey: ['advance-publication', deployment.deploymentId, userId, content.packageId], retry: false,
    queryFn: async ({ signal }) => { try { return await advanceGetPublication(content.packageId, { signal }) }
      catch (cause) { if (axios.isAxiosError(cause) && cause.response?.status === 404) return null; throw cause } } })
  const stage = data.snapshot!.stages[Number(content.milestoneIndex)], pkg = data.packages.find(p => p.id === content.packageId)!
  const submitted = stage.submissions.some(v => Number(v.version) === content.submissionVersion && v.evidenceHash === pkg.evidenceHash)
  async function publish() {
    if (busy || !confirmed) return
    setBusy(true); setError('')
    try {
      const ordered = content.documents.map(d => files[d.documentId])
      if (!summary.trim() || ordered.some(f => !f || f.size > 10 * 1024 * 1024)) throw new Error('Cần tóm tắt và một file đã che dữ liệu cho mỗi bản gốc, tối đa 10 MiB/file.')
      await advancePublishRedacted(content.packageId, { files: ordered, summary, redactionConfirmed: 'true', originalDocumentIds: JSON.stringify(content.documents.map(d => d.documentId)) })
      await publication.refetch(); onRefresh()
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  async function download(id: string) {
    try {
      const blob = await advanceDownloadOriginal(content.packageId, id, { responseType: 'blob' })
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'evidence-original'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (cause) { setError(getErrorMessage(cause)) }
  }
  return <div className="advance-plan-form"><h3>Version {content.submissionVersion} · {submitted ? 'Đã nộp on-chain' : 'Đã chốt, chưa nộp on-chain'}</h3>
    <p className="advance-hash">Hash gốc: {pkg.evidenceHash}</p><p>Package trước: {content.parentPackageId ?? 'Phiên bản đầu tiên'}</p>
    <p>{content.report.summary}</p><p>{content.giftReport.deliveredPackages} suất · {content.giftReport.recipientScope}</p>
    <ul>{content.report.outcomes.map(o => <li key={o.criterionId}>{o.criterionId}: {o.description} · {o.documentIds.length} tài liệu</li>)}</ul>
    {publication.isError ? <><p role="alert">{getErrorMessage(publication.error)}</p><button className="button button--secondary" onClick={() => void publication.refetch()}>Kiểm tra bản công khai lại</button></>
      : publication.data ? <><p className="advance-hash">Hash bản đã che: {publication.data.hash}</p><p>Bản đã che được đọc công khai sau khi hash hồ sơ gốc được nộp canonical; hash bản công khai sẽ được ràng buộc trong kết luận MET.</p></>
        : publication.isPending ? <p role="status">Đang kiểm tra bản đã che…</p>
          : <fieldset disabled={busy}><legend>Chuẩn bị bản công khai đã che dữ liệu</legend>
            <p>Chọn file riêng đã che thông tin cá nhân và dữ liệu nhạy cảm; không tải nguyên bản gốc vào mục công khai.</p>
            {content.documents.map(d => <label key={d.documentId}>{d.kind}: {d.originalName}<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => { const f = e.target.files?.[0]; if (f) setFiles({ ...files, [d.documentId]: f }) }} /></label>)}
            <label>Tóm tắt công khai<textarea value={summary} onChange={e => setSummary(e.target.value)} /></label>
            <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Tôi đã kiểm tra và che dữ liệu nhạy cảm trong tất cả file này.</label>
            <button className="button button--secondary" disabled={!confirmed} onClick={() => void publish()}>Chốt bản công khai</button>
          </fieldset>}
    {content.documents.map(d => <p key={d.documentId}><button className="button button--secondary" onClick={() => void download(d.documentId)}>Tải bản gốc: {d.kind} · {d.originalName}</button></p>)}
    {!submitted && <AdvanceWalletAction metadataId={data.metadataId} label={`Nộp hồ sơ version ${content.submissionVersion} on-chain`} requiredWallet={data.plan.organizer}
      input={{ ...ownerActionInput(data, 'SUBMIT_EVIDENCE'), stage: content.milestoneIndex, packageId: content.packageId }}
      display={{ snapshot: data.snapshot, plan: data.plan, packageHash: pkg.evidenceHash }} onRefresh={onRefresh}
      disabledReason={content.milestoneIndex !== data.snapshot!.campaign.currentStage || content.submissionVersion !== Number(stage.latestVersion) + 1 ? 'Version hoặc đợt không còn là hồ sơ kế tiếp.'
        : !['EXECUTING', 'SUPPLEMENT_DUE'].includes(data.snapshot!.campaign.state) || BigInt(data.checkpoint.chainTimestamp) >= BigInt(stage.submissionEnd) ? 'Đợt không còn trong hạn nộp hồ sơ.' : undefined} />}
    {error && <p role="alert">{error}</p>}
  </div>
}
