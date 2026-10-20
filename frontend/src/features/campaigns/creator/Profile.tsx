import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  applyCreatorVerification,
  getCreatorProfile,
  listWallets,
  type CreatorProfile,
} from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import '../shared/styles.css';
import './Profile.css';

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

function parseProfileLinks(value?: string | null): string[] {
  return [...new Set(
    (value ?? '')
      .split(/[\r\n,]+/)
      .map(link => link.trim())
      .filter(Boolean)
      .map(link => /^https?:\/\//i.test(link) ? link : `https://${link}`),
  )];
}

function getProfileLinkLabel(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./i, '');
  } catch {
    return link;
  }
}

const GENRE_OPTIONS = [
  'Truyện tranh Độc lập (Comics / Manga)',
  'Sách tranh & Minh họa (Artbook / Illustration)',
  'Tiểu thuyết đồ họa (Graphic Novel)',
  'Webtoon / Digital Comic dài kỳ',
  'Giả tưởng & Viễn tưởng (Fantasy / Sci-Fi)',
  'Thể loại nghệ thuật độc lập khác',
];

const STEP_TITLES = [
  'Định danh Studio',
  'Tiểu sử sáng tác',
  'Portfolio & Liên hệ',
  'Cam kết Bản quyền IP',
  'Xác nhận & Nộp',
];

const STEP_SHORT_TITLES = [
  'Định danh',
  'Tiểu sử',
  'Portfolio',
  'Bản quyền IP',
  'Xác nhận',
];

/**
 * Onboarding Landing View for Creators who have not yet registered a Studio profile.
 */
function CreateStudioLanding({ onStartCreate }: { onStartCreate: () => void }) {
  return (
    <div className="studio-landing">
      <div className="studio-landing__hero">
        <div className="studio-landing__badge-row">
          <span className="studio-info-label">CAMPAIGN ATELIER · DÀNH CHO TÁC GIẢ &amp; STUDIO</span>
        </div>
        <h1 className="studio-landing__title">Khởi tạo Không gian Xuất bản Studio</h1>
        <p className="studio-landing__lead">
          FundTogether là bệ phóng gây quỹ cộng đồng cho các tác phẩm Truyện tranh &amp; Artbook số độc lập.
          Hồ sơ tác giả/Studio là metadata tùy chọn để giới thiệu Creator; nó không phải điều kiện để tạo campaign hoặc mở Judge case.
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
            Thiết lập bút danh hoặc tên studio chính thức của bạn. Giới thiệu phong cách nghệ thuật, thể loại sáng tác chủ đạo và định hướng các tác phẩm tới người ủng hộ.
          </p>
        </div>

        <div className="studio-landing__feature-card">
          <span className="studio-landing__feature-num">02</span>
          <h3 className="studio-landing__feature-title">Cam kết Bản quyền IP 100%</h3>
          <p className="studio-landing__feature-desc">
            Cung cấp liên kết tác phẩm mẫu, kênh cộng đồng và xác nhận tác quyền nguyên bản 100% (Sovereign IP) nhằm bảo vệ quyền tác giả và tạo dựng uy tín với độc giả.
          </p>
        </div>

        <div className="studio-landing__feature-card">
          <span className="studio-landing__feature-num">03</span>
          <h3 className="studio-landing__feature-title">Thẩm định &amp; Kích hoạt Xưởng</h3>
          <p className="studio-landing__feature-desc">
            Hồ sơ này chỉ là metadata tùy chọn. Publication được quyết định bởi Judge case on-chain, không bởi trạng thái hồ sơ.
          </p>
        </div>
      </div>

      <div className="studio-landing__footer-card">
        <div className="studio-card__header">
          <h2 className="studio-card__title">Tiêu chuẩn xuất bản</h2>
          <span className="studio-info-label">BẢO CHỨNG MINH BẠCH</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
          Mọi ấn phẩm trên FundTogether được lưu ký hợp đồng thông minh MockUSDC trên blockchain Anvil, phát hành file PDF chất lượng cao riêng tư qua chữ ký điện tử xác thực, và được kiểm tra bởi Judge committee được chọn theo từng case.
        </p>
      </div>
    </div>
  );
}

/**
 * 5-Step Guided Slider Form to register or edit a Studio profile.
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
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [primaryGenre, setPrimaryGenre] = useState(profile?.primaryGenre ?? GENRE_OPTIONS[0]);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [portfolioUrl, setPortfolioUrl] = useState(profile?.portfolioUrl ?? '');
  const [socialUrl, setSocialUrl] = useState(profile?.socialUrl ?? '');
  const [contactEmail, setContactEmail] = useState(profile?.contactEmail ?? '');
  const [studioWalletLinkId, setStudioWalletLinkId] = useState(profile?.studioWalletLinkId ?? '');
  const [ipDeclaration, setIpDeclaration] = useState(
    profile?.ipDeclaration ?? 'Tôi cam kết là tác giả/đồng tác giả hợp pháp sở hữu 100% bản quyền xuất bản tác phẩm này. Mọi ấn phẩm phát hành đều thuộc quyền sở hữu trí tuệ độc lập của tác giả/studio.',
  );
  const [originalWorkPledge, setOriginalWorkPledge] = useState(profile?.originalWorkPledge === true);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const walletsQuery = useQuery({
    queryKey: ['campaign-campaign-wallets', 'studio-profile'],
    queryFn: ({ signal }) => listWallets(signal),
  });
  const wallets = walletsQuery.data ?? [];
  const selectedStudioWalletLinkId = studioWalletLinkId || (wallets.length === 1 ? wallets[0].id : '');
  const selectedStudioWallet = wallets.find(wallet => wallet.id === selectedStudioWalletLinkId);

  function handleNext() {
    setFormError('');
    if (step === 0) {
      if (displayName.trim().length < 3) {
        setFormError('Bút danh / Tên Studio xuất bản phải từ 3 ký tự trở lên.');
        return;
      }
    } else if (step === 1) {
      if (bio.trim().length < 10) {
        setFormError('Tiểu sử & Kinh nghiệm sáng tác phải có ít nhất 10 ký tự.');
        return;
      }
    } else if (step === 3) {
      if (ipDeclaration.trim().length < 10) {
        setFormError('Cam kết Bản quyền Sở hữu Trí tuệ phải từ 10 ký tự trở lên.');
        return;
      }
    }
    setStep(s => Math.min(s + 1, 4));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    setSuccessNotice('');

    if (displayName.trim().length < 3) {
      setFormError('Bút danh / Tên Studio xuất bản phải từ 3 ký tự trở lên.');
      setStep(0);
      return;
    }
    if (bio.trim().length < 10) {
      setFormError('Tiểu sử & Kinh nghiệm sáng tác phải có ít nhất 10 ký tự.');
      setStep(1);
      return;
    }
    if (ipDeclaration.trim().length < 10) {
      setFormError('Cam kết Bản quyền Sở hữu Trí tuệ phải từ 10 ký tự trở lên.');
      setStep(3);
      return;
    }
    if (!originalWorkPledge) {
      setFormError('Bạn cần xác nhận cam kết tác phẩm là sản phẩm sáng tạo nguyên bản để nộp hồ sơ.');
      return;
    }
    setBusy(true);
    try {
      await applyCreatorVerification({
        studioWalletLinkId: selectedStudioWalletLinkId || null,
        displayName: displayName.trim(),
        primaryGenre: primaryGenre.trim() || null,
        bio: bio.trim(),
        portfolioUrl: parseProfileLinks(portfolioUrl).join('\n') || null,
        socialUrl: parseProfileLinks(socialUrl).join('\n') || null,
        contactEmail: contactEmail.trim() || null,
        ipDeclaration: ipDeclaration.trim(),
        originalWorkPledge,
      });
      setSuccessNotice('Đã lưu metadata tác giả. Metadata này không quyết định quyền funding.');
      onSaved();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-wizard-container">
      <div className="studio-wizard-card">
        {/* Header */}
        <div className="studio-wizard-header">
          <div className="studio-wizard-header__info">
            <span className="studio-wizard-pill">BƯỚC {step + 1} / 5</span>
            <h2 className="studio-wizard-header__title">
              {profile ? 'Chỉnh sửa thông tin Studio' : 'Khởi tạo Hồ sơ Xuất bản Studio'}
            </h2>
          </div>
        </div>

        {/* 5-Segment Progress Bar */}
        <div className="studio-wizard-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={5}>
          <div className="studio-wizard-progress__segments">
            {STEP_TITLES.map((title, idx) => (
              <button
                key={title}
                type="button"
                className={`studio-wizard-seg ${step === idx ? 'is-active' : step > idx ? 'is-done' : ''}`}
                onClick={() => {
                  if (idx < step) {
                    setFormError('');
                    setStep(idx);
                  }
                }}
                disabled={idx > step}
                title={`Bước ${idx + 1}: ${title}`}
              >
                <span className="studio-wizard-seg__bar" />
                <span className="studio-wizard-seg__caption">
                  <span className="studio-wizard-seg__num">{step > idx ? '✓' : idx + 1}</span>
                  <span className="studio-wizard-seg__name">{title}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="studio-wizard-form">
          {/* SLIDE 1: Định danh Studio */}
          {step === 0 && (
            <div className="studio-slide-content">
              <div className="studio-slide-heading">
                <h3 className="studio-slide-heading__title">Đặt tên Studio &amp; Lĩnh vực sáng tác</h3>
                <p className="studio-slide-heading__desc">
                  Thông tin nhận diện chính thức trên các ấn phẩm gây quỹ và hồ sơ tác giả gửi tới cộng đồng Backers.
                </p>
              </div>

              <div className="studio-field-group">
                <div className="studio-grid-2">
                  <label className="studio-field">
                    <span className="studio-field__label">
                      Bút danh / Tên Studio xuất bản <span className="studio-field__optional">(tùy chọn)</span>
                    </span>
                    <input
                      required
                      minLength={3}
                      maxLength={150}
                      value={displayName}
                      onChange={event => setDisplayName(event.target.value)}
                      placeholder="Ví dụ: Tùng Studio, Xưởng Truyện Tranh Mây Trắng..."
                      className="studio-input"
                      autoFocus
                    />
                    <span className="studio-field__hint">Tên xuất bản công khai hiển thị cho độc giả và trên hợp đồng bảo chứng IP.</span>
                  </label>

                  <label className="studio-field">
                    <span className="studio-field__label">Lĩnh vực / Thể loại sáng tác chủ đạo</span>
                    <select
                      value={primaryGenre}
                      onChange={event => setPrimaryGenre(event.target.value)}
                      className="studio-select"
                    >
                      {GENRE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <span className="studio-field__hint">Giúp phân loại và gợi ý tác phẩm tới đúng đối tượng độc giả quan tâm.</span>
                  </label>
                </div>

                <label className="studio-field">
                  <span className="studio-field__label">Ví Studio đại diện / nhận tiền campaign <span className="studio-field__required">*</span></span>
                  <select
                    required
                    value={selectedStudioWalletLinkId}
                    onChange={event => setStudioWalletLinkId(event.target.value)}
                    className="studio-select"
                  >
                    <option value="">Chọn ví đã liên kết</option>
                    {wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.address}</option>)}
                  </select>
                  <span className="studio-field__hint">Ví này chỉ là metadata tùy chọn. Ví nhận tiền campaign được chọn trực tiếp trong hồ sơ campaign.</span>
                  {wallets.length === 0 && <span className="studio-field__hint">Hãy liên kết ví trong phần Tài khoản trước khi nộp hồ sơ.</span>}
                </label>
              </div>

              <div className="studio-wizard-tip">
                <span className="studio-wizard-tip__icon">💡</span>
                <div className="studio-wizard-tip__body">
                  Gợi ý: Bạn không nhất thiết phải dùng tên thật. Có thể dùng nghệ danh cá nhân hoặc tên nhóm sáng tác. Bạn luôn có thể cập nhật lại sau.
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 2: Tiểu sử */}
          {step === 1 && (
            <div className="studio-slide-content">
              <div className="studio-slide-heading">
                <h3 className="studio-slide-heading__title">Tiểu sử &amp; Phong cách nghệ thuật</h3>
                <p className="studio-slide-heading__desc">
                  Giới thiệu ngắn về tác giả, phong cách mỹ thuật và định hướng các tác phẩm truyện tranh/artbook bạn theo đuổi.
                </p>
              </div>

              <div className="studio-field-group">
                <label className="studio-field">
                  <span className="studio-field__label">
                    Tiểu sử tác giả / studio <span className="studio-field__required">*</span>
                  </span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    value={bio}
                    onChange={event => setBio(event.target.value)}
                    placeholder="Giới thiệu về bạn hoặc studio, định hướng nghệ thuật, các dự án đã thực hiện và kế hoạch xuất bản sắp tới."
                    className="studio-textarea"
                    autoFocus
                  />
                  <div className="studio-field__meta">
                    <span className={bio.trim().length < 10 ? 'studio-counter--warn' : 'studio-counter--ok'}>
                      {bio.trim().length < 10
                        ? `⚠️ Cần tối thiểu 10 ký tự (hiện có ${bio.trim().length})`
                        : `✓ Đã nhập ${bio.trim().length} ký tự`}
                    </span>
                    <span className="muted" style={{ fontSize: '11px' }}>Tối đa 2,000 ký tự</span>
                  </div>
                </label>
              </div>

              <div className="studio-wizard-tip">
                <span className="studio-wizard-tip__icon">💡</span>
                <div className="studio-wizard-tip__body">
                  Gợi ý: Một đoạn giới thiệu chân thành và rõ phong cách (manga, indie comic, artbook tranh màu nước, pixel...) sẽ tạo được lòng tin rất lớn với người ủng hộ.
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 3: Portfolio & Liên hệ */}
          {step === 2 && (
            <div className="studio-slide-content">
              <div className="studio-slide-heading">
                <h3 className="studio-slide-heading__title">Portfolio &amp; Kênh liên hệ</h3>
                <p className="studio-slide-heading__desc">
                  Cung cấp liên kết tranh mẫu và kênh liên hệ để ban thẩm định đối soát năng lực mỹ thuật trước khi kích hoạt Xưởng.
                </p>
              </div>

              <div className="studio-field-group">
                <label className="studio-field">
                  <span className="studio-field__label">Link Portfolio / Trưng bày tranh mẫu</span>
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={portfolioUrl}
                    onChange={event => setPortfolioUrl(event.target.value)}
                    placeholder={'https://artstation.com/...\nhttps://behance.net/...\nhttps://drive.google.com/...'}
                    className="studio-textarea"
                    autoFocus
                  />
                  <span className="studio-field__hint">Mỗi dòng một liên kết. Có thể thêm ArtStation, Behance, Google Drive hoặc website cá nhân.</span>
                </label>

                <div className="studio-grid-2">
                  <label className="studio-field">
                    <span className="studio-field__label">Mạng xã hội / Trang cộng đồng</span>
                    <textarea
                      maxLength={500}
                      rows={3}
                      value={socialUrl}
                      onChange={event => setSocialUrl(event.target.value)}
                      placeholder={'https://facebook.com/...\nhttps://instagram.com/...\nhttps://x.com/...'}
                      className="studio-textarea"
                    />
                    <span className="studio-field__hint">Mỗi dòng một kênh cộng đồng hoặc trang mạng xã hội.</span>
                  </label>

                  <label className="studio-field">
                    <span className="studio-field__label">Email đối soát kỹ thuật</span>
                    <input
                      type="email"
                      maxLength={255}
                      value={contactEmail}
                      onChange={event => setContactEmail(event.target.value)}
                      placeholder="studio@example.com (tùy chọn)"
                      className="studio-input"
                    />
                  </label>
                </div>
              </div>

              <div className="studio-wizard-tip">
                <span className="studio-wizard-tip__icon">💡</span>
                <div className="studio-wizard-tip__body">
                  Lưu ý: Nếu bạn chưa có portfolio online riêng, hoàn toàn có thể chia sẻ một thư mục Google Drive (chế độ công khai) chứa các tranh phác thảo hoặc bản vẽ mẫu.
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 4: Cam kết IP */}
          {step === 3 && (
            <div className="studio-slide-content">
              <div className="studio-slide-heading">
                <h3 className="studio-slide-heading__title">Cam kết Bản quyền Sở hữu Trí tuệ 100%</h3>
                <p className="studio-slide-heading__desc">
                  FundTogether bảo hộ quyền tác giả. Bạn giữ 100% bản quyền sở hữu trí tuệ hợp pháp (Sovereign IP).
                </p>
              </div>

              <div className="studio-ip-banner">
                <div className="studio-ip-banner__badge">🛡️ CAM KẾT TÁC QUYỀN ĐỘC LẬP (SOVEREIGN IP)</div>
                <p className="studio-ip-banner__text">
                  Nền tảng cam kết không thu giữ hay yêu cầu chuyển giao bản quyền tác phẩm. Tác giả giữ toàn bộ quyền thương mại, quyền phái sinh và quyền nhân thân. Nền tảng chỉ đóng vai trò bảo chứng hợp đồng gọi vốn on-chain và phân phối tệp PDF chất lượng cao có chữ ký điện tử.
                </p>
              </div>

              <div className="studio-field-group">
                <label className="studio-field">
                  <span className="studio-field__label">
                    Tuyên ngôn cam kết quyền sở hữu trí tuệ <span className="studio-field__required">*</span>
                  </span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    value={ipDeclaration}
                    onChange={event => setIpDeclaration(event.target.value)}
                    className="studio-textarea"
                    autoFocus
                  />
                  <span className="studio-field__hint">Bạn có thể giữ nội dung cam kết mặc định hoặc bổ sung các điều khoản đặc thù của studio.</span>
                </label>
              </div>
            </div>
          )}

          {/* SLIDE 5: Xác nhận & Nộp */}
          {step === 4 && (
            <div className="studio-slide-content">
              <div className="studio-slide-heading">
                <h3 className="studio-slide-heading__title">Rà soát thông tin &amp; Nộp hồ sơ</h3>
                <p className="studio-slide-heading__desc">
                  Kiểm tra lại metadata trước khi lưu. Việc lưu metadata không cấp quyền publication.
                </p>
              </div>

              <div className="studio-review-card">
                <div className="studio-review-card__header">
                  <span className="studio-review-card__tag">HỒ SƠ TỔNG QUAN</span>
                  <button
                    type="button"
                    className="studio-review-card__edit-btn"
                    onClick={() => setStep(0)}
                  >
                    Chỉnh sửa lại ✎
                  </button>
                </div>

                <div className="studio-review-grid">
                  <div className="studio-review-item">
                    <span className="studio-review-label">Bút danh / Tên Studio</span>
                    <strong className="studio-review-value">{displayName || '(Chưa nhập)'}</strong>
                  </div>
                  <div className="studio-review-item">
                    <span className="studio-review-label">Lĩnh vực sáng tác</span>
                    <span className="studio-review-value">{primaryGenre}</span>
                  </div>
                  <div className="studio-review-item studio-review-item--full">
                    <span className="studio-review-label">Tiểu sử &amp; Quá trình</span>
                    <p className="studio-review-value" style={{ margin: 0, whiteSpace: 'pre-line' }}>{bio || '(Chưa nhập)'}</p>
                  </div>
                  <div className="studio-review-item">
                    <span className="studio-review-label">Portfolio</span>
                    <span className="studio-review-value" style={{ whiteSpace: 'pre-line' }}>{parseProfileLinks(portfolioUrl).join('\n') || 'Chưa cung cấp'}</span>
                  </div>
                  <div className="studio-review-item">
                    <span className="studio-review-label">Mạng xã hội</span>
                    <span className="studio-review-value" style={{ whiteSpace: 'pre-line' }}>{parseProfileLinks(socialUrl).join('\n') || 'Chưa cung cấp'}</span>
                  </div>
                  <div className="studio-review-item studio-review-item--full">
                    <span className="studio-review-label">Email đối soát</span>
                    <span className="studio-review-value">{contactEmail || 'Chưa cung cấp'}</span>
                  </div>
                  <div className="studio-review-item studio-review-item--full">
                    <span className="studio-review-label">Ví Studio đại diện</span>
                    <span className="studio-review-value">{selectedStudioWallet?.address || 'Chưa chọn ví'}</span>
                  </div>
                </div>
              </div>

              <label className="studio-pledge-card">
                <input
                  type="checkbox"
                  checked={originalWorkPledge}
                  onChange={event => setOriginalWorkPledge(event.target.checked)}
                  className="studio-pledge-checkbox"
                  required
                />
                <div className="studio-pledge-text">
                  <strong>Xác nhận Tác quyền Nguyên bản:</strong> Tôi cam kết mọi ấn phẩm phát hành qua Studio là sản phẩm sáng tạo nguyên bản của chính tác giả / studio, hoàn toàn không sao chép, đạo nhái hoặc xâm phạm quyền sở hữu trí tuệ của bất kỳ bên thứ ba nào.
                </div>
              </label>
            </div>
          )}

          {walletsQuery.error && <p className="toast toast--error" role="alert" style={{ marginTop: '10px' }}>{getErrorMessage(walletsQuery.error)}</p>}
          {formError && <p className="toast toast--error" role="alert" style={{ marginTop: '10px' }}>{formError}</p>}
          {successNotice && <p className="toast toast--success" role="status" style={{ marginTop: '10px' }}>{successNotice}</p>}

          {/* Footer Navigation Bar */}
          <div className="studio-wizard-footer">
            <div className="studio-wizard-footer__left">
              {step > 0 && (
                <button
                  type="button"
                  className="button button--secondary studio-wizard-btn-back"
                  onClick={() => {
                    setFormError('');
                    setStep(s => s - 1);
                  }}
                  disabled={busy}
                >
                  ← Quay lại
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  className="button button--quiet studio-wizard-btn-cancel"
                  onClick={onCancel}
                  disabled={busy}
                >
                  Hủy bỏ
                </button>
              )}
            </div>

            <div className="studio-wizard-footer__right">
              {step < 4 ? (
                <button
                  type="button"
                  className="button button--primary studio-wizard-btn-next"
                  onClick={handleNext}
                >
                  Tiếp tục: {STEP_SHORT_TITLES[step + 1]} →
                </button>
              ) : (
                <button
                  type="submit"
                  className="button button--primary studio-wizard-btn-submit"
                  disabled={busy}
                >
                  {busy ? 'Đang gửi hồ sơ…' : profile ? 'Lưu thay đổi & gửi lại' : '✓ Gửi hồ sơ thẩm định Studio'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Profile({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'bio' | 'ip' | 'publications'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['my-campaign-creator-profile', userId],
    queryFn: ({ signal }) => getCreatorProfile(signal),
  });
  const operationsQuery = useQuery({
    queryKey: ['campaign-campaign-operations', 'creator', userId],
    queryFn: ({ signal }) => campaignApi.operations('creator', signal),
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
      <div className="studio-page studio-page--wizard">
        <CreatorProfileForm
          profile={null}
          onSaved={() => {
            setIsCreating(false);
            void profileQuery.refetch();
          }}
          onCancel={() => setIsCreating(false)}
        />
      </div>
    );
  }

  const statusBadge = status === 'VERIFIED' ? (
    <span className="studio-badge studio-badge--verified">✓ Metadata đã lưu</span>
  ) : status === 'PENDING' ? (
    <span className="studio-badge studio-badge--pending">⏳ Metadata đang cập nhật</span>
  ) : status === 'REJECTED' ? (
    <span className="studio-badge studio-badge--rejected">⚠️ Metadata cần cập nhật</span>
  ) : (
    <span className="studio-badge studio-badge--unregistered">Chưa đăng ký</span>
  );

  const displayName = profile.displayName || 'Tác giả / Studio';
  const monogram = getMonogram(profile.displayName);
  const slug = getSlug(profile.displayName);
  const portfolioLinks = parseProfileLinks(profile.portfolioUrl);
  const communityLinks = parseProfileLinks(profile.socialUrl);

  return (
    <div className="studio-page">
      {/* Cover Banner */}
      <div className="studio-cover">
        <span className="studio-cover__watermark">FundTogether Atelier · Hồ sơ Studio</span>
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
                @{slug} · {profile.primaryGenre || 'Studio truyện tranh & Artbook độc lập'} · Hồ sơ Studio
              </p>
              {profile.bio && <p className="studio-header-bio">{profile.bio}</p>}
            </div>
          </div>

          <div className="studio-actions">
            <a className="button button--primary" href="#/campaigns/creator">Vào Xưởng sáng tác →</a>
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
            aria-selected={activeTab === 'publications'}
            className={`studio-nav-tab ${activeTab === 'publications' ? 'studio-nav-tab--active' : ''}`}
            onClick={() => { setActiveTab('publications'); setIsEditing(false); }}
          >
            Ấn phẩm xuất bản {operations.length > 0 && `(${operations.length})`}
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
            aria-selected={activeTab === 'bio'}
            className={`studio-nav-tab ${activeTab === 'bio' ? 'studio-nav-tab--active' : ''}`}
            onClick={() => { setActiveTab('bio'); setIsEditing(false); }}
          >
            Tiểu sử &amp; Năng lực
          </button>
        </nav>
      </div>

      {/* Pending status notification banner */}
      {status === 'PENDING' && !isEditing && (
        <div className="studio-pending-alert" role="status">
          <div className="studio-pending-alert__header">
            <span aria-hidden="true">⏳</span>
            <strong>Metadata tác giả là tùy chọn</strong>
          </div>
          <p>
            Bạn có thể tiếp tục tạo campaign và gửi commitment vào vòng Judge ngay cả khi metadata đang PENDING hoặc REJECTED.
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
                <span className="studio-info-value">{profile.primaryGenre || 'Truyện tranh, Artbook & Tiểu thuyết đồ họa'}</span>
              </li>
              {portfolioLinks.length > 0 && (
                <li className="studio-info-item">
                  <span className="studio-info-label">Trưng bày tác phẩm</span>
                  <span className="studio-info-value studio-link-list">
                    {portfolioLinks.map(link => (
                      <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                        {getProfileLinkLabel(link)} ↗
                      </a>
                    ))}
                  </span>
                </li>
              )}
              {communityLinks.length > 0 && (
                <li className="studio-info-item">
                  <span className="studio-info-label">Kênh cộng đồng</span>
                  <span className="studio-info-value studio-link-list">
                    {communityLinks.map(link => (
                      <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                        {getProfileLinkLabel(link)} ↗
                      </a>
                    ))}
                  </span>
                </li>
              )}
              {profile.contactEmail && (
                <li className="studio-info-item">
                  <span className="studio-info-label">Email đối soát</span>
                  <span className="studio-info-value">{profile.contactEmail}</span>
                </li>
              )}
              <li className="studio-info-item">
                <span className="studio-info-label">Trạng thái thẩm định</span>
                <span className="studio-info-value">
                  {status === 'VERIFIED'
                    ? 'Metadata đã được lưu'
                    : status === 'PENDING'
                    ? 'Metadata đang chờ cập nhật'
                    : status === 'REJECTED'
                    ? 'Metadata cần cập nhật'
                    : 'Chưa có metadata tác giả'}
                </span>
              </li>
              <li className="studio-info-item">
                <span className="studio-info-label">Bản quyền xuất bản</span>
                <span className="studio-info-value">Cam kết 100% sở hữu trí tuệ độc lập (Sovereign IP)</span>
              </li>
            </ul>
          </div>

          <div className="studio-card">
            <div className="studio-card__header">
              <h2 className="studio-card__title">Tiêu chuẩn campaign</h2>
              <span className="studio-info-label">QUY CHUẨN</span>
            </div>
            <p className="muted" style={{ fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
              Mỗi ấn phẩm trên FundTogether được lưu ký hợp đồng thông minh MockUSDC, phát hành file PDF chất lượng cao riêng tư và đi qua Judge case on-chain ở bước publication.
            </p>
          </div>
        </aside>

        {/* Right Column: Main Feed / Edit Form */}
        <main className="studio-main">
          {profile.status === 'REJECTED' && (
            <div className="toast toast--error" role="alert" style={{ marginBottom: '16px' }}>
              <strong>Metadata cần cập nhật:</strong> {profile.rejectionReason || 'Bạn có thể sửa metadata, nhưng không bị khóa khỏi campaign.'}
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
              {activeTab === 'bio' && (
                <article className="studio-post">
                  <div className="studio-post__meta">
                    <div className="studio-post__avatar-mini">{monogram}</div>
                    <div className="studio-post__author-info">
                      <span className="studio-post__author-name">{displayName}</span>
                      <span className="studio-post__date">
                        {profile.primaryGenre || 'Tiểu sử & Kinh nghiệm sáng tác'}
                      </span>
                    </div>
                  </div>
                  <div className="studio-post__body" style={{ whiteSpace: 'pre-line' }}>{profile.bio}</div>

                  {(portfolioLinks.length > 0 || communityLinks.length > 0 || profile.contactEmail) && (
                    <div
                      style={{
                        marginTop: '16px',
                        padding: '14px 16px',
                        background: '#fcfbf9',
                        borderRadius: '6px',
                        border: '1px solid rgba(24, 23, 22, 0.08)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '16px',
                        fontSize: '13px',
                      }}
                    >
                      {portfolioLinks.length > 0 && (
                        <div>
                          <strong className="muted">Portfolio: </strong>
                          <span className="studio-link-list studio-link-list--inline">
                            {portfolioLinks.map(link => (
                              <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                                {getProfileLinkLabel(link)} ↗
                              </a>
                            ))}
                          </span>
                        </div>
                      )}
                      {communityLinks.length > 0 && (
                        <div>
                          <strong className="muted">Kênh cộng đồng: </strong>
                          <span className="studio-link-list studio-link-list--inline">
                            {communityLinks.map(link => (
                              <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                                {getProfileLinkLabel(link)} ↗
                              </a>
                            ))}
                          </span>
                        </div>
                      )}
                      {profile.contactEmail && (
                        <div>
                          <strong className="muted">Liên hệ: </strong>
                          <span>{profile.contactEmail}</span>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )}

              {/* Tab: IP */}
              {activeTab === 'ip' && (
                <article className="studio-post studio-certificate-card">
                  <span className="studio-certificate-preface">VĂN BẢN CAM KẾT PHÁP LÝ · SOVEREIGN IP</span>
                  <div className="studio-post__meta">
                    <div className="studio-post__avatar-mini">§</div>
                    <div className="studio-post__author-info">
                      <span className="studio-post__author-name">Cam kết Sở hữu Trí tuệ 100%</span>
                      <span className="studio-post__date">
                        {profile.originalWorkPledge ? '✓ Đã xác nhận Tác quyền Nguyên bản' : 'Xác nhận quyền xuất bản số độc quyền'}
                      </span>
                    </div>
                  </div>
                  <div className="studio-post__body" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>
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
                          <a className="button button--secondary" href={`#/campaigns/${op.campaignId}`}>
                            Xem chi tiết
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <p className="muted" style={{ margin: '0 0 12px' }}>
                        'Chưa có ấn phẩm nào. Hãy bắt đầu campaign đầu tiên của bạn!'
                      </p>
                      <a className="button button--primary" href="#/campaigns/creator">Mở Xưởng sáng tác</a>
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
