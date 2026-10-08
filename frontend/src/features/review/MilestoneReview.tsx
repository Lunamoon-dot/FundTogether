import { useQuery } from '@tanstack/react-query'
import { getMilestoneQueue } from '../../lib/api/milestone-workflow'
import { getErrorMessage } from '../../lib/api/error'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { MilestoneWorkflow } from '../campaigns/MilestoneWorkflow'

export function MilestoneReview({ campaignId, index }: { campaignId?: string; index?: string }) {
  const { session } = useAccountSession()
  const queue = useQuery({ queryKey: ['milestone-review-queue', session?.userId], queryFn: ({ signal }) => getMilestoneQueue(signal),
    enabled: Boolean(session && !campaignId), retry: false, refetchInterval: 10_000 })
  if (!session) return <p><a href="#/account">Đăng nhập</a> bằng tài khoản resolver.</p>
  if (campaignId && index) return <><a href="#/internal/milestones">← Hồ sơ milestone</a><MilestoneWorkflow campaignId={campaignId} index={index} /></>
  return <section className="panel"><h1>Hồ sơ milestone và phản đối</h1>
    {queue.isPending ? <p role="status">Đang đối chiếu hàng chờ…</p> : queue.isError ? <><p role="alert">{getErrorMessage(queue.error)}</p>
      <button className="button button--secondary" onClick={() => void queue.refetch()}>Thử lại</button></>
      : queue.data.items.length === 0 ? <p>Chưa có hồ sơ milestone trên deployment MVP cần theo dõi.</p> : <ul>{queue.data.items.map(item => <li key={`${item.campaignId}:${item.index}`}>
        <a href={`#/internal/milestones/${item.campaignId}/${item.index}`}>{item.title} · milestone {Number(item.index) + 1}</a>
      </li>)}</ul>}
  </section>
}
