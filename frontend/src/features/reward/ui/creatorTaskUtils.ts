import type { RewardCampaign } from '../../../lib/api/reward';
import { getProjectedChainState } from './campaignState';

export function isCreatorActionable(campaign: RewardCampaign): boolean {
  const chainState = getProjectedChainState(campaign.projection);
  if ([0, 2, 3, 4, 5].includes(chainState ?? -1)) return chainState === 1;
  return ['DRAFT', 'FROZEN', 'CHANGES_REQUESTED', 'APPROVED'].includes(campaign.status);
}
