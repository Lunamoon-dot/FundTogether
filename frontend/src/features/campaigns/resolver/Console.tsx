import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi, listResolverCampaigns, type ResolverCase as ResolverCaseData } from '../api/campaigns';
import { ResolverReview } from './ReviewPanel';
import { CommunityPanel } from '../public/Community';
import { ReviewQueue } from '../shared/ui/ReviewQueue';
import { ReviewHistoryDisclosure } from '../shared/ui/ReviewHistoryDisclosure';
import { ResolverCase } from '../shared/ui/ResolverCase';
import '../shared/styles.css';

export function Console({ userId }: { userId: string }) {
  const { data: campaignData, error, isPending, refetch } = useQuery({
    queryKey: ['campaign-resolver-campaigns', userId],
    queryFn: ({ signal }) => listResolverCampaigns(signal),
    retry: false,
  });
  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'resolver', userId],
    queryFn: ({ signal }) => campaignApi.operations('resolver', signal),
    refetchInterval: 10_000,
    retry: false,
  });
  const cases = useQuery({
    queryKey: ['campaign-campaign-resolver-cases', userId],
    queryFn: ({ signal }) => campaignApi.resolverCases(signal),
    refetchInterval: 10_000,
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const campaigns = (campaignData ?? []).filter(
    campaign => campaign.draftConfig != null || campaign.category === 'COMICS_ARTBOOK',
  );
  const onchainOperations = (operations.data ?? []).filter(operation =>
    operation.publicationStatus === 'ON_CHAIN_CONFIRMED'
      && operation.onchainCampaignId !== null
      && !campaigns.some(campaign => campaign.id === operation.campaignId),
  );
  const resolverWorkCount = campaigns.length + onchainOperations.length;
  const activeSelectedId = selectedId ?? campaigns[0]?.id;
  const selectedCampaign = campaigns.find(campaign => campaign.id === activeSelectedId)
    ?? campaigns[0]
    ?? null;
  const selectedOperation = operations.data?.find(item => item.campaignId === selectedCampaign?.id);
  const selectedNeedsOnchainWorkspace = Boolean(selectedOperation?.publicationStatus === 'ON_CHAIN_CONFIRMED'
    && selectedOperation.onchainCampaignId !== null);
  const selectedNeedsActivation = Boolean(selectedCampaign && ['APPROVED', 'PUBLISHED'].includes(selectedCampaign.status)
    && (selectedOperation?.publicationStatus ?? 'NOT_PUBLISHED') === 'NOT_PUBLISHED');

  return (
    <div className="campaign-container resolver-console">
      <h1 className="public-sr-only">Hàng đợi thẩm định</h1>


      {(error || operations.error || cases.error) && <p className="toast toast--error" role="alert">{getErrorMessage(error || operations.error || cases.error)}</p>}

      <section className="panel resolver-queue" aria-labelledby="resolver-queue-title">
        <div className="resolver-section-heading">
          <div>
            <span className="resolver-section-kicker">Công việc hiện tại</span>
            <h2 id="resolver-queue-title">
              Chiến dịch cần xử lý <span className="resolver-count">{resolverWorkCount}</span>
            </h2>
            <p className="muted">Chọn một hồ sơ hoặc campaign on-chain để xem hành động tiếp theo.</p>
          </div>
        </div>

        {isPending ? (
          <p className="muted" role="status">Đang tải hàng đợi thẩm định…</p>
        ) : campaigns.length === 0 && onchainOperations.length === 0 ? (
          <div className="resolver-empty-state" role="status">
            <span className="resolver-empty-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>Không có chiến dịch nào cần thẩm định lúc này.</strong>
              <p>Campaign mới sẽ xuất hiện sau khi Creator gửi hồ sơ.</p>
            </div>
          </div>
        ) : campaigns.length === 0 ? (
          <p className="muted" role="status">Không có hồ sơ review mới; campaign on-chain cần xử lý đang hiển thị bên dưới.</p>
        ) : (
          <div className="resolver-master-detail">
            <aside className="resolver-master-detail__sidebar" aria-label="Danh sách hồ sơ">
              <ReviewQueue
                campaigns={campaigns}
                operations={operations.data}
                selectedId={activeSelectedId}
                onSelect={setSelectedId}
                onRefresh={() => { void refetch(); void operations.refetch(); }}
              />
            </aside>

            <main className="resolver-master-detail__main">
              {selectedCampaign && (
                <article className="resolver-campaign-card" key={selectedCampaign.id}>
                  <ResolverReview campaign={selectedCampaign} onChange={() => void refetch()} />

                  {selectedNeedsOnchainWorkspace && (
                    <div className="resolver-next-action resolver-next-action--approved">
                      <div className="resolver-next-action__text">
                        <strong>Campaign đã canonical trên chain</strong>
                        <p>Mở workspace on-chain để kiểm tra deadline, funding state và ký bước tiếp theo.</p>
                      </div>
                      <a className="button button--primary" href={`#/campaigns/${selectedCampaign.id}/resolver`}>
                        Mở workspace on-chain →
                      </a>
                    </div>
                  )}

                  {selectedNeedsActivation && (
                    <div className="resolver-next-action resolver-next-action--approved">
                      <div className="resolver-next-action__text">
                        <strong>{selectedCampaign.status === 'PUBLISHED' ? 'Campaign cần kích hoạt lại trên deployment hiện tại' : 'Hồ sơ đã được duyệt'}</strong>
                        <p>Chuyển sang workspace activation để ký đúng commitment và chờ Creator tạo campaign canonical.</p>
                      </div>
                      <a className="button button--primary" href={`#/campaigns/${selectedCampaign.id}/resolver`}>
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
                      <CommunityPanel
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

      {onchainOperations.length > 0 && (
        <section className="panel resolver-cases" aria-labelledby="resolver-onchain-title">
          <div className="resolver-section-heading">
            <div>
              <span className="resolver-section-kicker">Vòng đời on-chain</span>
              <h2 id="resolver-onchain-title">Campaign on-chain cần xử lý <span className="resolver-count">{onchainOperations.length}</span></h2>
              <p className="muted">Các campaign đã canonical không nằm trong hàng đợi thẩm định hồ sơ, nhưng vẫn cần Resolver xử lý theo state contract.</p>
            </div>
          </div>
          <div className="resolver-campaign-list">
            {onchainOperations.map(operation => (
              <article className="resolver-campaign-card" key={operation.campaignId}>
                <header className="resolver-campaign-card__header">
                  <div>
                    <span className="resolver-section-kicker">On-chain #{operation.onchainCampaignId}</span>
                    <h3>{operation.title}</h3>
                  </div>
                  <span className="resolver-status-pill">State {operation.contractState}</span>
                </header>
                <p className="muted">
                  {operation.contractState === 0
                    ? 'Campaign đang ở FUNDING. Mở workspace để kiểm tra deadline và chốt kết quả khi đã hết hạn.'
                    : operation.contractState === 1
                      ? 'Campaign đã gây quỹ thành công và đang chờ tiến độ sản xuất.'
                      : operation.contractState === 2
                        ? 'Bằng chứng phát hành đang chờ Resolver kiểm tra.'
                        : operation.contractState === 3
                        ? 'PDF đã được duyệt; theo dõi challenge trước khi chốt hoàn thành.'
                          : operation.contractState === 4
                            ? 'Campaign đang ở trạng thái hoàn tiền.'
                            : operation.contractState === 5
                            ? 'Creator đã gửi hồ sơ hoàn thành; kiểm tra và quyết định Resolver.'
                            : 'Campaign đã hoàn thành canonical; Backer tự quyết toán surplus.'}
                </p>
                <a className="button button--primary" href={`#/campaigns/${operation.campaignId}/resolver`}>
                  Mở workspace on-chain →
                </a>
              </article>
            ))}
          </div>
        </section>
      )}

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
            {cases.data.map((caseItem: ResolverCaseData) => (
              <ResolverCase key={caseItem.id} userId={userId} caseItem={caseItem} onChanged={() => cases.refetch()} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
