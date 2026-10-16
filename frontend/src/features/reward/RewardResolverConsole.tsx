import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listResolverRewardCampaigns } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import { editionsApi, type EditionsResolverCase as EditionsResolverCaseData } from '../../lib/api/editions';
import { EditionsResolverReview } from './EditionsReview';
import { EditionsCommunity } from './EditionsCampaign';
import { ReviewQueue } from './ui/ReviewQueue';
import { ReviewHistoryDisclosure } from './ui/ReviewHistoryDisclosure';
import { EditionsResolverCase } from './ui/EditionsResolverCase';
import './reward.css';

export function RewardResolverConsole({ userId }: { userId: string }) {
  const { data: campaigns, error, isPending, refetch } = useQuery({
    queryKey: ['reward-resolver-campaigns', userId],
    queryFn: ({ signal }) => listResolverRewardCampaigns(signal),
    retry: false,
  });
  const operations = useQuery({
    queryKey: ['reward-editions-operations', 'resolver', userId],
    queryFn: ({ signal }) => editionsApi.operations('resolver', signal),
    refetchInterval: 10_000,
    retry: false,
  });
  const cases = useQuery({
    queryKey: ['reward-editions-resolver-cases', userId],
    queryFn: ({ signal }) => editionsApi.resolverCases(signal),
    refetchInterval: 10_000,
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const editionsCampaigns = (campaigns ?? []).filter(
    campaign => campaign.draftConfig != null || campaign.category === 'COMICS_ARTBOOK',
  );
  const activeSelectedId = selectedId ?? editionsCampaigns[0]?.id;
  const selectedCampaign = editionsCampaigns.find(campaign => campaign.id === activeSelectedId)
    ?? editionsCampaigns[0]
    ?? null;
  const selectedOperation = operations.data?.find(item => item.campaignId === selectedCampaign?.id);

  return (
    <div className="reward-container resolver-console">
      <header className="reward-hero">
        <span className="reward-badge-category">FundTogether Editions · Resolver</span>
        <h1 className="reward-hero-title">Hàng đợi thẩm định</h1>
        <p className="reward-hero-pitch">
          Kiểm tra hồ sơ PDF, quyết định vòng review và chuyển sang trang hợp đồng khi cần ký giao dịch.
        </p>
      </header>

      {(error || operations.error || cases.error) && <p className="toast toast--error" role="alert">{getErrorMessage(error || operations.error || cases.error)}</p>}

      <section className="panel resolver-queue" aria-labelledby="resolver-queue-title">
        <div className="resolver-section-heading">
          <div>
            <span className="resolver-section-kicker">Công việc hiện tại</span>
            <h2 id="resolver-queue-title">
              Chiến dịch cần xử lý <span className="resolver-count">{editionsCampaigns.length}</span>
            </h2>
            <p className="muted">Chọn một hồ sơ để xem cam kết, tài liệu mẫu, phản hồi và hành động tiếp theo.</p>
          </div>
        </div>

        {isPending ? (
          <p className="muted" role="status">Đang tải hàng đợi thẩm định…</p>
        ) : editionsCampaigns.length === 0 ? (
          <div className="resolver-empty-state" role="status">
            <span className="resolver-empty-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>Không có chiến dịch nào cần thẩm định lúc này.</strong>
              <p>Campaign mới sẽ xuất hiện sau khi Creator gửi hồ sơ Editions.</p>
            </div>
          </div>
        ) : (
          <div className="resolver-master-detail">
            <aside className="resolver-master-detail__sidebar" aria-label="Danh sách hồ sơ">
              <ReviewQueue
                campaigns={editionsCampaigns}
                operations={operations.data}
                selectedId={activeSelectedId}
                onSelect={setSelectedId}
                onRefresh={() => { void refetch(); void operations.refetch(); }}
              />
            </aside>

            <main className="resolver-master-detail__main">
              {selectedCampaign && (
                <article className="resolver-campaign-card" key={selectedCampaign.id}>
                  <EditionsResolverReview campaign={selectedCampaign} onChange={() => void refetch()} />

                  {selectedCampaign.status === 'APPROVED' && (
                    <div className="resolver-next-action">
                      <strong>{selectedOperation?.publicationStatus === 'ON_CHAIN_CONFIRMED' ? 'Campaign đã canonical' : selectedOperation?.publicationStatus === 'ORPHANED' ? 'Cần đối chiếu binding' : 'Hồ sơ đã được duyệt'}</strong>
                      <p>{selectedOperation?.publicationStatus === 'ON_CHAIN_CONFIRMED'
                        ? 'Mở workspace vòng đời để xử lý đúng trạng thái contract hiện tại.'
                        : selectedOperation?.publicationStatus === 'ORPHANED'
                          ? 'Kiểm tra transaction binding hiện có; không tạo campaign mới để thay thế.'
                          : 'Chuyển sang workspace activation để ký đúng commitment và chờ Creator tạo campaign canonical.'}</p>
                      <a className="button button--primary" href={`#/reward/editions/${selectedCampaign.id}/resolver`}>
                        Mở trang xử lý on-chain →
                      </a>
                    </div>
                  )}

                  {selectedCampaign.reviews && selectedCampaign.reviews.length > 0 && (
                    <ReviewHistoryDisclosure reviews={selectedCampaign.reviews} />
                  )}

                  {selectedCampaign.commitmentHash && ['COMMUNITY_REVIEW', 'APPROVED'].includes(selectedCampaign.status) && (
                    <details className="resolver-community-details">
                      <summary>
                        Phản hồi cộng đồng <span>Góp ý tham khảo · không phải phiếu quyết định</span>
                      </summary>
                      <EditionsCommunity
                        id={selectedCampaign.id}
                        userId={userId}
                        viewerMode="resolver"
                        commitmentHash={selectedCampaign.commitmentHash}
                      />
                    </details>
                  )}
                </article>
              )}
            </main>
          </div>
        )}
      </section>

      {cases.data && cases.data.length > 0 && (
        <section className="panel resolver-cases" aria-labelledby="resolver-cases-title">
          <div className="resolver-section-heading">
            <div>
              <span className="resolver-section-kicker">Trao đổi cần can thiệp</span>
              <h2 id="resolver-cases-title">Resolver cases <span className="resolver-count">{cases.data.length}</span></h2>
              <p className="muted">Đọc đầy đủ ngữ cảnh, yêu cầu Creator làm rõ và ghi nhận outcome của cuộc trao đổi.</p>
            </div>
          </div>
          <div className="resolver-case-list">
            {cases.data.map((caseItem: EditionsResolverCaseData) => (
              <EditionsResolverCase key={caseItem.id} userId={userId} caseItem={caseItem} onChanged={() => cases.refetch()} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
