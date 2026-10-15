export interface CommitmentCardItem {
  commitmentHash: string;
  creatorDisplayName?: string;
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
  releaseWindow: { start: string; end: string };
  config: {
    title: string;
    story: string;
    goal: string;
    fundingDuration: number;
    tiers: Array<{
      price: string;
      estimatedDeliveryAt?: string;
      rewardItems: Array<{
        title?: string;
        description: string;
      }>;
    }>;
  };
  decisions: Array<{
    outcome: string;
    reviewedAt: string;
    decisionReason?: string;
  }>;
}

interface EditionsCommitmentCardProps {
  item: CommitmentCardItem;
  amount: (val: string) => string;
  className?: string;
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

export function EditionsCommitmentCard({
  item,
  amount,
  className = '',
}: EditionsCommitmentCardProps) {
  const primaryTier = item.config.tiers[0];
  const primaryItem = primaryTier?.rewardItems[0];
  const latestDecision = item.decisions[0];

  return (
    <section className={`panel commitment-card ${className}`} aria-labelledby="commitment-card-title">
      {/* 1. Card Header */}
      <div className="commitment-card__header">
        <div className="commitment-card__badge-row">
          <span className="commitment-card__kicker">📜 Cam kết xuất bản chính thức</span>
          {latestDecision && (
            <span
              className={`commitment-card__decision-pill ${
                latestDecision.outcome === 'APPROVED'
                  ? 'commitment-card__decision-pill--approved'
                  : 'commitment-card__decision-pill--other'
              }`}
            >
              ⚖️ Resolver: {latestDecision.outcome}
            </span>
          )}
        </div>
        <h2 id="commitment-card-title" className="commitment-card__title">
          Cam kết tác phẩm & Kế hoạch sản xuất
        </h2>
        <p className="commitment-card__pitch muted">
          Hồ sơ điều khoản kỹ thuật số đã được đóng băng và thẩm định trước khi mở gây quỹ.
        </p>
      </div>

      {/* 2. Story / Narrative Section */}
      <div className="commitment-card__block commitment-card__story-block">
        <h3 className="commitment-card__block-title">
          <span className="commitment-card__icon" aria-hidden="true">📖</span> Cốt truyện & Tác phẩm
        </h3>
        <p className="commitment-card__story-text">{item.config.story}</p>
      </div>

      {/* 3. Deliverable Tier Banner */}
      {primaryItem && (
        <div className="commitment-deliverable-card">
          <div className="commitment-deliverable-card__icon" aria-hidden="true">📄</div>
          <div className="commitment-deliverable-card__body">
            <div className="commitment-deliverable-card__headline">
              <h4 className="commitment-deliverable-card__title">
                Ấn phẩm số tiêu chuẩn (Standard PDF)
              </h4>
              <span className="commitment-deliverable-card__tag">100% Digital Download</span>
            </div>
            <p className="commitment-deliverable-card__desc">
              {primaryItem.description}
            </p>
            <div className="commitment-deliverable-card__tags">
              <span className="commitment-mini-tag">✓ Đọc trên mọi thiết bị</span>
              <span className="commitment-mini-tag">✓ Không phí vận chuyển</span>
              <span className="commitment-mini-tag">✓ Vé tải có chữ ký bảo mật</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Three Review Pillars Grid */}
      <div className="commitment-pillars-section">
        <h3 className="commitment-pillars-title">Ba trụ cột chuẩn bị sản xuất (Review Pillars)</h3>
        <div className="commitment-pillars-grid">
          {/* Pillar 1: Content Outline */}
          <article className="commitment-pillar-card">
            <div className="commitment-pillar-card__header">
              <span className="commitment-pillar-card__icon" aria-hidden="true">📑</span>
              <h3 className="commitment-pillar-card__title">Đề cương</h3>
            </div>
            <p className="commitment-pillar-card__text">{item.contentOutline}</p>
          </article>

          {/* Pillar 2: Budget Plan */}
          <article className="commitment-pillar-card">
            <div className="commitment-pillar-card__header">
              <span className="commitment-pillar-card__icon" aria-hidden="true">💰</span>
              <h3 className="commitment-pillar-card__title">Ngân sách tự sản xuất</h3>
            </div>
            <p className="commitment-pillar-card__text">{item.budgetPlan}</p>
          </article>

          {/* Pillar 3: Evidence Plan */}
          <article className="commitment-pillar-card">
            <div className="commitment-pillar-card__header">
              <span className="commitment-pillar-card__icon" aria-hidden="true">🔍</span>
              <h3 className="commitment-pillar-card__title">Kế hoạch bằng chứng</h3>
            </div>
            <p className="commitment-pillar-card__text">{item.evidencePlan}</p>
          </article>
        </div>
      </div>

      {/* 5. Metrics & Release Deadlines Grid */}
      <div className="commitment-metrics-grid">
        <div className="commitment-metric-tile">
          <span className="commitment-metric-tile__label">🎯 Mục tiêu & Thời gian</span>
          <strong className="commitment-metric-tile__val">
            Mục tiêu: {amount(item.config.goal)}
          </strong>
          <span className="commitment-metric-tile__sub">
            Thời hạn: {item.config.fundingDuration / 86400} ngày gây quỹ
          </span>
        </div>

        <div className="commitment-metric-tile">
          <span className="commitment-metric-tile__label">⏳ Hạn cam kết phát hành</span>
          <strong className="commitment-metric-tile__val">
            {formatDate(item.releaseWindow.end)}
          </strong>
          <span className="commitment-metric-tile__sub">
            Hạn cam kết phát hành PDF (UTC): {item.releaseWindow.end}
          </span>
        </div>

        {primaryTier?.estimatedDeliveryAt && (
          <div className="commitment-metric-tile">
            <span className="commitment-metric-tile__label">🗓️ Dự kiến ban đầu</span>
            <strong className="commitment-metric-tile__val">
              {formatDate(primaryTier.estimatedDeliveryAt)}
            </strong>
            <span className="commitment-metric-tile__sub">
              Ngày dự kiến phát hành PDF (UTC): {primaryTier.estimatedDeliveryAt}
            </span>
          </div>
        )}
      </div>

      {/* 6. Hash & Resolver Decisions Footer */}
      <div className="commitment-card__footer">
        <div className="commitment-hash-row">
          <span className="commitment-hash-row__label">
            <span aria-hidden="true">🔒</span> Cam kết:
          </span>
          <code className="commitment-hash-row__code" title={item.commitmentHash}>
            {item.commitmentHash}
          </code>
        </div>

        {item.decisions.length > 0 && (
          <div className="commitment-decisions-container">
            {item.decisions.map((decision, index) => (
              <div key={index} className="commitment-decision-badge">
                <span className="commitment-decision-badge__status">
                  Resolver: {decision.outcome}
                </span>
                <span className="commitment-decision-badge__time">
                  · {decision.reviewedAt}
                </span>
                {decision.decisionReason && (
                  <span className="commitment-decision-badge__reason">
                    — {decision.decisionReason}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
