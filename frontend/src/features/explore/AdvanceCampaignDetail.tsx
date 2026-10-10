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
import { CurrentStepPanel, FundingProgress } from './PublicCampaignUI'
import { formatMockUsdc, publicStateGroups } from './public-campaign-view'
import '../campaigns/advance/advance.css'

export function AdvanceCampaignFeed() {
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('ALL')
  const query = useQuery({ queryKey: ['advance-public-campaigns', deployment.deploymentId], retry: false, refetchInterval: 10000,
    queryFn: async ({ signal }) => { const v = await advanceListPublic({ signal }); assertAdvanceContext(v.context, deployment); return v } })
  const items = query.data?.items.filter(c => {
    const matchesSearch = `${c.title} ${c.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    const states = group === 'ALL' ? null : publicStateGroups[group]
    return matchesSearch && (!states || states.includes(c.workflow.state))
  }) ?? []
  return <section className="explore-campaigns" aria-labelledby="explore-campaigns-title"><div className="explore-list-heading"><div>
    <span className="eyebrow">WORKFLOW B · MẠNG THỬ NGHIỆM</span><h1 id="explore-campaigns-title">Chiến dịch cộng đồng</h1>
    <p>{query.isPending ? 'Đang tải danh sách chiến dịch…' : `${items.length} chiến dịch ${search || group !== 'ALL' ? 'phù hợp' : 'đang hiển thị'}`}</p></div>
    <div className="feed-toolbar"><label className="feed-search"><span aria-hidden="true">⌕</span><span className="public-sr-only">Tìm chiến dịch</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên chiến dịch" /></label>
      <label className="feed-filter"><span className="public-sr-only">Lọc theo trạng thái</span><select value={group} onChange={e => setGroup(e.target.value)}><option value="ALL">Mọi trạng thái</option><option value="FUNDING">Đang gây quỹ</option><option value="EXECUTION">Đang thực hiện</option><option value="COMPLETED">Đã hoàn tất</option><option value="STOPPED">Đã dừng</option></select></label></div></div>
    {query.isPending ? <p role="status">Đang đối chiếu campaign trên mạng B…</p> : query.isError ? <section className="panel"><p role="alert">{getErrorMessage(query.error)}</p><button className="button button--secondary" onClick={() => void query.refetch()}>Tải lại</button></section>
      : !items.length ? <section className="panel public-empty"><h2>{query.data.items.length ? 'Không tìm thấy chiến dịch phù hợp' : 'Chưa có chiến dịch công khai'}</h2><p>{query.data.items.length ? 'Thử đổi từ khóa hoặc trạng thái lọc.' : 'Chiến dịch xuất hiện sau khi giao dịch công bố được index.'}</p></section>
        : <ul className="public-campaign-grid">{items.map(c => <li key={c.campaignId} className="campaign-tile">
          <div className="campaign-tile__top"><span className="status-pill">{advanceStateLabels[c.workflow.state]}</span></div>
          <h2><a href={`#/campaigns/${c.campaignId}`}>{c.title}</a></h2><p className="organization-description">{c.description}</p>
          <FundingProgress contributed={c.workflow.contributed} goal={c.workflow.goal} />
          <dl className="campaign-tile__facts"><div><dt>Còn trong escrow</dt><dd>{formatMockUsdc(c.workflow.custody)} <span>MockUSDC</span></dd></div></dl>
          <a className="campaign-tile__link" href={`#/campaigns/${c.campaignId}`}>Xem chiến dịch <span aria-hidden="true">→</span></a>
        </li>)}</ul>}
  </section>
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
  return <><a className="public-back" href="#/">← Khám phá</a><section className="campaign-detail-hero">
      <div><span className="eyebrow">CHIẾN DỊCH WORKFLOW B · MẠNG THỬ NGHIỆM</span><h1>{d.title ?? `Campaign ${campaignId}`}</h1><p>{d.description}</p>
        <span className="status-pill">{advanceStateLabels[c.state]}</span>
        <p>Đã nghiệm thu {position.acceptedStages} trên {position.totalStages} đợt. Đã cấp vốn không đồng nghĩa hoạt động đã được nghiệm thu.</p>
        {c.state === 'FUNDING' && <p>Hạn gây quỹ: {chainDate(c.fundingEnd)}</p>}
        {c.state === 'CHALLENGE_WINDOW' && <p>Phản đối trước {chainDate(current.challengeEnd)}; resolver chốt trước {chainDate(current.finalizeEnd)}.</p>}
      </div>
      <div className="campaign-detail-hero__progress"><FundingProgress contributed={c.contributed} goal={c.goal} />
        <p className="muted">Số dư escrow hiện tại: <strong>{formatUnits(BigInt(c.custody), 6)} MockUSDC</strong></p>
      </div>
    </section>
    <div className="campaign-detail-layout"><div className="campaign-detail-main">
    <CurrentStepPanel state={c.state} />
    {d.plan && <section className="panel"><h2>Kế hoạch và phạm vi</h2><p>{d.plan.channel === 'INSTITUTION' ? 'Trao qua đơn vị' : 'Trao trực tiếp'} · {d.plan.recipientScope}</p>
      <p>{d.plan.eligibilityBasis}</p><p>Phạm vi bàn giao đã cam kết quyết định điều gì cần chứng minh; bàn giao cho một đơn vị không tự chứng minh từng cá nhân đã nhận.</p>
      {d.plan.stages.map((stage, i) => <details key={i} open={i === Number(c.currentStage)}><summary>Đợt {i + 1}: {stage.title} · {formatUnits(BigInt(stage.budgetUnits), 6)} USDC</summary><p>{stage.targetPackages} suất · {stage.goods}</p>
        <ul>{stage.acceptanceCriteria.map(v => <li key={v.criterionId}>{v.criterionId}: {v.description} · {v.requiredDocuments.join(', ')}</li>)}</ul></details>)}
    </section>}
    <section className="panel"><h2>Bằng chứng và quyết định</h2><p>Hash giúp phát hiện tệp bị thay đổi. Cần đọc nguồn và phạm vi để đánh giá hoạt động thực tế.</p>
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
    <details className="panel technical-details"><summary>Dòng tiền và thông tin mạng</summary>
      <p>Tiền đã cấp ra ví tổ chức không tự thu hồi được. Khi dừng, chỉ quỹ thực còn giữ và khoản thực trả về mới có thể được phân bổ hoàn tiền.</p>
      <dl className="advance-financials">{([['Mục tiêu', c.goal], ['Đã góp', c.contributed], ['Đã cấp cho tổ chức', c.advanced], ['Đã trả về escrow', c.returned], ['Đã hoàn người ủng hộ', c.refunded], ['Còn trong escrow', c.custody]] as const).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{formatUnits(BigInt(value), 6)} MockUSDC</dd></div>)}</dl>
      <p>Đang xử lý đợt {Number(c.currentStage) + 1} · chain {s.context.chainId} · block {s.checkpoint.blockNumber} · {chainDate(s.checkpoint.chainTimestamp)}.</p><p className="advance-hash">Ví tổ chức: {c.organizer} · plan hash: {c.planHash}</p>
    </details>
    <details className="panel technical-details"><summary>Lịch sử giao dịch đã index</summary>{events.isPending ? <p role="status">Đang tải events…</p> : events.isError ? <p role="alert">{getErrorMessage(events.error)}</p>
      : <ol>{events.data.events.map(e => <li key={`${e.transactionHash}:${e.logIndex}`}><strong>{e.eventName}</strong> · block {e.blockNumber}
        <p className="advance-hash">{e.transactionHash}</p>{e.eventName === 'CaseMaterialAdded' && <AdvanceRecord hash={String(e.args.materialHash)} title="Thông tin donor bổ sung" />}</li>)}</ol>}</details>
    {d.metadataId && <AdvanceTransactionHistory metadataId={d.metadataId} onRefresh={refresh} />}
    </div><aside className="campaign-detail-aside" aria-label="Đóng góp và tóm tắt">
      {d.metadataId && c.state === 'FUNDING' && <AdvanceDonate snapshot={s} metadataId={d.metadataId} onRefresh={refresh} />}
      <section className="panel campaign-aside-summary"><h2>Tóm tắt đợt</h2><p>Đợt hiện tại: <strong>{Number(c.currentStage) + 1}</strong></p><p>Đợt đã nghiệm thu: <strong>{position.acceptedStages}/{position.totalStages}</strong></p><p className="muted">Mạng thử nghiệm · MockUSDC</p></section>
    </aside></div>
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
  return <section className="panel advance-plan-form"><h2>Ủng hộ chiến dịch</h2><p>Còn thiếu {formatUnits(BigInt(c.goal) - BigInt(c.contributed), 6)} MockUSDC. Phê duyệt token và đóng góp là hai giao dịch riêng.</p>
    <label>Số MockUSDC<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <AdvanceWalletAction metadataId={metadataId} label={`Góp ${amount || '0'} MockUSDC`} disabledReason={blocked || undefined}
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
