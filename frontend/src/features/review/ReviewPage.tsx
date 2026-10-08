import { useQuery } from '@tanstack/react-query'
import type { AccountSession } from '../../lib/api/auth'
import { getReviewAccess, getReviewCampaign, listReviewCampaigns } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignInformation, IndexerNotice } from '../explore/PublicCampaigns'
import { ReviewDecision } from './ReviewDecision'

export function ReviewPage({ session, sessionLoading, campaignId }: {
  session: AccountSession | null; sessionLoading: boolean; campaignId?: string
}) {
  const access = useQuery({ queryKey: ['review-access', session?.userId], queryFn: ({ signal }) => getReviewAccess(signal),
    enabled: Boolean(session), retry: false, staleTime: 0, refetchInterval: 10_000 })
  const allowed = Boolean(session && access.data?.allowed && !access.isError)
  const queue = useQuery({ queryKey: ['review-campaigns', session?.userId], queryFn: ({ signal }) => listReviewCampaigns(signal),
    enabled: allowed && !campaignId, retry: false, refetchInterval: 4_000 })
  const detail = useQuery({ queryKey: ['review-campaign', session?.userId, campaignId],
    queryFn: ({ signal }) => getReviewCampaign(campaignId!, signal), enabled: allowed && Boolean(campaignId), retry: false, staleTime: 0, refetchInterval: 4_000 })

  if (sessionLoading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>
  if (!session) return <section className="panel public-empty"><h1>Duyệt campaign</h1><p>Đăng nhập tài khoản có quyền RESOLVER để xét hồ sơ. Liên kết ví resolver chỉ cần khi ký duyệt trên blockchain.</p><a className="button button--primary" href="#/account">Đăng nhập</a></section>
  if (access.isPending) return <p role="status">Backend đang kiểm tra quyền resolver…</p>
  if (access.isError) return <section className="panel"><h1>Chưa kiểm tra được quyền resolver</h1><p role="alert">{getErrorMessage(access.error)}</p>
    <button className="button button--secondary" onClick={() => void access.refetch()}>Thử lại</button></section>
  if (!access.data.allowed) return <section className="panel"><h1>Tài khoản chưa có quyền resolver</h1>
    <p>RESOLVER role cần được platform cấp. ADMIN và donor không tự có quyền xét duyệt.</p>
    <p className="public-wallet-address">Resolver on-chain: <code>{access.data.resolver}</code></p></section>

  if (campaignId) return <>
    <a className="public-back" href="#/internal/campaigns">← Hàng chờ duyệt</a>
    {detail.isPending ? <p role="status">Đang tải hồ sơ đã chốt…</p> : detail.isError ? <section className="panel"><p role="alert">{getErrorMessage(detail.error)}</p>
      <button className="button button--secondary" onClick={() => void detail.refetch()}>Thử lại</button></section> : <>
      <IndexerNotice sync={detail.data.sync} />
      <CampaignInformation campaign={detail.data.campaign} />
      {detail.data.campaign.state === 'CANCELLED' ? <section className="panel"><h2>Campaign đã bị hủy</h2>
        <p>Không thể duyệt hoặc công bố campaign đã hủy.</p></section> : null}
      <ReviewDecision key={`${session.userId}:${campaignId}`} detail={detail.data} userId={session.userId}
        refresh={() => { void detail.refetch(); void queue.refetch() }} />
    </>}
  </>

  return <>
    <div className="feed-heading"><h1>Hàng chờ resolver duyệt</h1><button className="button button--secondary" disabled={queue.isFetching} onClick={() => void queue.refetch()}>Tải lại</button></div>
    <p className="public-wallet-address">Resolver được backend xác nhận: <code>{access.data.resolver}</code></p>
    {queue.isPending ? <p role="status">Đang tải hàng chờ…</p> : queue.isError ? <p role="alert">{getErrorMessage(queue.error)}</p> : <>
      <IndexerNotice sync={queue.data.sync} />
      {queue.data.items.length === 0 ? <section className="public-empty"><h2>Không có campaign đủ điều kiện chờ duyệt</h2><p>Hàng chờ chỉ chứa campaign DRAFT đã khớp hồ sơ, ghi đủ tiêu chí và khóa đủ bond.</p></section>
        : <ul className="public-campaign-grid">{queue.data.items.map(campaign => <li className="panel" key={campaign.id}>
          <h2>{campaign.title}</h2><p>{campaign.organization.name}</p><p>Campaign on-chain: {campaign.onchainCampaignId}</p>
          <a className="button button--primary" href={`#/internal/campaigns/${campaign.id}`}>Kiểm tra và duyệt</a>
        </li>)}</ul>}
      {(queue.data.history ?? []).length > 0 && <section className="panel"><h2>Lịch sử xét duyệt</h2><ul>{queue.data.history.map(campaign => <li key={campaign.id}>
        <a href={`#/internal/campaigns/${campaign.id}`}>{campaign.title}</a> · {campaign.review.decision} · {campaign.state}
      </li>)}</ul></section>}
    </>}
  </>
}
