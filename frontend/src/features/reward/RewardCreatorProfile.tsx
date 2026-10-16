import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  applyCreatorVerification,
  getCreatorProfile,
  type RewardCreatorProfile as CreatorProfile,
} from '../../lib/api/reward';
import { editionsApi } from '../../lib/api/editions';
import { getErrorMessage } from '../../lib/api/error';
import './reward.css';
import './StudioProfile.css';

function getMonogram(name?: string | null): string {
  if (!name || !name.trim()) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function getSlug(name?: string | null): string {
  if (!name || !name.trim()) return 'studio';
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Onboarding Landing View for Creators who have not yet registered a Studio profile.
 */
function CreateStudioLanding({ onStartCreate }: { onStartCreate: () => void }) {
  return (
    <div className="studio-landing">
      {/* Cover / Watermark */}
      <div className="studio-cover">
        <span className="studio-cover__watermark">Editions Atelier · Hồ sơ Studio</span>
      </div>

      <div className="studio-landing__hero">
        <div className="studio-landing__badge-row">
          <span className="studio-info-label">EDITIONS ATELIER · DÀNH CHO TÁC GIẢ &amp; STUDIO</span>
        </div>
        <h1 className="studio-landing__title">Khởi tạo Không gian Xuất bản Studio</h1>
        <p className="studio-landing__lead">
          FundTogether Editions là bệ phóng gây quỹ cộng đồng cho các tác phẩm Truyện tranh &amp; Artbook số độc lập.
          Trước khi mở Xưởng sáng tác để khởi tạo ấn phẩm gọi vốn, hãy thiết lập Hồ sơ Studio để xác lập danh tính xuất bản
          và thực hiện cam kết 100% bản quyền sở hữu trí tuệ độc lập (Sovereign IP).
        </p>

        <div className="studio-landing__cta-wrap">
          <button
            type="button"
            className="button button--primary button--lg studio-landing__cta"
            onClick={onStartCreate}
          >
            + Khởi tạo Studio (Create Studio)
          </button>
        </div>
      </div>

      <div className="studio-landing__features">
        <div className="studio-landing__feature-card">
          <span className="studio-landing__feature-num">01</span>
          <h3 className="studio-landing__feature-title">Danh tính &amp; Bút danh Xuất bản</h3>
          <p className="studio-landing__feature-desc">
            Thiết lập bút danh hoặc tên studio chính thức của bạn. Giới thiệu phong cách nghệ thuật, tác phẩm đã xuất bản và định hướng sáng tác tới người ủng hộ.
          </p>
        </div>

        <div className="studio-landing__feature-card">
          <span className="studio-landing__feature-num">02</span>
          <h3 className="studio-landing__feature-title">Cam kết Bản quyền IP 100%</h3>
          <p className="studio-landing__feature-desc">
            Toàn bộ bản quyền tác phẩm thuộc về tác giả (Sovereign IP). Tuyên ngôn bản quyền minh bạch là căn cứ pháp lý để bảo vệ quyền tác giả và quyền lợi người ủng hộ.
          </p>
        </div>

        <div className="studio-landing__feature-card">
          <span className="studio-landing__feature-num">03</span>
          <h3 className="studio-landing__feature-title">Thẩm định &amp; Kích hoạt Xưởng</h3>
          <p className="studio-landing__feature-desc">
            Hồ sơ được Resolver thẩm định độc lập trong vòng 24–48h. Sau khi được duyệt, Xưởng ấn phẩm sẽ mở khóa để bạn bắt đầu tạo ấn phẩm gọi vốn đầu tiên.
          </p>
        </div>
      </div>

      <div className="studio-landing__footer-card">
        <div className="studio-card__header">
          <h2 className="studio-card__title">Tiêu chuẩn Xuất bản Editions</h2>
          <span className="studio-info-label">BẢO CHỨNG MINH BẠCH</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
          Mọi ấn phẩm trên FundTogether Editions được lưu ký hợp đồng thông minh MockUSDC trên blockchain Anvil, phát hành file PDF chất lượng cao riêng tư qua chữ ký điện tử xác thực, và được bảo trợ chất lượng bởi Resolver độc lập.
        </p>
      </div>
    </div>
  );
}

/**
 * Guided form to fill out required sections when creating or editing a Studio profile.
 */
function CreatorProfileForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: CreatorProfile | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [ipDeclaration, setIpDeclaration] = useState(
    profile?.ipDeclaration ?? 'Tôi cam kết là tác giả/đồng tác giả hợp pháp sở hữu 100% bản quyền xuất bản tác phẩm này.',
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setSuccessNotice('');

    if (displayName.trim().length < 3) {
      setFormError('Bút danh / Tên Studio xuất bản phải từ 3 ký tự trở lên.');
      return;
    }
    if (bio.trim().length < 10) {
      setFormError('Tiểu sử & Kinh nghiệm sáng tác phải có ít nhất 10 ký tự.');
      return;
    }
    if (ipDeclaration.trim().length < 10) {
      setFormError('Cam kết Bản quyền Sở hữu Trí tuệ phải từ 10 ký tự trở lên.');
      return;
    }

    setBusy(true);
    try {
      await applyCreatorVerification({
        displayName: displayName.trim(),
        bio: bio.trim(),
        ipDeclaration: ipDeclaration.trim(),
      });
      setSuccessNotice('Đã gửi Hồ sơ Studio để Admin xác minh.');
      onSaved();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-form-card">
      <div className="studio-card__header">
        <div>
          <h2 className="studio-card__title">
            {profile ? 'Chỉnh sửa thông tin Studio' : 'Đăng ký Hồ sơ Xuất bản Studio'}
          </h2>
          <p className="muted" style={{ fontSize: '13px', margin: '4px 0 0' }}>
            {profile
              ? 'Cập nhật lại thông tin hồ sơ và cam kết bản quyền xuất bản của bạn.'
              : 'Điền đầy đủ 3 phần thông tin bên dưới để gửi Admin / Resolver thẩm định trước khi mở Xưởng sáng tác.'}
          </p>
        </div>
        <span className="studio-info-label">BẢN QUYỀN &amp; PHÁP LÝ</span>
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
        {/* Phần 1: Bút danh */}
        <div className="studio-form-section">
          <div className="studio-form-section__header">
            <span className="studio-form-section__num">1</span>
            <div className="studio-form-section__meta">
              <span className="atelier-plate-label">Bút danh / Tên Studio xuất bản</span>
              <p className="muted" style={{ fontSize: '12px', margin: 0 }}>
                Tên hiệu công khai hiển thị trên các ấn phẩm gây quỹ và hồ sơ tác giả (tối thiểu 3 ký tự).
              </p>
            </div>
          </div>
          <input
            required
            minLength={3}
            maxLength={150}
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            placeholder="Ví dụ: Studio Truyện Tranh Độc Lập hoặc Bút danh Tác giả"
          />
        </div>

        {/* Phần 2: Tiểu sử */}
        <div className="studio-form-section">
          <div className="studio-form-section__header">
            <span className="studio-form-section__num">2</span>
            <div className="studio-form-section__meta">
              <span className="atelier-plate-label">Tiểu sử &amp; Kinh nghiệm sáng tác</span>
              <p className="muted" style={{ fontSize: '12px', margin: 0 }}>
                Giới thiệu tác giả, phong cách nghệ thuật, quá trình sáng tác và các tác phẩm truyện tranh/artbook đã xuất bản.
              </p>
            </div>
          </div>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={bio}
            onChange={event => setBio(event.target.value)}
            placeholder="Giới thiệu về bạn, định hướng nghệ thuật, các dự án đã thực hiện và kế hoạch xuất bản sắp tới."
          />
          <span className="muted" style={{ fontSize: '12px' }}>
            {bio.trim().length < 10
              ? `Cần tối thiểu 10 ký tự · hiện có ${bio.trim().length}`
              : `Đã nhập ${bio.trim().length} ký tự`}
          </span>
        </div>

        {/* Phần 3: Cam kết IP */}
        <div className="studio-form-section">
          <div className="studio-form-section__header">
            <span className="studio-form-section__num">3</span>
            <div className="studio-form-section__meta">
              <span className="atelier-plate-label">Cam kết Bản quyền Sở hữu Trí tuệ 100% (Sovereign IP)</span>
              <p className="muted" style={{ fontSize: '12px', margin: 0 }}>
                Tuyên ngôn cam kết quyền sở hữu trí tuệ hợp pháp. Bạn giữ 100% bản quyền tác phẩm; nền tảng bảo chứng phát hành kỹ thuật số.
              </p>
            </div>
          </div>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            value={ipDeclaration}
            onChange={event => setIpDeclaration(event.target.value)}
          />
        </div>

        {formError && <p className="toast toast--error" role="alert">{formError}</p>}
        {successNotice && <p className="toast toast--success" role="status">{successNotice}</p>}

        <div className="studio-form-actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Đang gửi hồ sơ…' : profile ? 'Lưu thay đổi & gửi lại' : 'Gửi hồ sơ thẩm định Studio →'}
          </button>
          {onCancel && (
            <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
              ← Quay lại
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function RewardCreatorProfile({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'bio' | 'ip' | 'publications'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['my-reward-creator-profile', userId],
    queryFn: ({ signal }) => getCreatorProfile(signal),
  });
  const operationsQuery = useQuery({
    queryKey: ['reward-editions-operations', 'creator', userId],
    queryFn: ({ signal }) => editionsApi.operations('creator', signal),
  });

  const profile = profileQuery.data ?? null;
  const operations = operationsQuery.data ?? [];
  const status = profile?.status ?? 'UNREGISTERED';

  if (profileQuery.isPending) {
    return (
      <div className="studio-page">
        <p role="status" className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>
          Đang tải Hồ sơ Studio…
        </p>
      </div>
    );
  }

  if (profileQuery.error) {
    return (
      <div className="studio-page">
        <p role="alert" className="toast toast--error" style={{ margin: '24px 0' }}>
          {getErrorMessage(profileQuery.error)}
        </p>
      </div>
    );
  }

  // If user has not yet registered a Studio profile:
  if (!profile) {
    if (!isCreating) {
      return <CreateStudioLanding onStartCreate={() => setIsCreating(true)} />;
    }
    return (
      <div className="studio-page">
        <div className="studio-cover">
          <span className="studio-cover__watermark">Editions Atelier · Hồ sơ Studio</span>
        </div>
        <div style={{ marginTop: '24px' }}>
          <CreatorProfileForm
            profile={null}
            onSaved={() => {
              setIsCreating(false);
              void profileQuery.refetch();
            }}
            onCancel={() => setIsCreating(false)}
          />
        </div>
      </div>
    );
  }

  const statusBadge = status === 'VERIFIED' ? (
    <span className="studio-badge studio-badge--verified">✓ Đã xác minh</span>
  ) : status === 'PENDING' ? (
    <span className="studio-badge studio-badge--pending">⏳ Đang chờ duyệt</span>
  ) : status === 'REJECTED' ? (
    <span className="studio-badge studio-badge--rejected">⚠️ Cần cập nhật</span>
  ) : (
    <span className="studio-badge studio-badge--unregistered">Chưa đăng ký</span>
  );

  const displayName = profile.displayName || 'Tác giả / Studio';
  const monogram = getMonogram(profile.displayName);
  const slug = getSlug(profile.displayName);

  return (
    <div className="studio-page">
      {/* Cover Banner */}
      <div className="studio-cover">
        <span className="studio-cover__watermark">Editions Atelier · Hồ sơ Studio</span>
      </div>

      {/* Header Profile Card */}
      <div className="studio-header-card">
        <div className="studio-header-top">
          <div className="studio-avatar-group">
            <div className="studio-avatar" aria-hidden="true">
              {monogram}
            </div>
            <div className="studio-identity">
              <div className="studio-name-row">
                <h1 className="studio-name">{displayName}</h1>
                {statusBadge}
              </div>
              <p className="studio-meta">
                @{slug} · Studio truyện tranh &amp; Artbook độc lập · Hồ sơ Studio
              </p>
            </div>
          </div>

          <div className="studio-actions">
            {status === 'VERIFIED' ? (
              <a className="button button--primary" href="#/reward/creator">
                Vào Xưởng sáng tác →
              </a>
            ) : status === 'PENDING' ? (
              <span className="studio-badge studio-badge--pending" style={{ padding: '8px 14px' }}>
                ⏳ Đang chờ duyệt
              </span>
            ) : null}
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Đóng chỉnh sửa' : status === 'PENDING' ? 'Chỉnh sửa hồ sơ đã gửi' : 'Chỉnh sửa hồ sơ'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="studio-nav-tabs" role="tablist" aria-label="Điều hướng hồ sơ Studio">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`studio-nav-tab ${activeTab === 'overview' ? 'studio-nav-tab--active' : ''}`}
            onClick={() => { setActiveTab('overview'); setIsEditing(false); }}
          >
            Tổng quan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bio'}
            className={`studio-nav-tab ${activeTab === 'bio' ? 'studio-nav-tab--active' : ''}`}
            onClick={() => { setActiveTab('bio'); setIsEditing(false); }}
          >
            Tiểu sử &amp; Tác giả
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ip'}
            className={`studio-nav-tab ${activeTab === 'ip' ? 'studio-nav-tab--active' : ''}`}
            onClick={() => { setActiveTab('ip'); setIsEditing(false); }}
          >
            Cam kết Bản quyền IP
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'publications'}
            className={`studio-nav-tab ${activeTab === 'publications' ? 'studio-nav-tab--active' : ''}`}
            onClick={() => { setActiveTab('publications'); setIsEditing(false); }}
          >
            Ấn phẩm xuất bản {operations.length > 0 && `(${operations.length})`}
          </button>
        </nav>
      </div>

      {/* Pending status notification banner */}
      {status === 'PENDING' && !isEditing && (
        <div className="studio-pending-alert" role="status">
          <div className="studio-pending-alert__header">
            <span aria-hidden="true">⏳</span>
            <strong>Hồ sơ Studio đang chờ Admin / Resolver thẩm định</strong>
          </div>
          <p>
            Hồ sơ xuất bản và cam kết 100% bản quyền sở hữu trí tuệ của bạn đã được gửi thành công. Đội ngũ Resolver sẽ thẩm định hồ sơ trong vòng 24–48 giờ.
            Sau khi được phê duyệt, bạn sẽ có thể vào Xưởng sáng tác để bắt đầu tạo ấn phẩm gọi vốn.
          </p>
        </div>
      )}

      <div className="studio-body-layout">
        {/* Left Column: Giới thiệu (Sidebar) */}
        <aside className="studio-sidebar">
          <div className="studio-card">
            <div className="studio-card__header">
              <h2 className="studio-card__title">Giới thiệu</h2>
              <span className="studio-info-label">THÔNG TIN</span>
            </div>
            <ul className="studio-info-list">
              <li className="studio-info-item">
                <span className="studio-info-label">Bút danh / Tên hiệu</span>
                <span className="studio-info-value">{displayName}</span>
              </li>
              <li className="studio-info-item">
                <span className="studio-info-label">Lĩnh vực sáng tác</span>
                <span className="studio-info-value">Truyện tranh, Artbook &amp; Tiểu thuyết đồ họa</span>
              </li>
              <li className="studio-info-item">
                <span className="studio-info-label">Trạng thái thẩm định</span>
                <span className="studio-info-value">
                  {status === 'VERIFIED'
                    ? 'Đã được quản trị viên duyệt IP và hồ sơ xuất bản'
                    : status === 'PENDING'
                    ? 'Đang chờ Admin duyệt hồ sơ xuất bản'
                    : status === 'REJECTED'
                    ? 'Hồ sơ cần cập nhật lại thông tin'
                    : 'Chưa hoàn tất đăng ký hồ sơ'}
                </span>
              </li>
              <li className="studio-info-item">
                <span className="studio-info-label">Bản quyền xuất bản</span>
                <span className="studio-info-value">Cam kết 100% sở hữu trí tuệ độc lập</span>
              </li>
            </ul>
          </div>

          <div className="studio-card">
            <div className="studio-card__header">
              <h2 className="studio-card__title">Tiêu chuẩn Editions</h2>
              <span className="studio-info-label">QUY CHUẨN</span>
            </div>
            <p className="muted" style={{ fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
              Mỗi ấn phẩm trên FundTogether Editions được lưu ký hợp đồng thông minh MockUSDC, phát hành file PDF chất lượng cao riêng tư qua chữ ký điện tử, và được Resolver bảo trợ chất lượng.
            </p>
          </div>
        </aside>

        {/* Right Column: Main Feed / Edit Form */}
        <main className="studio-main">
          {profile.status === 'REJECTED' && (
            <div className="toast toast--error" role="alert" style={{ marginBottom: '16px' }}>
              <strong>Hồ sơ cần cập nhật:</strong> {profile.rejectionReason || 'Vui lòng kiểm tra lại thông tin hồ sơ và gửi lại để Admin duyệt.'}
            </div>
          )}

          {isEditing ? (
            <CreatorProfileForm
              key={profile.id}
              profile={profile}
              onSaved={() => {
                setIsEditing(false);
                void profileQuery.refetch();
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <>
              {/* Tab: Overview or Bio */}
              {(activeTab === 'overview' || activeTab === 'bio') && (
                <article className="studio-post">
                  <div className="studio-post__meta">
                    <div className="studio-post__avatar-mini">{monogram}</div>
                    <div className="studio-post__author-info">
                      <span className="studio-post__author-name">{displayName}</span>
                      <span className="studio-post__date">Tiểu sử &amp; Kinh nghiệm sáng tác</span>
                    </div>
                  </div>
                  <div className="studio-post__body">{profile.bio}</div>
                </article>
              )}

              {/* Tab: Overview or IP */}
              {(activeTab === 'overview' || activeTab === 'ip') && (
                <article className="studio-post studio-certificate-card">
                  <span className="studio-certificate-preface">VĂN BẢN CAM KẾT PHÁP LÝ · SOVEREIGN IP</span>
                  <div className="studio-post__meta">
                    <div className="studio-post__avatar-mini">§</div>
                    <div className="studio-post__author-info">
                      <span className="studio-post__author-name">Cam kết Sở hữu Trí tuệ 100%</span>
                      <span className="studio-post__date">Xác nhận quyền xuất bản số độc quyền</span>
                    </div>
                  </div>
                  <div className="studio-post__body" style={{ fontStyle: 'italic' }}>
                    "{profile.ipDeclaration}"
                  </div>
                </article>
              )}

              {/* Tab: Overview or Publications */}
              {(activeTab === 'overview' || activeTab === 'publications') && (
                <section className="studio-card">
                  <div className="studio-card__header">
                    <h2 className="studio-card__title">Ấn phẩm của Studio</h2>
                    <span className="studio-info-label">TÁC PHẨM</span>
                  </div>

                  {operations.length > 0 ? (
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {operations.map(op => (
                        <div
                          key={op.campaignId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            background: '#fcfbf9',
                            border: '1px solid rgba(24, 23, 22, 0.08)',
                            borderRadius: '6px',
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: '15px' }}>{op.title}</strong>
                            <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                              Trạng thái: {op.applicationStatus}
                            </p>
                          </div>
                          <a className="button button--secondary" href={`#/reward/editions/${op.campaignId}`}>
                            Xem chi tiết
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <p className="muted" style={{ margin: '0 0 12px' }}>
                        {status === 'VERIFIED'
                          ? 'Studio chưa phát hành ấn phẩm nào. Hãy bắt đầu chiến dịch đầu tiên của bạn!'
                          : 'Sau khi Hồ sơ Studio được phê duyệt, bạn có thể khởi tạo và quản lý các ấn phẩm tại đây.'}
                      </p>
                      {status === 'VERIFIED' && (
                        <a className="button button--primary" href="#/reward/creator">
                          Mở Xưởng sáng tác
                        </a>
                      )}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
