import type { RewardCampaign } from '../../../lib/api/reward';
import type { EditionsOperationSummary } from '../../../lib/api/editions';

interface CreatorPipelineProps {
  campaigns: RewardCampaign[];
  operations?: EditionsOperationSummary[];
  className?: string;
}

export function CreatorPipeline({ campaigns = [], operations = [], className = '' }: CreatorPipelineProps) {
  const stageFor = (campaign: RewardCampaign) => {
    const operation = operations.find(item => item.campaignId === campaign.id);
    const chainState = operation?.contractState ?? null;
    if (chainState !== null) {
      if (chainState === 0) return 'funding';
      if (chainState === 1 || chainState === 2) return 'production';
      if (chainState === 3 || chainState === 5) return 'released';
      if (chainState === 4) return 'refund';
      return null;
    }

    if (['DRAFT', 'FROZEN', 'CHANGES_REQUESTED'].includes(campaign.status)) return 'draft';
    if (['UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW'].includes(campaign.status)) return 'review';
    if (campaign.status === 'STOPPED') return 'rejected';
    if (campaign.status === 'APPROVED' && operation) return 'approved';
    if (['ACTIVE', 'FUNDING'].includes(campaign.status)) return 'funding';
    if (['PRODUCTION_VERIFIED', 'PRODUCTION'].includes(campaign.status)) return 'production';
    if (['COMPLETED', 'FULFILLMENT_COMPLETE', 'RELEASED'].includes(campaign.status)) return 'released';
    return null;
  };

  const stages = [
    {
      key: 'draft',
      label: 'Bản nháp',
      count: campaigns.filter(c => stageFor(c) === 'draft').length,
    },
    {
      key: 'review',
      label: 'Đang thẩm định',
      count: campaigns.filter(c => stageFor(c) === 'review').length,
    },
    {
      key: 'approved',
      label: 'Được duyệt',
      count: campaigns.filter(c => stageFor(c) === 'approved').length,
    },
    {
      key: 'funding',
      label: 'Đang gây quỹ',
      count: campaigns.filter(c => stageFor(c) === 'funding').length,
    },
    {
      key: 'production',
      label: 'Sản xuất',
      count: campaigns.filter(c => stageFor(c) === 'production').length,
    },
    {
      key: 'released',
      label: 'Đã phát hành',
      count: campaigns.filter(c => stageFor(c) === 'released').length,
    },
  ];
  const terminalBranches = [
    {
      key: 'refund',
      label: 'Thất bại · hoàn tiền',
      count: campaigns.filter(c => stageFor(c) === 'refund').length,
    },
    {
      key: 'rejected',
      label: 'Bị từ chối',
      count: campaigns.filter(c => stageFor(c) === 'rejected').length,
    },
  ];

  const summary = [...stages, ...terminalBranches].map(s => `${s.label}: ${s.count}`).join(' · ');

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

      <div className="creator-pipeline__branches" aria-label="Nhánh kết thúc">
        <span className="creator-pipeline__branches-title">Nhánh kết thúc</span>
        {terminalBranches.map(branch => (
          <span
            key={branch.key}
            className={`creator-pipeline__branch creator-pipeline__branch--${branch.key} ${branch.count > 0 ? 'creator-pipeline__branch--has-items' : ''}`}
          >
            <span className="creator-pipeline__branch-count">{branch.count}</span>
            {branch.label}
          </span>
        ))}
      </div>
    </section>
  );
}
