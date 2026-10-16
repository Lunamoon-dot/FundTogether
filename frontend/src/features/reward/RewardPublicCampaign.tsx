import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { getRewardPublicCampaign } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import './reward.css';

export function RewardPublicCampaign({ campaignId }: { campaignId: string }) {
  const { data: campaign, isPending, error } = useQuery({ queryKey: ['reward-public-campaign', campaignId],
    queryFn: ({ signal }) => getRewardPublicCampaign(campaignId, signal) });
  if (isPending) return <p role="status">Đang tải lịch sử campaign…</p>;
  if (error || !campaign) return <p role="alert">{getErrorMessage(error || 'Không tìm thấy campaign')}</p>;
  return <div className="reward-container"><a href="#/reward/history">← Về mục Đã gây quỹ</a>
    <h1>{campaign.title}</h1><p>{campaign.pitch}</p>
    <section className="panel"><h2>Cam kết đã lưu</h2><p>{campaign.story}</p>
      <p>{campaign.status} · Mục tiêu {formatUnits(BigInt(campaign.goal), 6)} MockUSDC</p>
      <p>Hồ sơ này không nhận pledge mới trong Editions. Quyền lợi cũ giữ nguyên theo deployment và sự kiện tương ứng.</p>
      <a className="button button--secondary" href="#/reward/history/my-rewards">Xem quyền lợi lịch sử của tôi</a>
    </section>
    {campaign.tiers.map(tier => <article key={tier.id} className="panel"><h2>{tier.title}</h2>
      <p>{tier.description}</p><p>{formatUnits(BigInt(tier.price), 6)} MockUSDC · {tier.pledgedQuantity} quyền lợi đã ghi nhận</p>
    </article>)}
  </div>;
}
