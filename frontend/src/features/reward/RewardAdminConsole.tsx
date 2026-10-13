import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAdminCreatorProfiles, reviewAdminCreatorProfile } from '../../lib/api/reward';
import type { RewardCreatorProfile } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';

export function RewardAdminConsole({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: profiles, refetch, isPending } = useQuery({
    queryKey: ['reward-admin-creators', userId],
    queryFn: ({ signal }) => listAdminCreatorProfiles(signal),
  });

  async function handleReviewCreator(profile: RewardCreatorProfile, outcome: 'VERIFIED' | 'REJECTED', reason?: string) {
    setBusy(true);
    setErrorMsg('');
    setNotice('');
    try {
      await reviewAdminCreatorProfile(profile.id, {
        outcome,
        rejectionReason: outcome === 'REJECTED' ? (reason || 'Hồ sơ chưa đạt yêu cầu bản quyền hoặc thông tin chưa rõ ràng.') : undefined,
      });
      setNotice(outcome === 'VERIFIED'
        ? `Đã phê duyệt hồ sơ tác giả "${profile.displayName}" (VERIFIED).`
        : `Đã từ chối hồ sơ "${profile.displayName}".`);
      setRejectingId(null);
      setRejectReason('');
      void refetch();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const allProfiles = profiles || [];
  const pendingCount = allProfiles.filter(p => p.status === 'PENDING').length;
  const verifiedCount = allProfiles.filter(p => p.status === 'VERIFIED').length;
  const rejectedCount = allProfiles.filter(p => p.status === 'REJECTED').length;

  const filteredProfiles = filter === 'ALL'
    ? allProfiles
    : allProfiles.filter(p => p.status === filter);

  return (
    <div className="reward-container">
      <header className="reward-hero">
        <span className="reward-badge-category">🛡️ Quản trị Nền tảng · Admin Console</span>
        <h1 className="reward-hero-title">Quản Trị Hồ Sơ Tác Giả & Bản Quyền IP (Flow V1)</h1>
        <p className="reward-hero-pitch">
          Kiểm tra thông tin studio/bút danh và cam kết sở hữu trí tuệ của tác giả trước khi cho phép xuất bản chiến dịch gọi vốn.
        </p>
      </header>

      {errorMsg && <p className="toast toast--error" role="alert">{errorMsg}</p>}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}

      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Tổng hồ sơ</span>
          <strong style={{ fontSize: '24px', color: '#1e293b' }}>{allProfiles.length}</strong>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center', borderColor: pendingCount > 0 ? '#f59e0b' : '#e2e8f0' }}>
          <span style={{ fontSize: '12px', color: '#b45309', display: 'block', marginBottom: '4px' }}>⏳ Đang chờ duyệt</span>
          <strong style={{ fontSize: '24px', color: '#d97706' }}>{pendingCount}</strong>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#15803d', display: 'block', marginBottom: '4px' }}>✓ Đã phê duyệt</span>
          <strong style={{ fontSize: '24px', color: '#16a34a' }}>{verifiedCount}</strong>
        </div>
        <div className="panel" style={{ padding: '16px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#b91c1c', display: 'block', marginBottom: '4px' }}>✕ Đã từ chối</span>
          <strong style={{ fontSize: '24px', color: '#dc2626' }}>{rejectedCount}</strong>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
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
          Chờ duyệt ({pendingCount})
        </button>
        <button
          type="button"
          className={`button ${filter === 'VERIFIED' ? 'button--primary' : 'button--quiet'}`}
          onClick={() => setFilter('VERIFIED')}
        >
          Đã phê duyệt ({verifiedCount})
        </button>
        <button
          type="button"
          className={`button ${filter === 'REJECTED' ? 'button--primary' : 'button--quiet'}`}
          onClick={() => setFilter('REJECTED')}
        >
          Đã từ chối ({rejectedCount})
        </button>
      </div>

      {/* Main List */}
      <section className="panel">
        <h2>Danh Sách Hồ Sơ Tác Giả & Studio</h2>

        {isPending ? (
          <p className="muted">Đang tải danh sách hồ sơ…</p>
        ) : filteredProfiles.length === 0 ? (
          <p className="muted">Không có hồ sơ nào trong mục này.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
            {filteredProfiles.map(p => (
              <div
                key={p.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '18px',
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b' }}>{p.displayName}</h3>
                    <span
                      className={`reward-status-pill ${
                        p.status === 'VERIFIED'
                          ? 'status-active'
                          : p.status === 'REJECTED'
                          ? 'status-draft'
                          : 'status-under-review'
                      }`}
                      style={{ fontSize: '11px', fontWeight: 600 }}
                    >
                      {p.status === 'PENDING' ? '⏳ CHỜ DUYỆT' : p.status === 'VERIFIED' ? '✓ ĐÃ PHÊ DUYỆT' : '✕ BỊ TỪ CHỐI'}
                    </span>
                  </div>

                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Ngày gửi: {new Date(p.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
                  <strong style={{ color: '#475569', display: 'block', marginBottom: '4px' }}>Tiểu sử & Kinh nghiệm sáng tác:</strong>
                  <p style={{ margin: 0, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{p.bio}</p>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
                  <strong style={{ color: '#475569', display: 'block', marginBottom: '4px' }}>Cam kết Bản quyền Sở hữu Trí tuệ (IP Declaration):</strong>
                  <p style={{ margin: 0, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{p.ipDeclaration}</p>
                </div>

                {p.status === 'REJECTED' && p.rejectionReason && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', color: '#991b1b' }}>
                    <strong>Lý do từ chối:</strong> {p.rejectionReason}
                  </div>
                )}

                {/* Actions for PENDING */}
                {p.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void handleReviewCreator(p, 'VERIFIED')}
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
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
                        <input
                          type="text"
                          placeholder="Nhập lý do từ chối..."
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          style={{ flex: 1, height: '36px', fontSize: '13px' }}
                        />
                        <button
                          type="button"
                          className="button button--secondary"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          disabled={busy}
                          onClick={() => void handleReviewCreator(p, 'REJECTED', rejectReason)}
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
