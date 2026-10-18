import { useState } from 'react';
import { formatUnits } from 'viem';
import { getSample } from '../api/campaigns';
import type { Campaign, CampaignSample } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMediaType(mediaType: string): string {
  if (mediaType === 'application/pdf') return 'PDF';
  if (mediaType === 'image/png') return 'PNG';
  if (mediaType === 'image/jpeg' || mediaType === 'image/jpg') return 'JPEG';
  return mediaType;
}

export function SampleDownload({
  campaignId,
  sample,
  selected,
  onToggle,
  badgeText,
}: {
  campaignId: string;
  sample: CampaignSample;
  selected?: boolean;
  onToggle?: (checked: boolean) => void;
  badgeText?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      const file = await getSample(campaignId, sample.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sample-${sample.id}.${sample.mediaType === 'application/pdf' ? 'pdf' : sample.mediaType === 'image/png' ? 'png' : 'jpg'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isPdf = sample.mediaType === 'application/pdf';

  return (
    <div className="campaign-sample-card">
      <div className="campaign-sample-card__header">
        {onToggle ? (
          <label className="campaign-sample-card__toggle">
            <input
              type="checkbox"
              className="campaign-sample-card__checkbox"
              checked={selected ?? false}
              onChange={e => onToggle(e.target.checked)}
            />
            <span>Gắn tài liệu này vào hồ sơ</span>
          </label>
        ) : (
          <span className="campaign-sample-card__toggle">
            <span>Tài liệu mẫu đính kèm</span>
          </span>
        )}
        <div className="campaign-sample-card__header-right">
          {badgeText && (
            <span className="campaign-sample-card__status-tag">{badgeText}</span>
          )}
          <span className={`campaign-uploader__badge ${isPdf ? 'campaign-uploader__badge--pdf' : 'campaign-uploader__badge--img'}`}>
            {formatMediaType(sample.mediaType)}
          </span>
        </div>
      </div>

      <div className="campaign-sample-card__body">
        <div className="campaign-sample-card__file-meta">
          <span className="campaign-sample-card__icon" aria-hidden="true">
            {isPdf ? '📕' : '🖼️'}
          </span>
          <div className="campaign-sample-card__info">
            <span className="campaign-sample-card__title">
              Tài liệu mẫu #{sample.id.slice(0, 8)}
            </span>
            <span className="campaign-sample-card__size">
              {formatBytes(sample.sizeBytes)} · {sample.mediaType}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="button button--secondary campaign-sample-card__download"
          disabled={busy}
          onClick={() => void download()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {busy ? 'Đang tải…' : 'Tải trang mẫu'}
        </button>
      </div>

      <div className="campaign-sample-card__hash">
        <span className="campaign-sample-card__hash-label">SHA-256</span>
        <code className="campaign-sample-card__hash-code" title={sample.sha256}>
          {sample.sha256}
        </code>
      </div>

      {error && <p className="toast toast--error" role="alert">{error}</p>}
    </div>
  );
}

export function FrozenTerms({ campaign }: { campaign: Campaign }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const snapshot = campaign.frozenSnapshot;
  if (!snapshot) return <p>Chưa có snapshot đã khóa.</p>;
  const tier = snapshot.config.tiers[0];

  const stepTitles = [
    'Thông tin ấn phẩm & Quyền sở hữu IP',
    'Kế hoạch sản xuất & Ngân sách',
    `Tài liệu mẫu thẩm định (${snapshot.samples.length})`,
  ];

  return (
    <div className="frozen-terms">
      <div className="frozen-terms__header">
        <div className="frozen-terms__title-group">
          <span className="frozen-terms__badge">Bản thảo đã khóa cam kết</span>
        </div>
        <div className="frozen-terms__hash-pill">
          <span className="frozen-terms__hash-label">SHA-256</span>
          <code className="frozen-terms__hash-code" title={campaign.commitmentHash ?? undefined} style={{ overflowWrap: 'anywhere' }}>
            SHA-256: {campaign.commitmentHash}
          </code>
        </div>
      </div>

      <div className="frozen-terms__stepper-bar">
        <ol className="campaign-preparation-steps" aria-label="Các bước cam kết đã khóa">
          <li
            className={step === 0 ? 'is-current' : step > 0 ? 'is-complete' : ''}
            style={{ cursor: 'pointer' }}
            onClick={() => setStep(0)}
          >
            <span>1</span>Thông tin ấn phẩm & IP
          </li>
          <li
            className={step === 1 ? 'is-current' : step > 1 ? 'is-complete' : ''}
            style={{ cursor: 'pointer' }}
            onClick={() => setStep(1)}
          >
            <span>2</span>Kế hoạch sản xuất
          </li>
          <li
            className={step === 2 ? 'is-current' : ''}
            style={{ cursor: 'pointer' }}
            onClick={() => setStep(2)}
          >
            <span>3</span>Tài liệu mẫu ({snapshot.samples.length})
          </li>
        </ol>
      </div>

      <div className="frozen-terms__sub-header">
        <p className="campaign-preparation-step-caption" aria-live="polite" style={{ margin: 0 }}>
          Bước {step + 1} trên 3 · {stepTitles[step]}
        </p>
        <div className="frozen-terms__mini-nav">
          {step > 0 && (
            <button
              className="frozen-terms__mini-btn"
              type="button"
              onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)}
            >
              ← Back
            </button>
          )}
          {step < 2 && (
            <button
              className="frozen-terms__mini-btn"
              type="button"
              onClick={() => setStep((s) => (s + 1) as 0 | 1 | 2)}
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Publication, Tier & IP */}
      <div style={{ display: step === 0 ? 'block' : 'none' }}>
        <section className="frozen-terms__card" aria-label="Thông tin ấn phẩm, gói PDF và quyền sở hữu IP">
          <div className="frozen-terms__card-header">
            <span className="frozen-terms__step-badge">1</span>
            <h5>Thông tin ấn phẩm & Quyền sở hữu IP</h5>
          </div>
          <div className="frozen-terms__card-body">
            <div className="frozen-terms__main-info">
              <span className="frozen-terms__pub-title">{snapshot.config.title}</span>
              <span className="frozen-terms__pub-price">
                {' '}· {formatUnits(BigInt(tier.price), 6)} MockUSDC / standard PDF
              </span>
            </div>
            <div className="frozen-terms__narrative">
              <div className="frozen-terms__narrative-item">
                <span className="frozen-terms__field-label">Giới thiệu ngắn (Pitch)</span>
                <p className="frozen-terms__field-val">{snapshot.config.pitch}</p>
              </div>
              <div className="frozen-terms__narrative-item">
                <span className="frozen-terms__field-label">Câu chuyện tác phẩm (Story)</span>
                <p className="frozen-terms__field-val">{snapshot.config.story}</p>
              </div>
            </div>

            <div className="frozen-terms__sub-box">
              <p className="frozen-terms__meta-line">
                <strong>Gói {tier.title}:</strong> {tier.description}
              </p>
              {tier.benefitItems[0]?.description && tier.benefitItems[0].description !== tier.description && (
                <p className="frozen-terms__meta-line">
                  <strong>{tier.benefitItems[0].title}:</strong> {tier.benefitItems[0].description}
                </p>
              )}
            </div>

            <div className="frozen-terms__sub-box">
              <p className="frozen-terms__meta-line">
                <strong>Tác giả:</strong> {snapshot.creator.displayName}
              </p>
              <p className="frozen-terms__meta-line">
                <strong>Cam kết quyền IP:</strong> {snapshot.creator.ipDeclaration}
              </p>
              <p className="frozen-terms__meta-line">
                <strong>Ví đã liên kết:</strong> <code className="frozen-terms__wallet-code">{snapshot.payoutWallet.address}</code> · chain {snapshot.payoutWallet.chainId}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Step 2: Production Plan & Budget */}
      <div style={{ display: step === 1 ? 'block' : 'none' }}>
        <section className="frozen-terms__card" aria-label="Kế hoạch sản xuất và ngân sách">
          <div className="frozen-terms__card-header">
            <span className="frozen-terms__step-badge">2</span>
            <h5>Kế hoạch sản xuất & Ngân sách</h5>
          </div>
          <div className="frozen-terms__card-body">
            <div className="frozen-terms__stat-badge">
              <span className="frozen-terms__stat-label">Mục tiêu:</span>
              <span className="frozen-terms__stat-val">{formatUnits(BigInt(snapshot.config.goal), 6)} MockUSDC</span>
              <span className="frozen-terms__stat-sep">·</span>
              <span className="frozen-terms__stat-label">Thời hạn:</span>
              <span className="frozen-terms__stat-val">{snapshot.config.fundingDuration / 86400} ngày</span>
            </div>
            <div className="frozen-terms__sub-box">
              <p className="frozen-terms__meta-line">
                <strong>Đề cương:</strong> {snapshot.preparation.contentOutline}
              </p>
              <p className="frozen-terms__meta-line">
                <strong>Ngân sách:</strong> {snapshot.preparation.budgetPlan}
              </p>
              <p className="frozen-terms__meta-line">
                <strong>Bằng chứng dự kiến:</strong> {snapshot.preparation.evidencePlan}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Step 3: Verification Samples */}
      <div style={{ display: step === 2 ? 'block' : 'none' }}>
        <section className="frozen-terms__card" aria-label="Tài liệu mẫu đính kèm">
          <div className="frozen-terms__card-header">
            <span className="frozen-terms__step-badge">3</span>
            <h5>Tài liệu mẫu thẩm định ({snapshot.samples.length})</h5>
          </div>
          <div className="frozen-terms__card-body">
            <div className="frozen-terms__samples-list">
              {snapshot.samples.map(sample => (
                <SampleDownload
                  key={sample.id}
                  campaignId={campaign.id}
                  sample={sample}
                  badgeText="Cam kết PDF đã khóa"
                />
              ))}
            </div>
            <p className="public-sr-only sr-only" aria-hidden="true">
              Review nội dung chưa cho phép nhận pledge hay giải ngân.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
