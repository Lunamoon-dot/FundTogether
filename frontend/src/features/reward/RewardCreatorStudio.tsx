import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import {
  listMyRewardCampaigns,
  getCreatorProfile,
} from '../../lib/api/reward';
import { EditionsPreparationPanel, NewEditionsPreparationPanel } from './EditionsReview';
import { CreatorPipeline } from './ui/CreatorPipeline';
import { CreatorTaskCard } from './ui/CreatorTaskCard';
import { isCreatorActionable } from './ui/creatorTaskUtils';
import { EditionStatusBadge } from './ui/EditionStatusBadge';
import { getCampaignUiState } from './ui/campaignState';
import type { RewardCampaign } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import { editionsApi } from '../../lib/api/editions';
import './reward.css';

export function RewardCreatorStudio({ userId, path }: { userId: string; path?: string }) {
  const tab: 'studio' | 'draft' = path === '/reward/creator/draft' || path === '/reward/creator/new'
    ? 'draft'
    : 'studio';

  const { data: profile, isPending: profilePending } = useQuery({
    queryKey: ['my-reward-creator-profile', userId],
    queryFn: ({ signal }) => getCreatorProfile(signal),
  });

  const { data: campaigns, isPending, error, refetch } = useQuery({
    queryKey: ['my-reward-campaigns', userId],
    queryFn: ({ signal }) => listMyRewardCampaigns(signal),
    refetchInterval: 10_000,
  });
  const operations = useQuery({
    queryKey: ['reward-editions-operations', 'creator', userId],
    queryFn: ({ signal }) => editionsApi.operations('creator', signal),
    refetchInterval: 10_000,
  });
  const editionsCampaigns = (campaigns ?? []).filter(
    campaign => campaign.draftConfig != null || campaign.category === 'COMICS_ARTBOOK',
  );
  const creatorTasks = editionsCampaigns.filter(campaign => {
    const operation = operations.data?.find(item => item.campaignId === campaign.id);
    return isCreatorActionable(campaign, operation);
  });

  const [newlyCreatedCampaign, setNewlyCreatedCampaign] = useState<RewardCampaign | null>(null);

  async function handleNewCampaignCreated(campaign: RewardCampaign) {
    const result = await refetch();
    setNewlyCreatedCampaign(result.data?.find(item => item.id === campaign.id) ?? campaign);
  }

  async function refreshNewlyCreatedCampaign() {
    if (!newlyCreatedCampaign) return;
    const result = await refetch();
    const updated = result.data?.find(item => item.id === newlyCreatedCampaign.id);
    if (updated) setNewlyCreatedCampaign(updated);
  }

  return (
    <div className="reward-container">
      {/* The Atelier Masthead */}
      <header className="atelier-masthead">
        <div className="atelier-masthead__meta">
          <span className="atelier-masthead__kicker">XƯỞNG ẤN PHẨM</span>
          <span>·</span>
          <span>BÀN VẼ KỸ THUẬT &amp; BẢO CHỨNG IP</span>
        </div>
        <h1 className="atelier-masthead__title">Xưởng ấn phẩm</h1>
        <p className="atelier-masthead__subtitle">
          Tạo bản thảo và xử lý toàn bộ vòng đời ấn phẩm từ chuẩn bị, thẩm định đến phát hành PDF.
        </p>
      </header>

      {tab === 'studio' && !profilePending && profile?.status !== 'VERIFIED' && (
        <section className="panel">
          <h2>{profile ? 'Hoàn thiện Hồ sơ Studio' : 'Khởi tạo Hồ sơ Studio'}</h2>
          <p className="muted">Bạn cần được Admin xác minh danh tính xuất bản và cam kết bản quyền IP trước khi tạo ấn phẩm.</p>
          <a className="button button--primary" href="#/reward/creator/profile">
            {profile ? 'Mở Hồ sơ Studio' : 'Khởi tạo Studio (Create Studio)'}
          </a>
        </section>
      )}

      {tab === 'draft' && (
        profilePending ? (
          <p role="status" className="muted">Đang kiểm tra Hồ sơ Studio…</p>
        ) : profile?.status !== 'VERIFIED' ? (
          <section className="panel" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <h2 style={{ marginBottom: '8px' }}>Chưa xác minh Hồ sơ Studio / Tác giả</h2>
            <p className="muted" style={{ maxWidth: '540px', margin: '0 auto 24px auto', lineHeight: '1.6' }}>
              {profile?.status === 'PENDING'
                ? 'Hồ sơ Studio của bạn đang chờ Admin thẩm định và phê duyệt (Flow V1). Vui lòng đợi phê duyệt để có thể khởi tạo bản thảo.'
                : profile?.status === 'REJECTED'
                ? `Hồ sơ Studio bị từ chối (${profile.rejectionReason || 'Vui lòng kiểm tra lại thông tin'}). Vui lòng cập nhật lại hồ sơ Studio.`
                : 'Để đảm bảo tính minh bạch và bảo hộ quyền sở hữu trí tuệ, bạn cần tạo Hồ sơ Tác giả & cam kết Bản quyền IP (Bước 0) trước khi có thể khởi tạo bản thảo gọi vốn.'}
            </p>
            <div>
              <a className="button button--primary" href="#/reward/creator/profile">
                {profile ? 'Mở Hồ sơ Studio' : 'Khởi tạo Studio (Create Studio)'}
              </a>
            </div>
          </section>
        ) : (
          newlyCreatedCampaign ? (
            <EditionsPreparationPanel campaign={newlyCreatedCampaign} initialStep={2} onChange={refreshNewlyCreatedCampaign} />
          ) : (
            <NewEditionsPreparationPanel onCreated={handleNewCampaignCreated} />
          )
        )
      )}

      {/* Tiến trình sản xuất */}
      {tab === 'studio' && (
        <CreatorPipeline campaigns={editionsCampaigns} operations={operations.data} />
      )}

      {/* Cần bạn làm task cards */}
      {tab === 'studio' && creatorTasks.length > 0 && (
        <section className="creator-tasks-section panel" aria-label="Cần bạn làm">
          <h2>Cần bạn làm ({creatorTasks.length})</h2>
          <div className="creator-tasks-grid">
            {creatorTasks.map(c => {
              const editHref = c.status === 'COMMUNITY_REVIEW'
                ? `#/reward/editions/${c.id}/creator/feedback`
                : c.status === 'CHANGES_REQUESTED'
                ? `#/reward/creator?edit=${c.id}&step=3`
                : c.status === 'APPROVED'
                ? `#/reward/editions/${c.id}/creator`
                : `#/reward/creator?edit=${c.id}`;
              return (
                <CreatorTaskCard
                  key={c.id}
                  campaign={c}
                  href={editHref}
                />
              );
            })}
          </div>
        </section>
      )}

      {tab === 'studio' && editionsCampaigns.some(c =>
        operations.data?.find(item => item.campaignId === c.id)?.contractState === 4) && (
        <section className="panel creator-no-action-notice" aria-label="Campaign đang hoàn tiền">
          <h2>Campaign thất bại và đang hoàn tiền</h2>
          <p className="muted">Campaign không đạt mục tiêu. Backer tự nhận lại pledge của mình; bạn không cần thao tác nào ở bước này.</p>
        </section>
      )}

      {/* Danh sách ấn phẩm */}
      {tab === 'studio' && (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h2>Dự án của bạn ({editionsCampaigns.length})</h2>
            {profile?.status === 'VERIFIED' && (
              <a href="#/reward/creator/draft" className="button button--primary button--lg">
                Tạo bản thảo mới
              </a>
            )}
          </div>
          {isPending ? (
            <p className="muted">Đang tải danh sách…</p>
          ) : error ? (
            <p className="toast toast--error">{getErrorMessage(error)}</p>
          ) : editionsCampaigns.length === 0 ? (
            <div style={{ marginTop: '12px' }}>
              <p className="muted">Bạn chưa tạo chiến dịch truyện tranh nào.</p>
              {profile?.status === 'VERIFIED' && (
                <div style={{ marginTop: '12px' }}>
                  <a href="#/reward/creator/draft" className="button button--primary button--lg">
                    Khởi tạo bản thảo đầu tiên
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              {editionsCampaigns.map(c => {
                const operation = operations.data?.find(item => item.campaignId === c.id);
                const projectedChainState = operation?.contractState ?? null;
                const projectUiState = getCampaignUiState({ status: c.status, chainState: projectedChainState,
                  publicationStatus: operation?.publicationStatus, role: 'creator' });
                const standardTier = c.draftConfig?.tiers[0];
                const pdf = standardTier?.rewardItems[0];
                return (
                <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0' }}>{c.title}</h3>
                      <EditionStatusBadge state={projectUiState} />
                      <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '10px' }}>
                        Mục tiêu: {formatUnits(BigInt(c.goal), 6)} MockUSDC · {c.draftConfig?.tiers.length ?? 0} gói
                        {operation?.onchainCampaignId ? ` · On-chain #${operation.onchainCampaignId}` : ''}
                      </span>
                      {standardTier && pdf && (
                        <div>
                          <p><strong>{pdf.title}</strong> · Standard PDF · {formatUnits(BigInt(standardTier.price), 6)} MockUSDC</p>
                          <p className="muted">{pdf.description}</p>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {projectedChainState === 4 && <p className="muted">Campaign không đạt mục tiêu. Backer tự nhận hoàn tiền; Creator không cần thao tác.</p>}
                      {projectedChainState === 0 && <p className="muted">Campaign đang gây quỹ trên chain. Hiện chưa có việc nào cần Creator xử lý.</p>}
                      {projectedChainState === 1 && <a className="button button--primary" href={`#/reward/editions/${c.id}/creator`}>Cập nhật tiến độ sản xuất →</a>}
                      {projectedChainState === null && <p className="muted">Standard PDF · Hoàn thiện hồ sơ và gửi thẩm định; bản thảo chưa nhận pledge.</p>}
                      {projectedChainState === null && c.status === 'UNDER_REVIEW_PRIVATE' && <p className="muted">Hồ sơ đang được Resolver kiểm tra riêng; chưa mở community review.</p>}
                      {operation?.publicationStatus === 'ORPHANED' && <p className="muted">Có binding cũ nhưng chưa canonical. Không tạo campaign mới; hãy mở chi tiết để đối chiếu.</p>}
                      {projectedChainState === null && c.frozenSnapshot && ['COMMUNITY_REVIEW', 'APPROVED'].includes(c.status) && (
                        <a className="button button--secondary" href={c.status === 'COMMUNITY_REVIEW' ? `#/reward/editions/${c.id}/creator/feedback` : `#/reward/editions/${c.id}/creator`}>
                          {c.status === 'COMMUNITY_REVIEW' ? 'Xem góp ý cộng đồng →' : 'Mở chi tiết campaign →'}
                        </a>
                      )}

                    </div>
                  </div>

                  {projectedChainState === null && ['DRAFT', 'FROZEN', 'CHANGES_REQUESTED'].includes(c.status) && <EditionsPreparationPanel campaign={c} onChange={() => refetch()} />}

                </div>
              ); })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

