import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import deployment from '../../lib/web3/deployment-context'
import { getPublicCampaign, listPublicCampaigns } from '../../lib/api/public-campaigns'
import type { CampaignWorkflow, IndexerStatus, PublicCampaign } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { DonatePanel } from './DonatePanel'
import { RefundPanel } from './RefundPanel'
import { CampaignJourney } from '../campaigns/CampaignJourney'
import { campaignStatusLabel } from '../campaigns/campaign-journey'
import { MilestoneWorkflow } from '../campaigns/MilestoneWorkflow'

export function IndexerNotice({ sync }: { sync: IndexerStatus }) {
  const message = sync.status === 'ready' ? 'Dữ liệu đã đồng bộ'
    : sync.status === 'syncing' ? 'Indexer đang đồng bộ; dữ liệu chỉ phản ánh các block đã xác nhận'
      : sync.status === 'rebuilding' ? 'Indexer đang khôi phục dữ liệu sau thay đổi chain'
        : 'Indexer đang gặp lỗi; chưa thể xác nhận dữ liệu công khai'
  return <p className="indexer-notice" role={sync.status === 'error' ? 'alert' : 'status'}>{message} · block {sync.lastIndexedBlock ?? '—'} / {sync.headBlock ?? '—'}{sync.error ? ` · ${sync.error}` : ''}</p>
}

export function CampaignInformation({ campaign, workflow, children }: { campaign: PublicCampaign; workflow?: CampaignWorkflow; children?: ReactNode }) {
  return <>
    <section className="panel">
      <div className="feed-heading"><h1>{campaign.title}</h1><span className="state-pill">{campaignStatusLabel(campaign, workflow?.chainTimestamp)}</span></div>
      <p>{campaign.organization.name}</p>
      <p className="organization-description">{campaign.description}</p>
      <dl className="public-campaign-facts">
        <div><dt>Mục tiêu</dt><dd>{formatUnits(BigInt(campaign.goalUnits), deployment.tokenDecimals)} MockUSDC</dd></div>
        <div><dt>Đã đóng góp</dt><dd>{formatUnits(BigInt(campaign.totalContributedUnits), deployment.tokenDecimals)} MockUSDC</dd></div>
        <div><dt>Bond đã khóa</dt><dd>{formatUnits(BigInt(campaign.bondAmountUnits), deployment.tokenDecimals)} MockUSDC</dd></div>
        <div><dt>Hạn gây quỹ</dt><dd>{new Date(campaign.fundingDeadline * 1000).toLocaleString('vi-VN')}</dd></div>
        <div><dt>Chain / campaign ID</dt><dd>{campaign.chainId} / {campaign.onchainCampaignId}</dd></div>
        <div><dt>Block đã index</dt><dd>{campaign.indexedBlock}</dd></div>
      </dl>
      <p className="public-wallet-address">Organizer: <code>{campaign.organizer}</code></p>
      <p className="public-wallet-address">Contract: <code>{campaign.contractAddress}</code></p>
      {campaign.publicationTransactionHash && <p className="public-wallet-address">Giao dịch công bố: <code>{campaign.publicationTransactionHash}</code></p>}
    </section>
    {children}
    <section className="panel">
      <h2>Milestones và tiêu chí đã chốt</h2>
      <ol className="organization-milestones">
        {campaign.milestones.map(milestone => <li key={milestone.index}>
          <h3>{milestone.index + 1}. {milestone.title}</h3>
          <p className="organization-description">{milestone.description}</p>
          <p>Ngân sách: {formatUnits(BigInt(milestone.budgetUnits), deployment.tokenDecimals)} MockUSDC</p>
          <ul>{milestone.acceptanceCriteria.map(criterion => <li key={criterion.criterionId}>{criterion.description}</li>)}</ul>
        </li>)}
      </ol>
    </section>
  </>
}

export function PublicCampaignFeed() {
  const [offset, setOffset] = useState(0)
  const campaigns = useQuery({ queryKey: ['public-campaigns', offset],
    queryFn: ({ signal }) => listPublicCampaigns(offset, signal), retry: false, refetchInterval: 10_000 })
  return <section className="feed-results" aria-labelledby="feed-title">
    <div className="feed-heading"><h1 id="feed-title">Khám phá campaign</h1>
      <button className="button button--secondary" disabled={campaigns.isFetching} onClick={() => void campaigns.refetch()}>Tải lại</button></div>
    {campaigns.isPending ? <p role="status">Đang tải campaign công khai…</p>
      : campaigns.isError ? <section className="public-empty"><h2>Chưa tải được campaign công khai</h2><p role="alert">{getErrorMessage(campaigns.error)}</p>
        <button className="button button--secondary" onClick={() => void campaigns.refetch()}>Thử lại</button></section>
        : <>
          <IndexerNotice sync={campaigns.data.sync} />
          {campaigns.data.items.length === 0 ? <div className="public-empty"><h2>Chưa có campaign công khai để hiển thị</h2>
            <p>Campaign xuất hiện sau khi resolver duyệt, organizer công bố và indexer đồng bộ sự kiện.</p>
            <a className="button button--secondary" href="#/organizations">Mở tổ chức của tôi</a></div>
            : <ul className="public-campaign-grid">{campaigns.data.items.map(campaign => <li className="panel" key={campaign.id}>
              <span className="state-pill">{campaign.state}</span><h2>{campaign.title}</h2><p>{campaign.organization.name}</p>
              <p className="organization-description">{campaign.description}</p>
              <p>{formatUnits(BigInt(campaign.totalContributedUnits), deployment.tokenDecimals)} / {formatUnits(BigInt(campaign.goalUnits), deployment.tokenDecimals)} MockUSDC</p>
              <a className="button button--secondary" href={`#/campaigns/${campaign.id}`}>Xem campaign</a>
            </li>)}</ul>}
          <div className="feed-pagination"><button className="button button--secondary" disabled={offset === 0 || campaigns.isFetching}
            onClick={() => setOffset(value => Math.max(0, value - 20))}>Trang trước</button>
            <span>Trang {offset / 20 + 1}</span><button className="button button--secondary" disabled={campaigns.data.items.length < 20 || campaigns.isFetching}
              onClick={() => setOffset(value => value + 20)}>Trang tiếp</button></div>
        </>}
  </section>
}

export function PublicCampaignDetail({ campaignId }: { campaignId: string }) {
  const detail = useQuery({ queryKey: ['public-campaign', campaignId], queryFn: ({ signal }) => getPublicCampaign(campaignId, signal),
    retry: false, refetchInterval: 10_000 })
  return <>
    <a className="public-back" href="#/">← Khám phá campaign</a>
    {detail.isPending ? <p role="status">Đang tải campaign…</p>
      : detail.isError ? <section className="panel public-empty"><h1>Campaign chưa khả dụng</h1>
        <p role="alert">{getErrorMessage(detail.error)}</p><button className="button button--secondary" onClick={() => void detail.refetch()}>Thử lại</button></section>
        : <><IndexerNotice sync={detail.data.sync} /><CampaignInformation campaign={detail.data.campaign} workflow={detail.data.workflow}>
          <CampaignJourney campaign={detail.data.campaign} workflow={detail.data.workflow} sync={detail.data.sync} />
          {detail.data.workflow && <MilestoneWorkflow campaignId={campaignId} index={String(Math.min(Number(detail.data.workflow.currentMilestoneIndex), detail.data.campaign.milestones.length - 1))} />}
          <DonatePanel campaign={detail.data.campaign} workflow={detail.data.workflow} sync={detail.data.sync} onRefresh={() => void detail.refetch()} />
          <RefundPanel key={campaignId} campaign={detail.data.campaign} onRefresh={() => void detail.refetch()} />
        </CampaignInformation></>}
  </>
}
