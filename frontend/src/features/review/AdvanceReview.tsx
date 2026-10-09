import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { formatUnits, sha256, toHex } from 'viem'
import { advanceDownloadOriginal, advanceDownloadPublic, advanceGetEvents, advanceGetOriginalManifest, advanceGetPublication, advanceGetWorkflow, advanceReviewQueue } from '../../lib/api/generated/advance'
import type { AdvanceOwnerWorkflow, AdvanceReviewInput, GiftDraft } from '../../lib/api/generated/advance'
import type { AccountSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'
import deployment from '../../lib/web3/deployment-context'
import { AdvanceWalletAction, AdvanceTransactionHistory } from '../campaigns/advance/AdvanceWalletAction'
import { AdvanceRecord } from '../campaigns/advance/AdvanceRecord'
import { parseAdvancePackage } from '../campaigns/advance/advance-evidence'
import type { EvidencePackage } from '../campaigns/advance/advance-evidence'
import { chainDate, ownerActionInput } from '../campaigns/advance/advance-journey'
import { amountUnits } from '../campaigns/advance/advance-plan'
import { AdvanceVerificationHistory } from './AdvanceOrganizationVerification'
import { criterionReviewReason, reviewAction, reviewOutcomeLabels, reviewOutcomes, reviewSources } from './advance-review'
import '../campaigns/advance/advance.css'

export function AdvanceReview({ session, metadataId }: { session: AccountSession; metadataId?: string }) {
  const queue = useQuery({ queryKey: ['advance-review-queue', deployment.deploymentId, session.userId], enabled: !metadataId && session.roles.includes('RESOLVER'), retry: false,
    queryFn: ({ signal }) => advanceReviewQueue({ signal }), refetchInterval: 10000 })
  if (!session.roles.includes('RESOLVER')) return <section className="panel"><h1>Xét duyệt campaign</h1><p>Cần account role RESOLVER. ADMIN xác thực tổ chức ở mục riêng.</p></section>
  if (metadataId) return <AdvanceReviewDetail key={`${session.userId}:${metadataId}`} session={session} metadataId={metadataId} />
  return <section className="panel"><h1>Campaign đã nộp · workflow B</h1><p>Quyền đọc hàng chờ theo tài khoản RESOLVER. Ký quyết định cần SIWE đúng ví được cấu hình.</p>
    <p className="advance-hash">Ví ký bắt buộc: {deployment.resolver} · mạng {deployment.chainId}</p>
    {queue.isPending ? <p role="status">Đang tải hàng chờ…</p> : queue.isError ? <><p role="alert">{getErrorMessage(queue.error)}</p><button className="button button--secondary" onClick={() => void queue.refetch()}>Tải lại</button></>
      : !queue.data.length ? <p>Chưa có campaign được index. Bản nháp chưa nộp vẫn riêng tư.</p>
        : <ul>{queue.data.map(c => <li key={c.id}><a href={`#/internal/campaigns/${c.id}`}>{c.title}</a><p className="advance-hash">{c.planHash}</p></li>)}</ul>}
  </section>
}
function AdvanceReviewDetail({ session, metadataId }: { session: AccountSession; metadataId: string }) {
  const workflow = useQuery({ queryKey: ['advance-review-workflow', deployment.deploymentId, session.userId, metadataId], retry: false,
    queryFn: async ({ signal }) => {
      const value = await advanceGetWorkflow(metadataId, { signal })
      if (sha256(toHex(value.plan.planBytes)) !== value.plan.planHash) throw new Error('Kế hoạch không khớp commitment.')
      return value
    }, refetchInterval: 5000 })
  if (workflow.isPending) return <p role="status">Đang đối chiếu hồ sơ và chain B…</p>
  if (workflow.isError) return <section className="panel"><p role="alert">{getErrorMessage(workflow.error)}</p><button className="button button--secondary" onClick={() => void workflow.refetch()}>Tải lại quyền và trạng thái</button></section>
  const data = workflow.data, snapshot = data.snapshot
  if (!snapshot) return <p>Campaign chưa được nộp/index; chưa xét duyệt.</p>
  const c = snapshot.campaign, index = Number(c.currentStage), stage = snapshot.stages[index]
  const frozen = JSON.parse(data.plan.planBytes) as GiftDraft
  const refresh = () => void workflow.refetch()
  return <><a href="#/internal/campaigns">← Hàng chờ</a><section className="panel"><h1>{data.title}</h1>
    <p>{c.state} · đợt {index + 1}/{snapshot.stages.length} · block {data.checkpoint.blockNumber} · {chainDate(data.checkpoint.chainTimestamp)}</p>
    <p>Goal {formatUnits(BigInt(c.goal), 6)} · đã góp {formatUnits(BigInt(c.contributed), 6)} · đã cấp {formatUnits(BigInt(c.advanced), 6)} · escrow {formatUnits(BigInt(c.custody), 6)} USDC.</p>
    <p>{frozen.channel === 'INSTITUTION' ? 'Trao qua đơn vị' : 'Trao trực tiếp'} · phạm vi: {frozen.recipientScope}</p><p>Căn cứ tổ chức: {frozen.eligibilityBasis}</p>
    {frozen.stages.map((s, i) => <details key={i} open={i === index}><summary>Đợt {i + 1}: {s.title} · {formatUnits(BigInt(s.budgetUnits), 6)} USDC</summary>
      <p>{s.description}</p><p>{s.targetPackages} suất · {s.goods}</p><ul>{s.acceptanceCriteria.map(c => <li key={c.criterionId}>{c.criterionId}: {c.description} · {c.requiredDocuments.join(', ')}</li>)}</ul></details>)}
    <p>Hash/chữ ký xác nhận nội dung và người ký, không tự chứng minh hoạt động ngoài đời.</p>
  </section><AdvanceVerificationHistory session={session} organizationId={data.organizationId} />
    {!['COMPLETED', 'STOPPED'].includes(c.state) ? <ReviewPreparation key={`${c.state}:${c.currentStage}:${stage.latestVersion}`} data={data} frozen={frozen} session={session} onRefresh={refresh} />
      : <section className="panel"><h2>Đã kết thúc</h2><p>Không còn quyết định mở cấp vốn. Khoản trả lại và quyền refund vẫn được theo dõi riêng.</p></section>}
    <AdvanceTransactionHistory metadataId={data.metadataId} onRefresh={refresh} />
  </>
}
function ReviewPreparation({ data, frozen, session, onRefresh }: { data: AdvanceOwnerWorkflow; frozen: GiftDraft; session: AccountSession; onRefresh: () => void }) {
  const c = data.snapshot!.campaign, stage = data.snapshot!.stages[Number(c.currentStage)], submission = stage.submissions.find(v => v.version === stage.latestVersion)
  const pkg = data.packages.find(p => p.milestoneIndex === c.currentStage && p.submissionVersion === Number(stage.latestVersion) && p.evidenceHash === submission?.evidenceHash)
  const needsEvidence = c.state === 'EVIDENCE_REVIEW' || c.state === 'CASE_OPEN'
  const materials = useQuery({ queryKey: ['advance-case-materials', deployment.deploymentId, data.snapshot!.campaignId, c.currentStage, stage.latestVersion],
    enabled: c.state === 'CASE_OPEN', retry: false, queryFn: ({ signal }) => advanceGetEvents(data.snapshot!.campaignId, { signal }), refetchInterval: 5000 })
  const original = useQuery({ queryKey: ['advance-review-original', deployment.deploymentId, session.userId, pkg?.id], enabled: needsEvidence && Boolean(pkg), retry: false,
    queryFn: async ({ signal }) => { const value = await advanceGetOriginalManifest(pkg!.id, { signal }); return parseAdvancePackage(value.manifestBytes, value.evidenceHash, data, pkg!.id) } })
  const publication = useQuery({ queryKey: ['advance-review-publication', deployment.deploymentId, session.userId, pkg?.id], enabled: needsEvidence && Boolean(pkg), retry: false,
    queryFn: async ({ signal }) => {
      const p = await advanceGetPublication(pkg!.id, { signal })
      if (sha256(toHex(p.manifestBytes)) !== p.hash) throw new Error('Hash bản đã che không khớp.')
      const manifest = JSON.parse(p.manifestBytes) as { packageId: string; evidenceHash: string; documents: { documentId: string; originalDocumentId: string }[] }
      if (manifest.packageId !== pkg!.id || manifest.evidenceHash !== pkg!.evidenceHash) throw new Error('Bản công khai không thuộc version này.')
      return { ...p, manifest }
    } })
  const [downloadError, setDownloadError] = useState('')
  async function download(originalId: string, publicId?: string) {
    setDownloadError('')
    try {
      const blob = publicId ? await advanceDownloadPublic(publication.data!.hash, publicId, { responseType: 'blob' })
        : await advanceDownloadOriginal(pkg!.id, originalId, { responseType: 'blob' })
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = publicId ? 'redacted-document' : 'original-document'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (cause) { setDownloadError(getErrorMessage(cause)) }
  }
  return <>
    {needsEvidence && <section className="panel"><h2>Đối chiếu nguồn · version {stage.latestVersion}</h2>
      <p>Hạn review: {chainDate(stage.reviewEnd)} · hard stop: {chainDate(stage.hardStop)}.</p>
      {!pkg ? <p role="alert">Chưa tìm thấy package khớp version canonical. Chỉ có thể xem xét dừng; không được xác nhận đạt.</p>
        : original.isPending ? <p role="status">Đang đọc bản gốc riêng tư…</p> : original.isError ? <><p role="alert">{getErrorMessage(original.error)}</p><button className="button button--secondary" onClick={() => void original.refetch()}>Kiểm tra lại bản gốc</button></>
          : <><p>{original.data.report.summary}</p><p>{original.data.giftReport.deliveredPackages} suất · {original.data.giftReport.recipientScope}</p><p>Giới hạn organizer khai báo: {original.data.giftReport.limitations}</p>
            <ul>{original.data.report.outcomes.map(o => <li key={o.criterionId}>{o.criterionId}: {o.description}</li>)}</ul>
            <table><thead><tr><th>Chứng từ</th><th>Bản gốc riêng tư</th><th>Bản đã che</th></tr></thead><tbody>{original.data.documents.map(d => {
              const publicFile = publication.data?.manifest.documents.find(p => p.originalDocumentId === d.documentId)
              return <tr key={d.documentId}><td>{d.kind} · {d.originalName}</td><td><button className="button button--secondary" onClick={() => void download(d.documentId)}>Đọc bản gốc</button></td>
                <td>{publicFile ? <button className="button button--secondary" onClick={() => void download(d.documentId, publicFile.documentId)}>Đọc bản đã che</button> : 'Chưa có bản tương ứng'}</td></tr>
            })}</tbody></table></>}
      {publication.isError && <><p role="alert">Bản công khai chưa sẵn sàng: {getErrorMessage(publication.error)}</p><button className="button button--secondary" onClick={() => void publication.refetch()}>Kiểm tra bản công khai</button></>}
      {downloadError && <p role="alert">{downloadError}</p>}
      {c.state === 'CASE_OPEN' && submission && <>
        <AdvanceRecord hash={submission.challengeCase.reasonHash} title="Nội dung phản đối" />
        {!/^0x0+$/.test(submission.challengeCase.responseHash) && <AdvanceRecord hash={submission.challengeCase.responseHash} title="Phản hồi của tổ chức" />}
        {materials.isError && <p role="alert">Chưa đọc được tài liệu bổ sung của case: {getErrorMessage(materials.error)}</p>}
        {materials.data?.events.filter(e => e.eventName === 'CaseMaterialAdded' && String(e.args.stage) === c.currentStage && String(e.args.version) === stage.latestVersion)
          .map(e => <AdvanceRecord key={`${e.transactionHash}:${e.logIndex}`} hash={String(e.args.materialHash)} title="Thông tin bổ sung của donor" />)}
      </>}
    </section>}
    <ReviewDecision data={data} frozen={frozen} evidence={original.data} publicHash={publication.data?.hash} onRefresh={onRefresh} />
  </>
}
function ReviewDecision({ data, frozen, evidence, publicHash, onRefresh }: { data: AdvanceOwnerWorkflow; frozen: GiftDraft; evidence?: EvidencePackage; publicHash?: string; onRefresh: () => void }) {
  const { address } = useAccount(), c = data.snapshot!.campaign, stage = data.snapshot!.stages[Number(c.currentStage)]
  const submission = stage.submissions.find(v => v.version === stage.latestVersion), criteria = frozen.stages[Number(c.currentStage)].acceptanceCriteria
  const defaultKind: AdvanceReviewInput['kind'] = c.state === 'DRAFT' ? 'APPROVE_CAMPAIGN' : c.state === 'FIRST_REVIEW' ? 'FIRST_ELIGIBILITY'
    : c.state === 'EVIDENCE_REVIEW' ? 'EVIDENCE' : c.state === 'CASE_OPEN' ? 'CASE' : 'STOP'
  const [kind, setKind] = useState(defaultKind), [reason, setReason] = useState(''), [sources, setSources] = useState(''), [scope, setScope] = useState(''), [limits, setLimits] = useState('')
  const [clearConflict, setClearConflict] = useState(false), [disclosure, setDisclosure] = useState(false), [spent, setSpent] = useState('')
  const [outcome, setOutcome] = useState<typeof reviewOutcomes[number]>('INCONCLUSIVE'), [resolution, setResolution] = useState<'CONTINUE' | 'RESUBMIT' | 'STOP'>('RESUBMIT')
  const [assessments, setAssessments] = useState(() => criteria.map(c => ({ criterionId: c.criterionId, outcome: 'INCONCLUSIVE' as typeof reviewOutcomes[number], reason: '', sources: [''], limits: '', documentIds: [] as string[] })))
  let review: AdvanceReviewInput | undefined, blocked = ''
  try {
    if (!reason.trim() || !scope.trim() || !limits.trim()) throw new Error('Điền lý do, phạm vi và giới hạn của quyết định.')
    if (!clearConflict || !disclosure) throw new Error('Xác nhận xung đột lợi ích và nội dung công khai trước khi ký.')
    review = { kind, actorWallet: address ?? '', expectedPlanHash: data.plan.planHash, reason, scope, limits, sources: reviewSources(sources), conflictOfInterest: false, publicDisclosureConfirmed: true }
    if (kind === 'EVIDENCE' || kind === 'CASE') {
      if (!submission) throw new Error('Thiếu tham chiếu hồ sơ canonical.')
      review.evidenceRef = { campaignId: data.snapshot!.campaignId, stage: c.currentStage, version: submission.version, evidenceHash: submission.evidenceHash }
    }
    if (kind === 'EVIDENCE') {
      if (!evidence) throw new Error('Cần đọc được bản gốc đúng version trước khi kết luận hồ sơ.')
      review.packageId = evidence.packageId; review.publicHash = publicHash
      review.decision = { outcome, campaignSpent: spent === '0' ? '0' : amountUnits(spent), conflictOfInterest: false, criteria: assessments.map(c => ({ ...c, sources: c.sources.map(s => s.trim()).filter(Boolean) })) }
      const invalid = criterionReviewReason(review, criteria, evidence, stage.budget); if (invalid) throw new Error(invalid)
    }
    if (kind === 'CASE') {
      review.resolution = resolution
      if (resolution === 'CONTINUE') {
        if (!evidence || !publicHash || publicHash !== stage.publicHash) throw new Error('Tiếp tục cần bản gốc và bản công khai đúng commitment đang truy cập được.')
        review.packageId = evidence.packageId
      }
      const cs = submission!.challengeCase, now = BigInt(data.checkpoint.chainTimestamp)
      if (now < BigInt(cs.responseEnd)) throw new Error('Chờ hết hạn phản hồi trước quyết định case.')
      if (now >= BigInt(cs.resolutionEnd)) throw new Error('Đã quá hạn xử lý case; cần finalize timeout.')
    }
  } catch (cause) { blocked = getErrorMessage(cause) }
  const labels = { APPROVE_CAMPAIGN: 'Duyệt kế hoạch', FIRST_ELIGIBILITY: 'Xác nhận eligibility cấp đầu', EVIDENCE: 'Kết luận hồ sơ thực hiện', CASE: 'Xử lý case', STOP: 'Dừng campaign' }
  return <section className="panel advance-plan-form"><h2>Quyết định resolver</h2><p className="advance-hash">Ví bắt buộc: {deployment.resolver} · mạng {deployment.chainId}</p>
    <p>Quyết định được chuẩn bị thành commitment; chưa đổi trạng thái chain cho đến khi đúng giao dịch đã xác nhận và index.</p>
    <label>Loại quyết định<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{[...new Set([defaultKind, 'STOP' as const])].map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>
    {kind === 'EVIDENCE' && <><label>Kết luận tổng hợp<select value={outcome} onChange={e => setOutcome(e.target.value as typeof outcome)}>{reviewOutcomes.map(o => <option key={o} value={o}>{reviewOutcomeLabels[o]}</option>)}</select></label>
      <label>Chi từ campaign được chấp nhận (USDC)<input inputMode="decimal" value={spent} onChange={e => setSpent(e.target.value)} /></label>
      <p>Budget {formatUnits(BigInt(stage.budget), 6)} USDC. Chi tổ chức/nguồn khác không được trừ vào tiền dư của campaign.</p>
      {assessments.map((a, i) => <fieldset key={a.criterionId}><legend>{a.criterionId} · {criteria[i].description}</legend>
        <label>Kết luận tiêu chí<select value={a.outcome} onChange={e => setAssessments(assessments.map((v, j) => j === i ? { ...v, outcome: e.target.value as typeof v.outcome } : v))}>{reviewOutcomes.map(o => <option key={o} value={o}>{reviewOutcomeLabels[o]}</option>)}</select></label>
        {(['reason', 'limits'] as const).map(key => <label key={key}>{key === 'reason' ? 'Lý do theo tiêu chí' : 'Giới hạn theo tiêu chí'}<textarea value={a[key]} onChange={e => setAssessments(assessments.map((v, j) => j === i ? { ...v, [key]: e.target.value } : v))} /></label>)}
        <label>Nguồn đối chiếu · mỗi dòng một nguồn<textarea value={a.sources.join('\n')} onChange={e => setAssessments(assessments.map((v, j) => j === i ? { ...v, sources: e.target.value.split('\n') } : v))} /></label>
        <div className="advance-checks">{evidence?.documents.filter(d => d.relatesToCriterionIds.includes(a.criterionId)).map(d => <label key={d.documentId}><input type="checkbox" checked={a.documentIds.includes(d.documentId)}
          onChange={e => setAssessments(assessments.map((v, j) => j === i ? { ...v, documentIds: e.target.checked ? [...v.documentIds, d.documentId] : v.documentIds.filter(id => id !== d.documentId) } : v))} />{d.kind} · {d.originalName}</label>)}</div>
      </fieldset>)}</>}
    {kind === 'CASE' && <><p>Hạn phản hồi: {chainDate(submission!.challengeCase.responseEnd)} · hạn quyết định: {chainDate(submission!.challengeCase.resolutionEnd)}</p>
      <p className="advance-hash">Lý do case: {submission!.challengeCase.reasonHash} · phản hồi: {submission!.challengeCase.responseHash}</p>
      <label>Kết luận case<select value={resolution} onChange={e => setResolution(e.target.value as typeof resolution)}><option value="CONTINUE">Tiếp tục kết luận đạt và mở lại cửa sổ phản đối</option><option value="RESUBMIT">Yêu cầu version mới nếu còn lượt</option><option value="STOP">Dừng campaign</option></select></label><p>Mỗi version có một case, không có appeal. CONTINUE không cấp ngân sách lại.</p></>}
    <label>Lý do quyết định<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
    <label>Nguồn kiểm tra · mỗi dòng: căn cứ | tham chiếu<textarea value={sources} onChange={e => setSources(e.target.value)} /></label>
    <label>Phạm vi kết luận<textarea value={scope} onChange={e => setScope(e.target.value)} /></label><label>Giới hạn kiểm tra<textarea value={limits} onChange={e => setLimits(e.target.value)} /></label>
    <div className="advance-checks"><label><input type="checkbox" checked={clearConflict} onChange={e => setClearConflict(e.target.checked)} />Tôi đã kiểm tra và không có xung đột lợi ích với campaign.</label>
      <label><input type="checkbox" checked={disclosure} onChange={e => setDisclosure(e.target.checked)} />Nội dung quyết định được công khai; tôi đã loại dữ liệu nhạy cảm khỏi lý do và nguồn tham chiếu.</label></div>
    {data.reviewAccess.blockedReason && <p role="alert">{data.reviewAccess.blockedReason}</p>}
    {blocked && <p>{blocked}</p>}
    {review && <AdvanceWalletAction metadataId={data.metadataId} label={labels[kind]} requiredWallet={deployment.resolver} disabledReason={data.reviewAccess.blockedReason ?? (blocked || undefined)}
      input={{ ...ownerActionInput(data, reviewAction(review)), review }} display={{ snapshot: data.snapshot, plan: data.plan }} onRefresh={onRefresh} />}
  </section>
}
