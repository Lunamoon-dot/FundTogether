import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { advanceFreezePlan, advanceGetDraft, advanceGetWorkflow, advanceListDrafts } from '../../../lib/api/generated/advance'
import type { AdvanceDraft } from '../../../lib/api/generated/advance'
import { getErrorMessage } from '../../../lib/api/error'
import deployment from '../../../lib/web3/deployment-context'
import { AdvanceCampaignWizard } from './AdvanceCampaignWizard'
import { AdvanceOrganizerActions } from './AdvanceOrganizerActions'
import { AdvanceTransactionHistory } from './AdvanceWalletAction'
import { AdvanceEvidence } from './AdvanceEvidence'
import { AdvanceCaseActions } from './AdvanceCaseActions'
import './advance.css'

export function AdvanceOrganizationCampaigns({ organizationId, userId, section }: { organizationId: string; userId: string; section: string }) {
  const base = `/organizations/${organizationId}/workspace/campaigns`
  const route = /^\/(?:campaigns|evidence)\/([^/]+)(\/edit)?$/.exec(section)
  const creating = section === '/campaigns/new'
  const cache = useQueryClient()
  const key = ['advance-drafts', deployment.deploymentId, userId, organizationId]
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => advanceListDrafts(organizationId, { signal }),
    enabled: !creating && !route, retry: false })
  const saved = (draft: AdvanceDraft) => { void cache.invalidateQueries({ queryKey: key }); window.location.hash = `${base}/${draft.id}` }
  if (creating) return <AdvanceCampaignWizard organizationId={organizationId} onSaved={saved} onClose={() => { window.location.hash = base }} />
  if (route) return <AdvanceCampaignDetail key={`${userId}:${route[1]}:${Boolean(route[2])}`} metadataId={route[1]}
    organizationId={organizationId} userId={userId} editing={Boolean(route[2])} onSaved={saved} />
  return <>
    <div className="feed-heading"><h1>Campaign · cấp vốn theo đợt</h1><a className="button button--primary" href={`#${base}/new`}>Tạo campaign</a></div>
    <p>Mua và trao quà · mạng B {deployment.chainId} · xác thực tổ chức trước xét duyệt campaign.</p>
    {list.isPending ? <p role="status">Đang tải campaign…</p> : list.isError ? <section className="panel"><p role="alert">{getErrorMessage(list.error)}</p>
      <button className="button button--secondary" onClick={() => void list.refetch()}>Thử lại</button></section>
      : list.data.length === 0 ? <section className="panel"><h2>Chưa có campaign</h2><p>Lập kế hoạch, ngân sách và tiêu chí cho từng đợt để bắt đầu.</p></section>
        : <ul className="organization-list">{list.data.map(c => <li className="panel" key={c.id}><h2><a href={`#${base}/${c.id}`}>{c.title}</a></h2>
          <p>{c.frozenAt ? 'Kế hoạch đã chốt · mở để xem trạng thái chain' : 'Bản nháp riêng tư'}</p><span>Phiên bản kế hoạch {c.revision}</span></li>)}</ul>}
  </>
}

function AdvanceCampaignDetail({ metadataId, organizationId, userId, editing, onSaved }: {
  metadataId: string; organizationId: string; userId: string; editing: boolean; onSaved: (draft: AdvanceDraft) => void
}) {
  const base = `/organizations/${organizationId}/workspace/campaigns`, [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const draft = useQuery({ queryKey: ['advance-draft', deployment.deploymentId, userId, metadataId], retry: false,
    queryFn: async ({ signal }) => {
      const value = await advanceGetDraft(metadataId, { signal })
      if (value.organizationId !== organizationId) throw new Error('Campaign không thuộc tổ chức đang mở.')
      return value
    } })
  const workflow = useQuery({ queryKey: ['advance-workflow', deployment.deploymentId, userId, metadataId], retry: false,
    enabled: Boolean(draft.data?.frozen), queryFn: ({ signal }) => advanceGetWorkflow(metadataId, { signal }), refetchInterval: 5000 })
  if (draft.isPending) return <p role="status">Đang tải kế hoạch…</p>
  if (draft.isError) return <section className="panel"><p role="alert">{getErrorMessage(draft.error)}</p><a href={`#${base}`}>Về danh sách</a></section>
  const value = draft.data
  if (editing && !value.frozen) return <AdvanceCampaignWizard initialCampaign={value} organizationId={organizationId} onSaved={onSaved} onClose={() => { window.location.hash = `${base}/${metadataId}` }} />
  async function freeze() {
    if (busy) return
    setBusy(true); setError('')
    try { await advanceFreezePlan(metadataId, { expectedRevision: value.revision }); await draft.refetch() }
    catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  return <>
    <a className="public-back" href={`#${base}`}>← Campaign của tổ chức</a>
    <section className="panel"><h1>{value.title}</h1><p>{value.description}</p>
      <p>{value.content.channel === 'INSTITUTION' ? 'Qua đơn vị tiếp nhận' : 'Trao trực tiếp'} · {formatUnits(BigInt(value.goalUnits), 6)} USDC · {value.content.stages.length} đợt</p>
      <p><strong>Phạm vi:</strong> {value.content.recipientScope}</p><p><strong>Căn cứ đủ điều kiện:</strong> {value.content.eligibilityBasis}</p>
      {error && <p className="toast toast--error" role="alert">{error}</p>}
      {!value.frozen ? <><p>Chốt kế hoạch sẽ cố định ngân sách, tiêu chí và ví đại diện. Việc chốt chưa tạo campaign on-chain.</p>
        <div className="advance-actions"><a className="button button--secondary" href={`#${base}/${metadataId}/edit`}>Sửa kế hoạch</a>
          <button className="button button--primary" disabled={busy} onClick={() => void freeze()}>{busy ? 'Đang chốt…' : 'Chốt kế hoạch'}</button>
          <a href={`#/organizations/${organizationId}`}>Kiểm tra ví đại diện</a></div></>
        : <><p>Kế hoạch đã chốt. Muốn sửa cần hủy campaign trước lần nhận vốn đầu và tạo bản nháp thay thế.</p>
          <p className="advance-hash">Plan hash: {value.submissionPlan?.planHash}</p>
          {workflow.isError ? <p role="alert">{getErrorMessage(workflow.error)}</p> : workflow.data ? <p>Trạng thái: {workflow.data.workflow?.state ?? 'Chưa nộp on-chain'}
            {' · '}Indexer: {workflow.data.indexer.status}</p> : <p role="status">Đang đối chiếu chain B…</p>}</>}
    </section>
    {workflow.data && !workflow.isError && <AdvanceOrganizerActions data={workflow.data} onRefresh={() => { void workflow.refetch(); void draft.refetch() }} />}
    {workflow.data && !workflow.isError && <AdvanceEvidence data={workflow.data} plan={value.content} userId={userId} onRefresh={() => void workflow.refetch()} />}
    {workflow.data?.snapshot && !workflow.isError && <AdvanceCaseActions key={`${workflow.data.snapshot.campaign.state}:${workflow.data.snapshot.campaign.currentStage}`}
      snapshot={workflow.data.snapshot} metadataId={metadataId} organizer onRefresh={() => void workflow.refetch()} />}
    <AdvanceTransactionHistory key={`${userId}:${metadataId}`} metadataId={metadataId} onRefresh={() => void workflow.refetch()} />
    <section className="panel"><h2>Kế hoạch thực hiện</h2><ol className="organization-milestones">{value.content.stages.map((s, i) => <li key={s.id ?? i}>
      <h3>Đợt {i + 1}: {s.title}</h3><p>{s.description}</p><p>{s.targetPackages} suất · {s.goods}</p>
      <p>Ngân sách: {formatUnits(BigInt(s.budgetUnits), 6)} USDC</p>
      <h4>Tiêu chí</h4><ul>{s.acceptanceCriteria.map(c => <li key={c.criterionId}>{c.description}<small> · {c.requiredDocuments.join(', ')}</small></li>)}</ul>
    </li>)}</ol></section>
  </>
}
