import type { Campaign, OperationSummary } from '../../api/campaigns';

export function isCreatorActionable(campaign: Campaign, operation?: OperationSummary): boolean {
  if (operation?.contractState !== null && operation?.contractState !== undefined) return [1, 3].includes(operation.contractState);
  if (['APPROVED', 'PUBLISHED'].includes(campaign.status) && operation?.publicationStatus === 'ON_CHAIN_CONFIRMED') return false;
  return ['DRAFT', 'FROZEN', 'CHANGES_REQUESTED', 'COMMUNITY_REVIEW', 'APPROVED', 'PUBLISHED'].includes(campaign.status);
}
