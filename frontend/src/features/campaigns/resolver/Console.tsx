import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi, type ResolverCase as ResolverCaseData } from '../api/campaigns';
import { ResolverCase } from '../shared/ui/ResolverCase';
import { campaignDetailHref } from '../../explore/campaignRoutes';
import '../shared/styles.css';

export function Console({ userId }: { userId: string }) {
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
  const onchainOperations = (operations.data ?? []).filter(operation =>
    operation.publicationStatus === 'ON_CHAIN_CONFIRMED'
      && operation.onchainCampaignId !== null,
  );

  return (
    <div className="campaign-container resolver-console">
      <h1 className="public-sr-only">Vòng đời campaign</h1>

      {(operations.error || cases.error) && <p className="toast toast--error" role="alert">{getErrorMessage(operations.error || cases.error)}</p>}

      <section className="panel resolver-queue" aria-labelledby="resolver-queue-title">
        <div className="resolver-section-heading">
          <div>
            <span className="resolver-section-kicker">Vòng đời on-chain</span>
            <h2 id="resolver-queue-title">
              Campaign cần xử lý <span className="resolver-count">{onchainOperations.length}</span>
            </h2>
            <p className="muted">Publication case đã được quyết định bởi Judge committee. Resolver chỉ xử lý các bước lifecycle sau khi campaign canonical.</p>
          </div>
        </div>

        {operations.isPending ? (
          <p className="muted" role="status">Đang tải hàng đợi lifecycle…</p>
        ) : onchainOperations.length === 0 ? (
          <div className="resolver-empty-state" role="status">
            <span className="resolver-empty-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>Không có campaign on-chain nào cần xử lý lúc này.</strong>
              <p>Creator publication được quyết định trong Judge cases.</p>
            </div>
          </div>
        ) : (
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
                <a className="button button--primary" href={campaignDetailHref('resolver', operation.campaignId)}>
                  Mở workspace on-chain →
                </a>
              </article>
            ))}
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
            {cases.data.map((caseItem: ResolverCaseData) => (
              <ResolverCase key={caseItem.id} userId={userId} caseItem={caseItem} onChanged={() => void cases.refetch()} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
