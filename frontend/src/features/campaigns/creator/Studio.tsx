import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { getCreatorProfile, listCreatorCampaigns } from '../api/campaigns';
import { NewPreparationPanel } from './NewPreparationForm';
import { PreparationPanel } from './PreparationForm';
import { CreatorPipeline } from '../shared/ui/CreatorPipeline';
import { CreatorTaskCard } from '../shared/ui/CreatorTaskCard';
import { isCreatorActionable } from '../shared/ui/creatorTaskUtils';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { getCampaignUiState } from '../shared/ui/campaignState';
import type { Campaign } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi } from '../api/campaigns';
import { campaignDetailHref } from '../../explore/campaignRoutes';
import '../shared/styles.css';

export function Studio({ userId, path }: { userId: string; path?: string }) {
  const tab: 'studio' | 'draft' = path === '/campaigns/creator/draft' || path === '/campaigns/creator/new'
    ? 'draft'
    : 'studio';

  const { data: profile, isPending: profilePending } = useQuery({
    queryKey: ['my-campaign-creator-profile', userId],
    queryFn: ({ signal }) => getCreatorProfile(signal),
  });

  const { data: campaignData, isPending, error, refetch } = useQuery({
    queryKey: ['my-campaign-campaigns', userId],
    queryFn: ({ signal }) => listCreatorCampaigns(signal),
    refetchInterval: 10_000,
  });
  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'creator', userId],
    queryFn: ({ signal }) => campaignApi.operations('creator', signal),
    refetchInterval: 10_000,
  });
  const campaigns = (campaignData ?? []).filter(
    campaign => campaign.draftConfig != null || campaign.category === 'COMICS_ARTBOOK',
  );
  const creatorTasks = campaigns.filter(campaign => {
    const operation = operations.data?.find(item => item.campaignId === campaign.id);
    return isCreatorActionable(campaign, operation);
  });

  const [newlyCreatedCampaign, setNewlyCreatedCampaign] = useState<Campaign | null>(null);

  async function handleNewCampaignCreated(campaign: Campaign) {
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
    <div className="campaign-container">
      {/* Accessible Page Heading */}
      <h1 className="public-sr-only">Xưởng ấn phẩm</h1>


      {tab === 'studio' && !profilePending && profile?.status !== 'VERIFIED' && (
        <section className="panel studio-onboarding-panel">
          <h2>{profile ? 'Hoàn thiện Hồ sơ Studio' : 'Khởi tạo Hồ sơ Studio'}</h2>
          <p className="muted">Bạn cần được Admin xác minh danh tính xuất bản và cam kết bản quyền IP trước khi tạo ấn phẩm.</p>
          <div className="pt-2">
            <a className="button button--primary studio-cta-btn" href="#/campaigns/creator/profile">
              <span className="studio-cta-btn__icon" aria-hidden="true">✦</span>
              <span>{profile ? 'Mở Hồ sơ Studio' : 'Khởi tạo Studio (Create Studio)'}</span>
              <span className="studio-cta-btn__arrow" aria-hidden="true">→</span>
            </a>
          </div>
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
              <a className="button button--primary studio-cta-btn" href="#/campaigns/creator/profile">
                <span className="studio-cta-btn__icon" aria-hidden="true">✦</span>
                <span>{profile ? 'Mở Hồ sơ Studio' : 'Khởi tạo Studio (Create Studio)'}</span>
                <span className="studio-cta-btn__arrow" aria-hidden="true">→</span>
              </a>
            </div>
          </section>
        ) : (
          newlyCreatedCampaign ? (
            <PreparationPanel campaign={newlyCreatedCampaign} initialStep={2} onChange={refreshNewlyCreatedCampaign} />
          ) : (
            <NewPreparationPanel onCreated={handleNewCampaignCreated} />
          )
        )
      )}

      {/* Tiến trình sản xuất */}
      {tab === 'studio' && (
        <CreatorPipeline campaigns={campaigns} operations={operations.data} />
      )}

      {/* Cần bạn làm task cards */}
      {tab === 'studio' && creatorTasks.length > 0 && (
        <section className="creator-tasks-section panel" aria-label="Cần bạn làm">
          <h2>Cần bạn làm ({creatorTasks.length})</h2>
          <div className="creator-tasks-grid">
            {creatorTasks.map(c => {
              const operation = operations.data?.find(item => item.campaignId === c.id);
              const editHref = operation?.contractState === 1
                ? campaignDetailHref('creator', c.id, 'production')
                : c.status === 'COMMUNITY_REVIEW'
                ? campaignDetailHref('creator', c.id, 'activity')
                : c.status === 'CHANGES_REQUESTED'
                ? `#/campaigns/creator?edit=${c.id}&step=3`
                : ['APPROVED', 'PUBLISHED'].includes(c.status)
                ? campaignDetailHref('creator', c.id)
                : `#/campaigns/creator?edit=${c.id}`;
              return (
                <CreatorTaskCard
                  key={c.id}
                  campaign={c}
                  href={editHref}
                  chainState={operation?.contractState}
                />
              );
            })}
          </div>
        </section>
      )}

      {tab === 'studio' && campaigns.some(c =>
        operations.data?.find(item => item.campaignId === c.id)?.contractState === 4) && (
        <section className="panel creator-no-action-notice" aria-label="Campaign đang hoàn tiền">
          <h2>Campaign thất bại và đang hoàn tiền</h2>
          <p className="muted">Campaign không đạt mục tiêu. Backer tự nhận lại pledge của mình; bạn không cần thao tác nào ở bước này.</p>
        </section>
      )}

      {/* Danh sách ấn phẩm */}
      {tab === 'studio' && (
        <section className="panel studio-projects-panel">
          <div className="studio-projects-header">
            <div>
              <p className="studio-section-kicker">Xưởng ấn phẩm</p>
              <h2>Dự án của bạn ({campaigns.length})</h2>
              <p className="studio-projects-header__hint">Theo dõi hồ sơ, thẩm định và tiến độ từng ấn phẩm.</p>
            </div>
            {profile?.status === 'VERIFIED' && (
              <a href="#/campaigns/creator/draft" className="button button--primary studio-projects-header__cta">
                Tạo bản thảo mới
              </a>
            )}
          </div>
          {isPending ? (
            <p className="muted">Đang tải danh sách…</p>
          ) : error ? (
            <p className="toast toast--error">{getErrorMessage(error)}</p>
          ) : campaigns.length === 0 ? (
            <div className="studio-projects-empty">
              <p className="muted">Bạn chưa tạo chiến dịch truyện tranh nào.</p>
            </div>
          ) : (
            <div className="studio-project-list">
              {campaigns.map(c => {
                const operation = operations.data?.find(item => item.campaignId === c.id);
                const projectedChainState = operation?.contractState ?? null;
                const projectUiState = getCampaignUiState({ status: c.status, chainState: projectedChainState,
                  publicationStatus: operation?.publicationStatus, role: 'creator' });
                const standardTier = c.draftConfig?.tiers[0];
                const pdf = standardTier?.benefitItems[0];
                const activationPending = projectedChainState === null
                  && ['APPROVED', 'PUBLISHED'].includes(c.status)
                  && (!operation || operation.publicationStatus === 'NOT_PUBLISHED');
                return (
                <article key={c.id} className="studio-project-card">
                  <div className="studio-project-card__header">
                    <div className="studio-project-card__identity">
                      <h3 className="studio-project-card__title">{c.title}</h3>
                      <div className="studio-project-card__meta">
                        <StatusBadge state={projectUiState} />
                        <span className="studio-project-card__meta-text">
                        Mục tiêu: {formatUnits(BigInt(c.goal), 6)} MockUSDC · {c.draftConfig?.tiers.length ?? 0} gói
                        {operation?.onchainCampaignId ? ` · On-chain #${operation.onchainCampaignId}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="studio-project-card__body">
                    {standardTier && pdf && (
                      <div className="studio-project-card__details">
                        <p><strong>{pdf.title}</strong> · Standard PDF · {formatUnits(BigInt(standardTier.price), 6)} MockUSDC</p>
                        <p className="muted">{pdf.description}</p>
                      </div>
                    )}

                    <div className="studio-project-card__next">
                      <span className="studio-project-card__next-label">Tiếp theo</span>
                      {projectedChainState === 4 && <p className="studio-project-card__message muted">Campaign không đạt mục tiêu. Backer tự nhận hoàn tiền; Creator không cần thao tác.</p>}
                      {projectedChainState === 0 && <p className="studio-project-card__message muted">Campaign đang gây quỹ trên chain. Hiện chưa có việc nào cần Creator xử lý.</p>}
                      {projectedChainState === 1 && <a className="button button--primary studio-project-card__action" href={campaignDetailHref('creator', c.id, 'production')}>Cập nhật tiến độ sản xuất →</a>}
                      {projectedChainState === null && !activationPending && <p className="studio-project-card__message muted">Standard PDF · Hoàn thiện hồ sơ và gửi thẩm định; bản thảo chưa nhận pledge.</p>}
                      {projectedChainState === null && c.status === 'UNDER_REVIEW_PRIVATE' && <p className="studio-project-card__message muted">Hồ sơ đang được Resolver kiểm tra riêng; chưa mở community review.</p>}
                      {operation?.publicationStatus === 'ORPHANED' && <p className="studio-project-card__message muted">Có binding cũ nhưng chưa canonical. Không tạo campaign mới; hãy mở chi tiết để đối chiếu.</p>}
                      {activationPending && <p className="studio-project-card__message muted">Hồ sơ đã duyệt nhưng chưa có campaign canonical; mở workspace để kiểm tra chữ ký Resolver, sau đó Creator ký tạo campaign trên contract.</p>}
                      {activationPending && c.frozenSnapshot && ['COMMUNITY_REVIEW', 'APPROVED', 'PUBLISHED'].includes(c.status) && (
                        <a className="button button--secondary studio-project-card__action" href={c.status === 'COMMUNITY_REVIEW' ? campaignDetailHref('creator', c.id, 'activity') : campaignDetailHref('creator', c.id)}>
                          {c.status === 'COMMUNITY_REVIEW' ? 'Xem góp ý cộng đồng →' : c.status === 'PUBLISHED' ? 'Mở workspace kích hoạt →' : 'Mở chi tiết campaign →'}
                        </a>
                      )}
                    </div>
                  </div>

                  {projectedChainState === null && ['DRAFT', 'FROZEN', 'CHANGES_REQUESTED'].includes(c.status) && <PreparationPanel campaign={c} onChange={() => refetch()} />}
                </article>
              ); })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

