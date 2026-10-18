import { formatUnits } from 'viem';
import type { CampaignChain, CampaignPreview } from '../../api/campaigns';
import { StatusBadge } from '../ui/StatusBadge';
import type { CampaignUiState } from '../ui/campaignState';
import { ColophonRubric } from '../ui/ColophonRubric';
import type { TimelineEvent } from '../ui/Timeline';

export interface CampaignOverviewProps {
  campaign: CampaignPreview;
  chain: CampaignChain | null;
  uiState: CampaignUiState;
  timelineEvents: TimelineEvent[];
  showDetails?: boolean;
}

const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;
export function CampaignOverview({ campaign, chain, uiState, showDetails = true }: CampaignOverviewProps) {
  const state = chain?.snapshot;
  const goal = state?.goal || campaign.config.goal;
  const percent = state && goal ? Math.min(100, Number((BigInt(state.raised) * 100n) / BigInt(goal))) : 0;
  const campaignApproved = campaign.status === 'APPROVED' || campaign.status === 'PUBLISHED';

  return (
    <>
      <div className="monograph-hero monograph-hero--compact">
        <div className="monograph-hero__content">
          <div className="monograph-hero__kicker">
            <span>ẤN BẢN ĐỘC QUYỀN</span><span>·</span><span>STANDARD PDF TIER</span>
          </div>
          <h1 className="monograph-hero__title">{campaign.config.title || 'Standard PDF'}</h1>
          <p className="monograph-hero__author">Auteur / Tác giả: <strong>{campaign.creatorDisplayName}</strong></p>
          <div className="monograph-hero__pills">
            <StatusBadge state={uiState} />
            {campaignApproved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[#f0f4ee] text-[#2b5936] border border-[#d2e3d5]">✓ Resolver Verified</span>
            )}
            {state?.state === 4 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[#faeceb] text-[#9e2a2b] border border-[#e8c4c3]">⚠ Đang hoàn tiền tự động</span>
            )}
          </div>
        </div>
        <div className="monograph-hero__rubric">
          <ColophonRubric
            compact
            commitmentHash={campaign.commitmentHash}
            collateralPercent={percent}
            pledgedFormatted={state ? amount(state.raised) : undefined}
            goalFormatted={amount(campaign.config.goal)}
            resolverVerified={campaignApproved}
            stateLabel={uiState.label}
            creatorName={campaign.creatorDisplayName}
          />
        </div>
      </div>

      {showDetails && (
        <>
          <div className="monograph-card">
            <span className="monograph-card__kicker">ẤN PHẨM &amp; PHẦN THƯỞNG TIÊU CHUẨN</span>
            <h2 className="monograph-card__title">Thông tin ấn phẩm</h2>
            <p className="monograph-card__pitch">{campaign.config.tiers[0]?.benefitItems[0]?.description || campaign.config.pitch || 'Một file PDF hoàn chỉnh của truyện tranh hoặc artbook.'}</p>
            <div className="monograph-tier-spec">
              <div className="monograph-tier-spec__header">
                <span className="monograph-tier-spec__badge">STANDARD DIGITAL CAMPAIGN</span>
                <span className="monograph-tier-spec__price">{amount(campaign.config.tiers[0].price)}</span>
              </div>
              <div className="monograph-tier-spec__details">
                <div className="monograph-tier-spec__item">
                  <svg className="monograph-tier-spec__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                  <div><strong>Gói phần thưởng:</strong> {campaign.config.tiers[0]?.title || 'Standard Digital Campaign'} (Ấn bản độc quyền dành cho backer)</div>
                </div>
                <div className="monograph-tier-spec__item">
                  <svg className="monograph-tier-spec__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <div><strong>Cơ chế phân phối:</strong> Tải xuống tệp PDF hoàn chỉnh qua vé xác thực ngắn hạn sau khi Resolver duyệt phát hành.</div>
                </div>
              </div>
            </div>
          </div>

        </>
      )}
    </>
  );
}
