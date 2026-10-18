import { useState, useCallback, useId } from 'react';

export interface ColophonRubricProps {
  campaignNumber?: string | number;
  commitmentHash?: string;
  collateralPercent?: number;
  pledgedFormatted?: string;
  goalFormatted?: string;
  resolverVerified?: boolean;
  stateLabel?: string;
  creatorName?: string;
  className?: string;
  compact?: boolean;
}

export function ColophonRubric({
  campaignNumber = '01',
  commitmentHash,
  collateralPercent = 0,
  pledgedFormatted,
  goalFormatted,
  resolverVerified = true,
  stateLabel,
  creatorName,
  className = '',
  compact = false,
}: ColophonRubricProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dossierId = useId();

  const formattedCampaign = String(campaignNumber).padStart(2, '0');

  const handleCopyHash = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!commitmentHash) return;
    try {
      await navigator.clipboard.writeText(commitmentHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [commitmentHash]);

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleOpen();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    },
    [isOpen, toggleOpen]
  );

  return (
    <div className={`colophon-rubric ${compact ? 'colophon-rubric--compact' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="colophon-rubric__trigger"
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-controls={dossierId}
        aria-label={`Bản khắc công chứng số ${formattedCampaign} — Nhấn để mở hồ sơ kiểm định`}
      >
        <div className="colophon-rubric__seal" aria-hidden="true">
          <svg
            className="colophon-rubric__seal-svg"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer ornamental notched border */}
            <circle
              cx="50"
              cy="50"
              r="47"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              className="colophon-rubric__ring-outer"
            />
            {/* Inner solid border */}
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="currentColor"
              strokeWidth="1"
              className="colophon-rubric__ring-inner"
            />
            {/* Circular Path for Typographic Seal Text */}
            <path
              id={`textPath-${dossierId}`}
              d="M 50 14 A 36 36 0 1 1 49.9 14"
              fill="none"
            />
            <text className="colophon-rubric__circular-text">
              <textPath href={`#textPath-${dossierId}`} startOffset="50%" textAnchor="middle">
                FUNDTOGETHER CAMPAIGN · ESCROW VERIFIED ·
              </textPath>
            </text>
            {/* Center Monogram / Campaign Number */}
            <circle cx="50" cy="50" r="23" stroke="currentColor" strokeWidth="0.75" />
            <text x="50" y="47" textAnchor="middle" className="colophon-rubric__center-tag">
              ED.
            </text>
            <text x="50" y="60" textAnchor="middle" className="colophon-rubric__center-num">
              {formattedCampaign}
            </text>
          </svg>
          <span className="colophon-rubric__stamp-ink" />
        </div>

        <div className="colophon-rubric__summary">
          <div className="colophon-rubric__status-row">
            <span className="colophon-rubric__bullet" />
            <span className="colophon-rubric__status-text">
              {resolverVerified ? 'ĐÃ CÔNG CHỨNG ESCROW' : 'ĐANG THẨM ĐỊNH'}
            </span>
          </div>
          <span className="colophon-rubric__caption">
            {stateLabel || (collateralPercent > 0 ? `${collateralPercent}% Ký quỹ` : 'Bản khắc số')}
          </span>
        </div>
      </button>

      {/* Expanded Notarial Dossier Panel */}
      {isOpen && (
        <div id={dossierId} className="colophon-rubric__dossier" role="region" aria-label="Chi tiết công chứng và ký quỹ">
          <div className="colophon-rubric__dossier-header">
            <div className="colophon-rubric__dossier-badge">
              <span className="colophon-rubric__dossier-campaign">CAMPAIGN NO. {formattedCampaign}</span>
              <span className="colophon-rubric__dossier-rule">/</span>
              <span>LƯU TRỮ VĨNH VIỄN</span>
            </div>
            <button
              type="button"
              className="colophon-rubric__close"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng hồ sơ"
            >
              ✕
            </button>
          </div>

          <div className="colophon-rubric__dossier-body">
            <div className="colophon-rubric__spec-item">
              <span className="colophon-rubric__spec-label">CƠ CHẾ KÝ QUỸ (ESCROW)</span>
              <span className="colophon-rubric__spec-value">
                MockUSDC Escrow Contract · Anvil 31339
              </span>
            </div>

            {creatorName && (
              <div className="colophon-rubric__spec-item">
                <span className="colophon-rubric__spec-label">TÁC GIẢ / AUTEUR</span>
                <span className="colophon-rubric__spec-value">{creatorName}</span>
              </div>
            )}

            {(pledgedFormatted || goalFormatted) && (
              <div className="colophon-rubric__spec-item">
                <span className="colophon-rubric__spec-label">TIẾN ĐỘ COLLATERAL</span>
                <span className="colophon-rubric__spec-value">
                  {pledgedFormatted || '0'} / {goalFormatted || '0'}
                  {collateralPercent > 0 && ` (${collateralPercent}%)`}
                </span>
              </div>
            )}

            {commitmentHash && (
              <div className="colophon-rubric__spec-item colophon-rubric__spec-item--hash">
                <div className="colophon-rubric__hash-header">
                  <span className="colophon-rubric__spec-label">DẤU VÂN TAY BẢN THẢO (SHA-256)</span>
                  <button
                    type="button"
                    className="colophon-rubric__copy-btn"
                    onClick={handleCopyHash}
                    aria-label="Sao chép mã băm"
                  >
                    {copied ? 'Đã sao chép' : 'Sao chép'}
                  </button>
                </div>
                <code className="colophon-rubric__hash-code">{commitmentHash}</code>
              </div>
            )}

            <div className="colophon-rubric__guarantee-box">
              <span className="colophon-rubric__guarantee-icon">§</span>
              <p className="colophon-rubric__guarantee-text">
                Bản quyền 100% được bảo chứng bởi tác giả. Tiền ủng hộ được khóa an toàn trong hợp đồng
                thông minh. Hoàn tiền 100% tự động nếu đợt phát hành không đạt điều kiện nghiệm thu.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
