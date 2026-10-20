import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listAdminCreatorProfiles,
} from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { type ExceptionItem } from '../shared/ui/ExceptionList';
import { AdminOperationsOverview } from '../shared/ui/AdminOperationsOverview';
import { campaignApi } from '../api/campaigns';
import { campaignDetailHref } from '../../explore/campaignRoutes';
import '../shared/styles.css';

export function AdminConsole({
  userId,
  focus,
}: {
  userId: string;
  focus?: 'studio' | 'projection' | 'indexer';
}) {
  useEffect(() => {
    if (!focus) return;
    const targetId = focus === 'studio' ? 'admin-creators-list' : 'admin-operations-overview';
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  const { data: profiles, isPending: profilesPending } = useQuery({
    queryKey: ['campaign-admin-creators', userId],
    queryFn: ({ signal }) => listAdminCreatorProfiles(signal),
  });

  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'admin', userId],
    queryFn: ({ signal }) => campaignApi.operations('admin', signal),
    refetchInterval: 10_000,
  });

  const allProfiles = profiles || [];
  const allCampaigns = operations.data || [];

  const profileMetadataCount = allProfiles.length;

  const pendingCampaignsCount = allCampaigns.filter(
    c => ['FROZEN', 'UNDER_REVIEW', 'UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW'].includes(c.applicationStatus)
  ).length;
  const approvedWithoutBinding = allCampaigns.filter(c => c.applicationStatus === 'APPROVED' && c.publicationStatus === 'NOT_PUBLISHED');
  const orphanedBindings = allCampaigns.filter(c => c.publicationStatus === 'ORPHANED');
  const indexerPendingBindings = allCampaigns.filter(c => c.publicationStatus === 'ON_CHAIN_CONFIRMED' && c.contractState === null);
  const fundingCampaignsCount = allCampaigns.filter(c => c.contractState === 0).length;
  const pendingActivationCount = approvedWithoutBinding.length;
  const refundingCampaignsCount = allCampaigns.filter(c => c.contractState === 4).length;

  // 4 KPI Metrics
  const reviewQueueTotal = pendingCampaignsCount;
  const exceptionsTotal = orphanedBindings.length + approvedWithoutBinding.length + indexerPendingBindings.length;

  // Lifecycle Distribution Counts (from loaded data)
  const lifecycleCounts: Record<string, number> = {
    'Creator metadata': profileMetadataCount,
    'Đang gây quỹ': fundingCampaignsCount,
    'Chờ kích hoạt': pendingActivationCount,
    'Ngoại lệ / hoàn tiền': exceptionsTotal + refundingCampaignsCount,
  };

  // Operational Exceptions list
  const exceptionItems: ExceptionItem[] = [
    ...allCampaigns.filter(c => c.contractState === 4).map(c => ({
      id: `refunding-camp-${c.campaignId}`,
      label: `Chiến dịch "${c.title}" đang ở contract state REFUNDING; Backer tự claim hoàn tiền`,
      severity: 'warning' as const,
      owner: c.title,
      actionHref: `#/campaigns/${c.campaignId}`,
    })),
    ...approvedWithoutBinding.map(c => ({
      id: `approved-unbound-${c.campaignId}`,
      label: `Chiến dịch "${c.title}" đã APPROVED nhưng publication vẫn NOT_PUBLISHED; chưa mở pledge`,
      severity: 'warning' as const,
      owner: c.title,
      actionHref: campaignDetailHref('admin', c.campaignId),
    })),
    ...orphanedBindings.map(c => ({
      id: `orphaned-binding-${c.campaignId}`,
      label: `Chiến dịch "${c.title}" có publication ORPHANED; đối chiếu tx ${c.bindingTransactionHash ?? 'chưa xác định'}, không tạo campaign mới`,
      severity: 'danger' as const,
      owner: c.title,
      actionHref: campaignDetailHref('admin', c.campaignId),
    })),
    ...indexerPendingBindings.map(c => ({
      id: `indexer-pending-${c.campaignId}`,
      label: `Chiến dịch "${c.title}" có binding canonical nhưng contract snapshot đang chờ indexer; pledge vẫn bị khóa`,
      severity: 'warning' as const,
      owner: c.title,
      actionHref: campaignDetailHref('admin', c.campaignId),
    })),
  ];

  return (
    <div className="campaign-container admin-console">
      <h1 className="public-sr-only">Quản Trị Vận Hành & Hồ Sơ Bản Quyền IP</h1>


      {operations.error && <p className="toast toast--error" role="alert">{getErrorMessage(operations.error)}</p>}

      {/* Operational KPI summary for screen readers and system status */}
      <section className="kpi-grid admin-kpis public-sr-only" aria-label="Chỉ số vận hành hệ thống">
        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">Hàng đợi thẩm định</span>
          <strong className="kpi-tile__value">{reviewQueueTotal}</strong>
          <span className="kpi-tile__note">{profileMetadataCount} hồ sơ metadata · {pendingCampaignsCount} chiến dịch</span>
        </div>
        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">Chiến dịch đang gây quỹ</span>
          <strong className="kpi-tile__value">{fundingCampaignsCount}</strong>
          <span className="kpi-tile__note">Binding canonical · contract state FUNDING</span>
        </div>
        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">Chờ đồng bộ / giao dịch</span>
          <strong className="kpi-tile__value">{pendingActivationCount}</strong>
          <span className="kpi-tile__note">Đã duyệt, chờ kích hoạt onchain</span>
        </div>
        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">Ngoại lệ vận hành</span>
          <strong className="kpi-tile__value">{exceptionsTotal}</strong>
          <span className="kpi-tile__note">{orphanedBindings.length} binding orphaned</span>
        </div>
      </section>

      {/* Unified Operational Dashboard Overview */}
      <AdminOperationsOverview
        id="admin-operations-overview"
        lifecycleCounts={lifecycleCounts}
        exceptionItems={exceptionItems}
      />



      {/* Creator Profiles Section */}
      <section id="admin-creators-list" className="panel" aria-labelledby="admin-creators-title">
        <div className="admin-section-header">
          <div>
            <h2 id="admin-creators-title">Metadata tác giả và IP</h2>
            <p className="muted">Admin chỉ xem metadata được Creator tự khai báo. Metadata này không cấp quyền đăng funding và không thay thế Judge case.</p>
          </div>
        </div>

        {profilesPending ? (
          <p className="muted">Đang tải danh sách hồ sơ…</p>
        ) : allProfiles.length === 0 ? (
          <p className="muted">Không có hồ sơ nào trong mục này.</p>
        ) : (
          <div className="admin-profile-list">
            {allProfiles.map(p => (
              <article key={p.id} className="admin-profile-card">
                <div className="admin-profile-card__header">
                  <div className="admin-profile-card__identity">
                    <h3>{p.displayName}</h3>
                    <span
                      className={`campaign-status-pill ${
                        p.status === 'VERIFIED'
                          ? 'status-active'
                          : p.status === 'REJECTED'
                          ? 'status-draft'
                          : 'status-under-review'
                      }`}
                    >
                        {p.status === 'PENDING' ? 'METADATA MỚI' : p.status === 'VERIFIED' ? 'METADATA ĐÃ LƯU' : 'METADATA CẦN CẬP NHẬT'}
                    </span>
                  </div>
                  <span className="admin-profile-card__date">
                    Ngày gửi: {new Date(p.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>

                <div className="admin-profile-card__block">
                  <strong>Tiểu sử & Kinh nghiệm sáng tác:</strong>
                  <p>{p.bio}</p>
                </div>

                <div className="admin-profile-card__block admin-profile-card__ip">
                  <strong>Cam kết Bản quyền Sở hữu Trí tuệ (IP Declaration):</strong>
                  <p>{p.ipDeclaration}</p>
                </div>

                <div className="admin-profile-card__block">
                  <strong>Xác nhận tác phẩm nguyên bản:</strong>
                  <p>{p.originalWorkPledge === true ? '✓ Creator đã xác nhận rõ ràng' : 'Chưa có xác nhận trong metadata'}</p>
                </div>

                {p.status === 'REJECTED' && p.rejectionReason && (
                  <div className="admin-profile-card__rejection">
                    <strong>Lý do từ chối:</strong> {p.rejectionReason}
                  </div>
                )}

              </article>
            ))}
          </div>
        )}
      </section>

      {/* Secondary Administration Controls */}
      <section className="panel admin-controls-section" aria-labelledby="admin-controls-title">
        <h2 id="admin-controls-title">Quản trị hệ thống (Administrative Controls)</h2>
        <p className="muted">
          Các thao tác quản trị đặc quyền. Mọi can thiệp tài chính hoặc trạng thái đều có nhật ký kiểm toán và xác nhận rõ ràng.
        </p>

        <div className="admin-controls-grid">
          <div className="admin-control-box">
            <h4>Đồng bộ dữ liệu Indexer</h4>
            <p>Yêu cầu quét lại các sự kiện hợp đồng từ block gần nhất nếu phát hiện độ trễ cập nhật trạng thái.</p>
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => {
                void operations.refetch();
              }}
            >
              Làm mới dữ liệu quản trị
            </button>
          </div>

          <div className="admin-control-box">
            <h4>Giới hạn Thẩm quyền</h4>
            <p>Admin chỉ theo dõi metadata, Judge publication cases và projection indexer. Quyết định publication thuộc về Judge case; quyết định lifecycle còn lại là transitional Resolver.</p>
            <a href="#/campaigns/resolver" className="button button--quiet button--sm">
              Mở Resolver Console →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}


