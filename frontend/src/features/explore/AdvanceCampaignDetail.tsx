import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits, sha256, toHex } from 'viem'
import { advanceDownloadPublic, advanceGetEvents, advanceGetPublic, advanceGetPublicManifest, advanceListPublic } from '../../lib/api/generated/advance'
import type { AdvanceSnapshot } from '../../lib/api/generated/advance'
import { getErrorMessage } from '../../lib/api/error'
import deployment from '../../lib/web3/deployment-context'
import { assertAdvanceContext } from '../../lib/web3/advance-action'
import { AdvanceWalletAction, AdvanceTransactionHistory } from '../campaigns/advance/AdvanceWalletAction'
import { AdvanceRecord } from '../campaigns/advance/AdvanceRecord'
import { AdvanceCaseActions } from '../campaigns/advance/AdvanceCaseActions'
import { advanceStateLabels, chainDate, financialPosition, publicActionInput } from '../campaigns/advance/advance-journey'
import { amountUnits } from '../campaigns/advance/advance-plan'
import { AdvanceRefundPanel } from './AdvanceRefundPanel'
import '../campaigns/advance/advance.css'

export function AdvanceCampaignFeed() {
  const query = useQuery({ queryKey: ['advance-public-campaigns', deployment.deploymentId], retry: false, refetchInterval: 10000,
    queryFn: async ({ signal }) => { const v = await advanceListPublic({ signal }); assertAdvanceContext(v.context, deployment); return v } })
  return <><div className="feed-heading"><h1>Cùng thực hiện từng đợt</h1><a href="#/organizations">Tổ chức chiến dịch</a></div>
    <p>Quỹ được cấp trước cho tổ chức theo ngân sách từng đợt. Nghiệm thu và phản đối quyết định quyền tiếp tục.</p>
    {query.isPending ? <p role="status">Đang đối chiếu campaign trên mạng B…</p> : query.isError ? <section className="panel"><p role="alert">{getErrorMessage(query.error)}</p><button className="button button--secondary" onClick={() => void query.refetch()}>Tải lại</button></section>
      : !query.data.items.length ? <section className="panel"><h2>Chưa có campaign công khai</h2><p>Campaign xuất hiện sau giao dịch công bố đã được index.</p></section>
        : <ul className="organization-list">{query.data.items.map(c => <li key={c.campaignId} className="panel"><h2><a href={`#/campaigns/${c.campaignId}`}>{c.title}</a></h2><p>{c.description}</p><p>{advanceStateLabels[c.workflow.state]}</p>
          <p>{formatUnits(BigInt(c.workflow.contributed), 6)} / {formatUnits(BigInt(c.workflow.goal), 6)} USDC đã góp · {formatUnits(BigInt(c.workflow.custody), 6)} USDC còn escrow</p></li>)}</ul>}
  </>
}
export function AdvanceCampaignDetail({ campaignId }: { campaignId: string }) {
  const detail = useQuery({ queryKey: ['advance-public-detail', deployment.deploymentId, campaignId], retry: false, refetchInterval: 5000,
    queryFn: async ({ signal }) => { const v = await advanceGetPublic(campaignId, { signal }); assertAdvanceContext(v.snapshot.context, deployment); financialPosition(v.snapshot); return v } })
  const events = useQuery({ queryKey: ['advance-events', deployment.deploymentId, campaignId], retry: false, refetchInterval: 5000,
    queryFn: ({ signal }) => advanceGetEvents(campaignId, { signal }) })
  const refresh = () => { void detail.refetch(); void events.refetch() }
  if (detail.isPending) return <p role="status">Đang tải trạng thái tài chính B…</p>
  if (detail.isError) return <section className="panel"><h1>Chưa đọc được campaign</h1><p role="alert">{getErrorMessage(detail.error)}</p><p>RPC/indexer cần đồng bộ đúng deployment trước khi mở thao tác.</p><button className="button button--secondary" onClick={refresh}>Thử lại</button></section>
  const d = detail.data, s = d.snapshot, c = s.campaign, position = financialPosition(s), current = s.stages[Number(c.currentStage)]
  return <><a href="#/">← Khám phá campaign</a><section className="panel"><h1>{d.title ?? `Campaign ${campaignId}`}</h1><p>{d.description}</p><h2>{advanceStateLabels[c.state]}</h2>
    <p>Đã chốt nghiệm thu {position.acceptedStages}/{position.totalStages} đợt. Số tiền đã cấp không đồng nghĩa hoạt động đã được nghiệm thu.</p>
    <dl className="advance-financials">{([['Goal', c.goal], ['Đã góp · C', c.contributed], ['Đã cấp cho tổ chức · A', c.advanced], ['Thực trả về escrow · R', c.returned], ['Đã hoàn donor · F', c.refunded], ['Escrow còn giữ · E', c.custody]] as const).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{formatUnits(BigInt(value), 6)} USDC</dd></div>)}</dl>
    <p>Tiền đã cấp ra ví tổ chức không tự thu hồi được. Khi dừng, chỉ quỹ thực còn giữ và khoản thực trả về mới có thể được phân bổ hoàn tiền.</p>
    <p>Đang xử lý đợt {Number(c.currentStage) + 1} · chain {s.context.chainId} · block {s.checkpoint.blockNumber} · {chainDate(s.checkpoint.chainTimestamp)}.</p>
    <p className="advance-hash">Ví tổ chức: {c.organizer} · plan hash: {c.planHash}</p>
    {c.state === 'FUNDING' && <p>Hạn gây quỹ: {chainDate(c.fundingEnd)}</p>}
    {c.state === 'CHALLENGE_WINDOW' && <p>Phản đối trước {chainDate(current.challengeEnd)}; chốt nghiệm thu trước {chainDate(current.finalizeEnd)}.</p>}
    {c.state === 'CASE_OPEN' && <p>Campaign đang có case; quyền cấp tiếp bị khóa trong lúc xử lý.</p>}
  </section>
    {d.plan && <section className="panel"><h2>Kế hoạch và phạm vi</h2><p>{d.plan.channel === 'INSTITUTION' ? 'Trao qua đơn vị' : 'Trao trực tiếp'} · {d.plan.recipientScope}</p>
      <p>{d.plan.eligibilityBasis}</p><p>Phạm vi bàn giao đã cam kết quyết định điều gì cần chứng minh; bàn giao cho một đơn vị không tự chứng minh từng cá nhân đã nhận.</p>
      {d.plan.stages.map((stage, i) => <details key={i} open={i === Number(c.currentStage)}><summary>Đợt {i + 1}: {stage.title} · {formatUnits(BigInt(stage.budgetUnits), 6)} USDC</summary><p>{stage.targetPackages} suất · {stage.goods}</p>
        <ul>{stage.acceptanceCriteria.map(v => <li key={v.criterionId}>{v.criterionId}: {v.description} · {v.requiredDocuments.join(', ')}</li>)}</ul></details>)}
    </section>}
    {d.metadataId && c.state === 'FUNDING' && <AdvanceDonate snapshot={s} metadataId={d.metadataId} onRefresh={refresh} />}
    <section className="panel"><h2>Bằng chứng và quyết định</h2><p>Hash chứng minh bytes không bị đổi. Người xem vẫn cần đối chiếu nguồn, phạm vi và sự thật ngoài đời.</p>
      {s.stages.map((stage, i) => <div key={i}><h3>Đợt {i + 1} · {stage.state}</h3>{!stage.submissions.length && <p>Chưa có hồ sơ nộp on-chain.</p>}
        {stage.submissions.map(v => <details key={v.version} open={i === Number(c.currentStage) && v.version === stage.latestVersion}><summary>Version {v.version} · {v.reviewed ? v.outcome : 'Chờ resolver kết luận'}</summary>
          <p className="advance-hash">Hash gốc: {v.evidenceHash} · parent version {v.parentVersion}</p>
          {!/^0x0+$/.test(v.publicHash) ? <AdvancePublicEvidence hash={v.publicHash} snapshot={s} index={String(i)} version={v.version} evidenceHash={v.evidenceHash} /> : <p>Chưa có bản công khai được ràng buộc vào kết luận on-chain.</p>}
          {!/^0x0+$/.test(v.reportHash) && <AdvanceRecord hash={v.reportHash} title="Kết luận resolver và nguồn kiểm tra" />}
          {v.challengeCase.caseUsed && <><p>Case: {v.challengeCase.resolution}. Một case/version, không appeal.</p><AdvanceRecord hash={v.challengeCase.reasonHash} title="Nội dung phản đối" />
            {!/^0x0+$/.test(v.challengeCase.responseHash) && <AdvanceRecord hash={v.challengeCase.responseHash} title="Phản hồi tổ chức" />}
            {!/^0x0+$/.test(v.challengeCase.resolutionReasonHash) && <AdvanceRecord hash={v.challengeCase.resolutionReasonHash} title="Kết luận case" />}</>}
        </details>)}</div>)}
    </section>
    {d.metadataId && <AdvanceCaseActions key={`${c.currentStage}:${current.latestVersion}:${c.state}`} snapshot={s} metadataId={d.metadataId} onRefresh={refresh} />}
    <AdvanceRefundPanel key={campaignId} snapshot={s} metadataId={d.metadataId} onRefresh={refresh} />
    <section className="panel"><h2>Lịch sử on-chain đã index</h2>{events.isPending ? <p role="status">Đang tải events…</p> : events.isError ? <p role="alert">{getErrorMessage(events.error)}</p>
      : <ol>{events.data.events.map(e => <li key={`${e.transactionHash}:${e.logIndex}`}><strong>{e.eventName}</strong> · block {e.blockNumber}
        <p className="advance-hash">{e.transactionHash}</p>{e.eventName === 'CaseMaterialAdded' && <AdvanceRecord hash={String(e.args.materialHash)} title="Thông tin donor bổ sung" />}</li>)}</ol>}</section>
    {d.metadataId && <AdvanceTransactionHistory metadataId={d.metadataId} onRefresh={refresh} />}
  </>
}
function AdvanceDonate({ snapshot, metadataId, onRefresh }: { snapshot: AdvanceSnapshot; metadataId: string; onRefresh: () => void }) {
  const [amount, setAmount] = useState(''), c = snapshot.campaign
  let units = '', blocked = ''
  try {
    units = amountUnits(amount)
    if (BigInt(units) > BigInt(c.goal) - BigInt(c.contributed)) blocked = 'Số tiền vượt phần goal còn thiếu.'
    if (BigInt(snapshot.checkpoint.chainTimestamp) >= BigInt(c.fundingEnd)) blocked = 'Đã hết hạn gây quỹ.'
  } catch { blocked = 'Nhập số USDC dương với tối đa 6 chữ số thập phân.' }
  return <section className="panel advance-plan-form"><h2>Đóng góp</h2><p>Còn thiếu {formatUnits(BigInt(c.goal) - BigInt(c.contributed), 6)} USDC. Allowance và đóng góp là hai giao dịch riêng.</p>
    <label>Số USDC<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <AdvanceWalletAction metadataId={metadataId} label={`Góp ${amount || '0'} USDC`} disabledReason={blocked || undefined}
      input={{ ...publicActionInput(snapshot, 'DONATE'), amount: units || '0' }} display={{ snapshot }} onRefresh={onRefresh} />
  </section>
}
function AdvancePublicEvidence({ hash, snapshot, index, version, evidenceHash }: { hash: string; snapshot: AdvanceSnapshot; index: string; version: string; evidenceHash: string }) {
  const [error, setError] = useState('')
  const bundle = useQuery({ queryKey: ['advance-public-bundle', deployment.deploymentId, hash], retry: false,
    queryFn: async ({ signal }) => {
      const v = await advanceGetPublicManifest(hash, { signal })
      if (v.publicHash !== hash || sha256(toHex(v.manifestBytes)) !== hash) throw new Error('Bản công khai không khớp commitment.')
      const p = JSON.parse(v.manifestBytes) as { context: AdvanceSnapshot['context']; campaignId: string; milestoneIndex: string; submissionVersion: number; evidenceHash: string; planHash: string; summary: string;
        documents: { documentId: string; mediaType: string; byteSize: number; sha256: string }[] }
      assertAdvanceContext(p.context, deployment)
      if (p.campaignId !== snapshot.campaignId || p.milestoneIndex !== index || String(p.submissionVersion) !== version || p.evidenceHash !== evidenceHash || p.planHash !== snapshot.campaign.planHash) throw new Error('Bản công khai sai campaign/đợt/version.')
      return p
    } })
  async function download(documentId: string) {
    try { const blob = await advanceDownloadPublic(hash, documentId, { responseType: 'blob' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'redacted-evidence'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000) }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  return <div>{bundle.isPending ? <p role="status">Đang đọc bản đã che…</p> : bundle.isError ? <><p role="alert">Lỗi truy cập/hash bằng chứng: {getErrorMessage(bundle.error)}</p>
    <p>Storage không sẵn sàng không tự chứng minh đạt. Donor/resolver có thể mở case nếu version hiện tại còn cửa sổ phản đối; resolver có đường STOP theo policy.</p><button className="button button--secondary" onClick={() => void bundle.refetch()}>Kiểm tra lại storage</button></>
    : <><p>{bundle.data.summary}</p>{bundle.data.documents.map((d, i) => <p key={d.documentId}><button className="button button--secondary" onClick={() => void download(d.documentId)}>Tài liệu công khai {i + 1} · {d.mediaType} · {d.byteSize} bytes</button></p>)}</>}{error && <p role="alert">{error}</p>}</div>
}
