import type { RewardCampaign } from '../../../lib/api/reward';
import type { EditionsOperationSummary } from '../../../lib/api/editions';

export function isCreatorActionable(campaign: RewardCampaign, operation?: EditionsOperationSummary): boolean {
  if (operation?.contractState !== null && operation?.contractState !== undefined) return operation.contractState === 1;
  if (campaign.status === 'APPROVED' && operation?.publicationStatus === 'ON_CHAIN_CONFIRMED') return false;
  return ['DRAFT', 'FROZEN', 'CHANGES_REQUESTED', 'COMMUNITY_REVIEW', 'APPROVED'].includes(campaign.status);
}
