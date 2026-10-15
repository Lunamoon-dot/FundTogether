import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listAdminCreatorProfiles,
  listRewardPublicCampaigns,
  reviewAdminCreatorProfile,
} from '../../lib/api/reward';
import type { RewardCreatorProfile } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import { LifecycleDistributionChart } from './ui/LifecycleDistributionChart';
import { ExceptionList, type ExceptionItem } from './ui/ExceptionList';

export function RewardAdminConsole({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{
    profile: RewardCreatorProfile;
    outcome: 'VERIFIED' | 'REJECTED';
    reason?: string;
  } | null>(null);

  const { data: profiles, refetch: refetchProfiles, isPending: profilesPending } = useQuery({
    queryKey: ['reward-admin-creators', userId],
    queryFn: ({ signal }) => listAdminCreatorProfiles(signal),
  });

  const { data: campaigns } = useQuery({
    queryKey: ['reward-admin-campaigns', userId],
    queryFn: ({ signal }) => listRewardPublicCampaigns(signal),
  });

  async function executeReview(profile: RewardCreatorProfile, outcome: 'VERIFIED' | 'REJECTED', reason?: string) {
    setBusy(true);
    setErrorMsg('');
    setNotice('');
    setPendingConfirm(null);
    try {
      await reviewAdminCreatorProfile(profile.id, {
        outcome,
        rejectionReason: outcome === 'REJECTED' ? (reason || 'Hồ sơ chưa đạt yêu cầu bản quyền hoặc thông tin chưa rõ ràng.') : undefined,
      });
      setNotice(outcome === 'VERIFIED'
        ? `Đã phê duyệt hồ sơ tác giả "${profile.displayName}" (VERIFIED).`
        : `Đã từ chối hồ sơ "${profile.displayName}" (REJECTED).`);
      setRejectingId(null);
      setRejectReason('');
      void refetchProfiles();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const allProfiles = profiles || [];
  const allCampaigns = campaigns || [];

  const pendingProfilesCount = allProfiles.filter(p => p.status === 'PENDING').length;
  const verifiedProfilesCount = allProfiles.filter(p => p.status === 'VERIFIED').length;
  const rejectedProfilesCount = allProfiles.filter(p => p.status === 'REJECTED').length;

  const pendingCampaignsCount = allCampaigns.filter(
    c => c.status === 'FROZEN' || c.status === 'UNDER_REVIEW' || c.status === 'UNDER_REVIEW_PRIVATE'
  ).length;
  const fundingCampaignsCount = allCampaigns.filter(
    c => c.status === 'PUBLISHED' || c.status === 'ACTIVE'
  ).length;
  const pendingActivationCount = allCampaigns.filter(c => c.status === 'APPROVED').length;
  const stoppedCampaignsCount = allCampaigns.filter(c => c.status === 'STOPPED').length;

  // 4 KPI Metrics
  const reviewQueueTotal = pendingProfilesCount + pendingCampaignsCount;
  const exceptionsTotal = rejectedProfilesCount + stoppedCampaignsCount;

  // Lifecycle Distribution Counts (from loaded data)
  const lifecycleCounts: Record<string, number> = {
    'Chờ duyệt IP': pendingProfilesCount,
    'Đã xác minh IP': verifiedProfilesCount,
    'Đang gây quỹ': fundingCampaignsCount,
    'Chờ kích hoạt': pendingActivationCount,
    'Bị từ chối / dừng': exceptionsTotal,
  };

  // Operational Exceptions list
  const exceptionItems: ExceptionItem[] = [
    ...allProfiles.filter(p => p.status === 'PENDING').map(p => ({
      id: `pending-prof-${p.id}`,
      label: `Hồ sơ tác giả "${p.displayName}" đang chờ thẩm định cam kết IP`,
      severity: 'warning' as const,
      owner: p.displayName,
      actionHref: `#admin-creators-list`,
    })),
    ...allProfiles.filter(p => p.status === 'REJECTED').map(p => ({
      id: `rejected-prof-${p.id}`,
      label: `Hồ sơ "${p.displayName}" bị từ chối: ${p.rejectionReason || 'Thông tin bản quyền chưa hợp lệ'}`,
      severity: 'info' as const,
      owner: p.displayName,
    })),
    ...allCampaigns.filter(c => c.status === 'STOPPED').map(c => ({
      id: `stopped-camp-${c.id}`,
      label: `Chiến dịch "${c.title}" đã dừng (STOPPED) - Độc giả có quyền hoàn tiền`,
      severity: 'danger' as const,
      owner: c.title,
      actionHref: `#/reward/editions/${c.id}`,
    })),
  ];

  const filteredProfiles = filter === 'ALL'
    ? allProfiles
    : allProfiles.filter(p => p.status === filter);

  return (
    <div className="reward-container admin-console">
      <header className="reward-hero">
        <span className="reward-badge-category">🛡️ Quản trị Nền tảng · Admin Console</span>
        <h1 className="reward-hero-title">Quản Trị Vận Hành & Hồ Sơ Bản Quyền IP</h1>
        <p className="reward-hero-pitch">
          Kiểm tra cam kết sở hữu trí tuệ tác giả, theo dõi vòng đời phát hành và xử lý ngoại lệ vận hành hệ thống Editions.
        </p>
      </header>

      {errorMsg && <p className="toast toast--error" role="alert">{errorMsg}</p>}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}

      {/* Confirmation Modal / Bar */}
      {pendingConfirm && (
        <aside className="review-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="review-confirm-dialog">
            <h3 id="confirm-title">Xác nhận chuyển trạng thái hồ sơ</h3>
            <p>
              Bạn sắp chuyển trạng thái hồ sơ của tác giả <strong>"{pendingConfirm.profile.displayName}"</strong> sang{' '}
              <strong className={pendingConfirm.outcome === 'VERIFIED' ? 'text-success' : 'text-danger'}>
                {pendingConfirm.outcome}
              </strong>.
            </p>
            {pendingConfirm.reason && (
              <p className="muted">Lý do: {pendingConfirm.reason}</p>
            )}
            <div className="review-confirm-actions">
              <button
                type="button"
                className={`button ${pendingConfirm.outcome === 'VERIFIED' ? 'button--primary' : 'button--secondary'}`}
                disabled={busy}
                onClick={() => void executeReview(pendingConfirm.profile, pendingConfirm.outcome, pendingConfirm.reason)}
              >
                {busy ? 'Đang xử lý…' : `Xác nhận ${pendingConfirm.outcome === 'VERIFIED' ? 'Phê duyệt' : 'Từ chối'}`}
              </button>
              <button
                type="button"
                className="button button--quiet"
                disabled={busy}
                onClick={() => setPendingConfirm(null)}
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 4 Operational KPI Tiles */}
      <section className="kpi-grid admin-kpis" aria-label="Chỉ số vận hành hệ thống">
        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">⏳ Hàng đợi thẩm định</span>
          <strong className="kpi-tile__value">{reviewQueueTotal}</strong>
          <span className="kpi-tile__note">{pendingProfilesCount} hồ sơ IP · {pendingCampaignsCount} chiến dịch</span>
        </div>

        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">🚀 Chiến dịch đang gây quỹ</span>
          <strong className="kpi-tile__value">{fundingCampaignsCount}</strong>
          <span className="kpi-tile__note">Đang tiếp nhận độc giả ủng hộ</span>
        </div>

        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">⛓️ Chờ đồng bộ / giao dịch</span>
          <strong className="kpi-tile__value">{pendingActivationCount}</strong>
          <span className="kpi-tile__note">Đã duyệt, chờ kích hoạt onchain</span>
        </div>

        <div className="panel kpi-tile">
          <span className="kpi-tile__kicker">⚠️ Ngoại lệ vận hành</span>
          <strong className="kpi-tile__value">{exceptionsTotal}</strong>
          <span className="kpi-tile__note">{rejectedProfilesCount} từ chối · {stoppedCampaignsCount} dừng</span>
        </div>
      </section>

      {/* Operations Overview: Chart & Exceptions */}
      <section className="panel admin-overview" aria-labelledby="admin-overview-title">
        <h2 id="admin-overview-title">Tổng quan Vận hành & Vòng đời</h2>

        <div className="admin-overview__grid">
          <div className="admin-overview__chart-block">
            <h3>Phân bổ trạng thái vòng đời</h3>
            <LifecycleDistributionChart counts={lifecycleCounts} />
          </div>

          <div className="admin-overview__exceptions-block">
            <h3>Ngoại lệ & Hồ sơ cần xử lý ({exceptionItems.length})</h3>
            <ExceptionList items={exceptionItems} />
          </div>
        </div>
      </section>

      {/* Creator Profiles Section */}
      <section id="admin-creators-list" className="panel" aria-labelledby="admin-creators-title">
        <div className="admin-section-header">
          <div>
            <h2 id="admin-creators-title">Hồ Sơ Tác Giả & Cam Kết Bản Quyền IP</h2>
            <p className="muted">Kiểm tra thông tin studio/bút danh và cam kết sở hữu trí tuệ trước khi cho phép xuất bản.</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="admin-filter-tabs">
          <button
            type="button"
            className={`button ${filter === 'ALL' ? 'button--primary' : 'button--quiet'}`}
            onClick={() => setFilter('ALL')}
          >
            Tất cả ({allProfiles.length})
          </button>
          <button
            type="button"
            className={`button ${filter === 'PENDING' ? 'button--primary' : 'button--quiet'}`}
            onClick={() => setFilter('PENDING')}
          >
            Chờ duyệt ({pendingProfilesCount})
          </button>
          <button
            type="button"
            className={`button ${filter === 'VERIFIED' ? 'button--primary' : 'button--quiet'}`}
            onClick={() => setFilter('VERIFIED')}
          >
            Đã phê duyệt ({verifiedProfilesCount})
          </button>
          <button
            type="button"
            className={`button ${filter === 'REJECTED' ? 'button--primary' : 'button--quiet'}`}
            onClick={() => setFilter('REJECTED')}
          >
            Đã từ chối ({rejectedProfilesCount})
          </button>
        </div>

        {profilesPending ? (
          <p className="muted">Đang tải danh sách hồ sơ…</p>
        ) : filteredProfiles.length === 0 ? (
          <p className="muted">Không có hồ sơ nào trong mục này.</p>
        ) : (
          <div className="admin-profile-list">
            {filteredProfiles.map(p => (
              <article key={p.id} className="admin-profile-card">
                <div className="admin-profile-card__header">
                  <div className="admin-profile-card__identity">
                    <h3>{p.displayName}</h3>
                    <span
                      className={`reward-status-pill ${
                        p.status === 'VERIFIED'
                          ? 'status-active'
                          : p.status === 'REJECTED'
                          ? 'status-draft'
                          : 'status-under-review'
                      }`}
                    >
                      {p.status === 'PENDING' ? '⏳ CHỜ DUYỆT' : p.status === 'VERIFIED' ? '✓ ĐÃ PHÊ DUYỆT' : '✕ BỊ TỪ CHỐI'}
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

                {p.status === 'REJECTED' && p.rejectionReason && (
                  <div className="admin-profile-card__rejection">
                    <strong>Lý do từ chối:</strong> {p.rejectionReason}
                  </div>
                )}

                {/* Actions for PENDING */}
                {p.status === 'PENDING' && (
                  <div className="admin-profile-card__actions">
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => setPendingConfirm({ profile: p, outcome: 'VERIFIED' })}
                    >
                      ✓ Phê duyệt (VERIFIED)
                    </button>

                    {rejectingId !== p.id ? (
                      <button
                        type="button"
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() => {
                          setRejectingId(p.id);
                          setRejectReason('');
                        }}
                      >
                        ✕ Từ chối hồ sơ
                      </button>
                    ) : (
                      <div className="admin-profile-card__reject-form">
                        <input
                          type="text"
                          placeholder="Nhập lý do từ chối..."
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                        />
                        <button
                          type="button"
                          className="button button--secondary"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          disabled={busy}
                          onClick={() => setPendingConfirm({ profile: p, outcome: 'REJECTED', reason: rejectReason })}
                        >
                          Xác nhận từ chối
                        </button>
                        <button
                          type="button"
                          className="button button--quiet"
                          disabled={busy}
                          onClick={() => setRejectingId(null)}
                        >
                          Hủy
                        </button>
                      </div>
                    )}
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
              disabled={busy}
              onClick={() => {
                void refetchProfiles();
                setNotice('Đã gửi yêu cầu làm mới dữ liệu quản trị.');
              }}
            >
              🔄 Làm mới dữ liệu quản trị
            </button>
          </div>

          <div className="admin-control-box">
            <h4>Giới hạn Thẩm quyền</h4>
            <p>Admin chỉ có quyền thẩm định cam kết tác giả/IP (Flow V1). Quyết định tài chính và giải ngân thuộc về Resolver Console.</p>
            <a href="#/reward/resolver" className="button button--quiet button--sm">
              Mở Resolver Console →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
