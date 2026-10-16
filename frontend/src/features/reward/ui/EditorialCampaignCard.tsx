import { formatUnits } from 'viem';
import type { EditionsPreview } from '../../../lib/api/editions';
import type { RewardCampaign } from '../../../lib/api/reward';
import type { CampaignUiState } from './campaignState';
import { EditionStatusBadge } from './EditionStatusBadge';
import { EditionProgressChart } from './EditionProgressChart';
import { fundingProgressPercent } from './fundingProgress';
import { ColophonRubric } from './ColophonRubric';

type CampaignData = EditionsPreview | RewardCampaign | (Record<string, unknown> & {
  id?: string;
  config?: EditionsPreview['config'];
  draftConfig?: RewardCampaign['draftConfig'];
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
  const title = config?.title || directTitle || 'Editions Digital Comic';
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
  const collateralPct = fundingProgressPercent(raised, goal);

  return (
    <article className={`panel editorial-campaign-card ${className}`.trim()}>
      <div className="editorial-campaign-card__cover" aria-hidden="true">
        <span className="editorial-campaign-card__cover-tag">PDF Standard</span>
        <div className="editorial-campaign-card__cover-title">{title}</div>
      </div>

      <div className="editorial-campaign-card__body">
        <div className="editorial-campaign-card__header">
          <EditionStatusBadge state={state} />
          <span className="editorial-campaign-card__creator">{creator}</span>
        </div>

        <h2 className="editorial-campaign-card__title">
          <a href={href}>{title}</a>
        </h2>

        <p className="editorial-campaign-card__pitch">{pitch}</p>

        {surface === 'REVIEW' && (
          <p className="editorial-campaign-card__review-note">
            Đang lấy ý kiến cộng đồng — chưa được Resolver duyệt. Pledge chưa mở; Resolver là người quyết định.
          </p>
        )}

        <div className="editorial-campaign-card__rubric-wrap">
          <ColophonRubric
            compact
            commitmentHash={commitmentHash}
            collateralPercent={collateralPct}
            pledgedFormatted={isFunding ? safePrice(raised) : undefined}
            goalFormatted={safePrice(goal)}
            resolverVerified={state.technicalCode === 'FUNDING' || state.technicalCode === 'APPROVED'}
            stateLabel={state.label}
            creatorName={creator}
          />
        </div>

        <div className="editorial-campaign-card__tier">
          <span className="editorial-campaign-card__tier-item">1 bản số PDF độc quyền</span>
          <span className="editorial-campaign-card__tier-price">{priceFormatted}</span>
        </div>

        {isFunding && (
          <div className="editorial-campaign-card__chart">
            <EditionProgressChart pledged={raised} goal={goal} />
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
              Commitment: <code className="reward-hash">{commitmentHash}</code>
            </p>
          </details>
        )}
      </div>
    </article>
  );
}
