import { formatUnits } from 'viem';
import type { CampaignPreview } from '../../api/campaigns';
import type { CampaignUiState } from './campaignState';
import { StatusBadge } from './StatusBadge';
import { ProgressChart } from './ProgressChart';

type CampaignData = CampaignPreview | (Record<string, unknown> & {
  id?: string;
  config?: CampaignPreview['config'];
  draftConfig?: CampaignPreview['config'];
  creatorDisplayName?: string;
  creator?: string;
  commitmentHash?: string;
  feedbackCount?: number;
  surface?: string;
});

interface EditorialCampaignCardProps {
  campaign: CampaignData;
  state: CampaignUiState;
  href: string;
  raised?: string;
  className?: string;
}

function safePrice(val?: string): string {
  try {
    if (!val) return '0 MockUSDC';
    return `${formatUnits(BigInt(val), 6)} MockUSDC`;
  } catch {
    return '0 MockUSDC';
  }
}

export function EditorialCampaignCard({
  campaign,
  state,
  href,
  raised = '0',
  className = '',
}: EditorialCampaignCardProps) {
  const config = ('config' in campaign && campaign.config)
    ? campaign.config
    : ('draftConfig' in campaign ? campaign.draftConfig : undefined);

  const directTitle = 'title' in campaign && typeof campaign.title === 'string' ? campaign.title : undefined;
  const directPitch = 'pitch' in campaign && typeof campaign.pitch === 'string' ? campaign.pitch : undefined;
  const directGoal = 'goal' in campaign && typeof campaign.goal === 'string' ? campaign.goal : undefined;
  const directTier = 'tiers' in campaign && Array.isArray(campaign.tiers) ? campaign.tiers[0] : undefined;
  const title = config?.title || directTitle || 'Digital Comic';
  const pitch = config?.pitch || directPitch || '';
  const tier = config?.tiers?.[0] || directTier;
  const priceFormatted = safePrice(tier?.price);
  const goal = config?.goal || directGoal || '0';
  const creator = ('creatorDisplayName' in campaign && campaign.creatorDisplayName)
    ? campaign.creatorDisplayName
    : ('creator' in campaign && typeof campaign.creator === 'string' ? campaign.creator : 'Creator');

  const commitmentHash = 'commitmentHash' in campaign && typeof campaign.commitmentHash === 'string'
    ? campaign.commitmentHash
    : undefined;

  const surface = 'surface' in campaign && typeof campaign.surface === 'string'
    ? campaign.surface
    : undefined;

  const isFunding = state.technicalCode === 'FUNDING' || surface === 'FUNDING';

  return (
    <article className={`panel editorial-campaign-card ${className}`.trim()}>
      <div className="editorial-campaign-card__cover" aria-hidden="true">
        <div className="editorial-campaign-card__cover-header">
          <span className="editorial-campaign-card__cover-tag">PDF Standard</span>
          <span className="editorial-campaign-card__cover-brand">FundTogether</span>
        </div>
        <div className="editorial-campaign-card__cover-art">
          <svg
            className="editorial-campaign-card__cover-emblem"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span className="editorial-campaign-card__cover-format">Truyện tranh / Artbook</span>
        </div>
      </div>

      <div className="editorial-campaign-card__body">
        <div className="editorial-campaign-card__header">
          <StatusBadge state={state} />
          <span className="editorial-campaign-card__creator">{creator}</span>
        </div>

        <h2 className="editorial-campaign-card__title">
          <a href={href}>{title}</a>
        </h2>

        {pitch && <p className="editorial-campaign-card__pitch">{pitch}</p>}

        {surface === 'REVIEW' && (
          <p className="editorial-campaign-card__review-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Đang lấy ý kiến cộng đồng · Chưa mở ủng hộ</span>
          </p>
        )}

        <div className="editorial-campaign-card__tier">
          <span className="editorial-campaign-card__tier-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            1 bản PDF độc quyền
          </span>
          <span className="editorial-campaign-card__tier-price">{priceFormatted}</span>
        </div>

        {isFunding && (
          <div className="editorial-campaign-card__chart">
            <ProgressChart pledged={raised} goal={goal} />
          </div>
        )}

        <div className="editorial-campaign-card__cta">
          <a className="button button--primary" href={href}>
            {isFunding ? 'Ủng hộ campaign →' : 'Xem chi tiết →'}
          </a>
        </div>

        {commitmentHash && (
          <details className="technical-details editorial-campaign-card__details">
            <summary>Chi tiết kỹ thuật</summary>
            <p>
              Commitment: <code className="campaign-hash" title={commitmentHash}>{commitmentHash}</code>
            </p>
          </details>
        )}
      </div>
    </article>
  );
}
