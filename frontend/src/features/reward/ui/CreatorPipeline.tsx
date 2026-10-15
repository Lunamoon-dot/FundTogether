import type { RewardCampaign } from '../../../lib/api/reward';

interface CreatorPipelineProps {
  campaigns: RewardCampaign[];
  className?: string;
}

export function CreatorPipeline({ campaigns = [], className = '' }: CreatorPipelineProps) {
  const stages = [
    {
      key: 'draft',
      label: 'Bản nháp',
      count: campaigns.filter(c => ['DRAFT', 'FROZEN', 'CHANGES_REQUESTED'].includes(c.status)).length,
    },
    {
      key: 'review',
      label: 'Đang thẩm định',
      count: campaigns.filter(c => ['UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW'].includes(c.status)).length,
    },
    {
      key: 'approved',
      label: 'Được duyệt',
      count: campaigns.filter(c => c.status === 'APPROVED').length,
    },
    {
      key: 'funding',
      label: 'Đang gây quỹ',
      count: campaigns.filter(c => ['ACTIVE', 'FUNDING'].includes(c.status)).length,
    },
    {
      key: 'production',
      label: 'Sản xuất',
      count: campaigns.filter(c => ['PRODUCTION_VERIFIED', 'PRODUCTION'].includes(c.status)).length,
    },
    {
      key: 'released',
      label: 'Đã phát hành',
      count: campaigns.filter(c => ['COMPLETED', 'FULFILLMENT_COMPLETE', 'RELEASED'].includes(c.status)).length,
    },
  ];

  const summary = stages.map(s => `${s.label}: ${s.count}`).join(' · ');

  return (
    <section className={`creator-pipeline ${className}`.trim()} aria-label="Tiến trình sản xuất ấn phẩm">
      <div className="creator-pipeline__header">
        <span className="creator-pipeline__title">Tiến trình ấn phẩm</span>
        <span className="creator-pipeline__summary">{summary}</span>
      </div>

      <div className="creator-pipeline__strip">
        {stages.map((stage, idx) => (
          <div
            key={stage.key}
            className={`creator-pipeline__step ${stage.count > 0 ? 'creator-pipeline__step--has-items' : ''}`}
          >
            <div className="creator-pipeline__step-indicator">
              <span className="creator-pipeline__step-count">{stage.count}</span>
              <span className="creator-pipeline__step-dot" aria-hidden="true" />
            </div>
            <span className="creator-pipeline__step-label">{stage.label}</span>
            {idx < stages.length - 1 && <span className="creator-pipeline__step-divider" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
