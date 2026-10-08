import { createCampaignDraftSchema, updateCampaignDraftSchema } from './campaign-draft.schema';
const milestone = { title: 'Filter', description: 'Install filter', budgetUnits: '1000001', acceptanceCriteria: [{ criterionId: 'C1', description: 'Works' }] };
const draft = { title: 'Water', description: 'Provide water', milestones: [milestone] };
describe('campaign budget validation', () => {
  it('preserves exact integer units on create and update', () => {
    expect(createCampaignDraftSchema.parse(draft).milestones[0].budgetUnits).toBe('1000001');
    expect(updateCampaignDraftSchema.parse({ ...draft, expectedRevision: 1 }).milestones[0].budgetUnits).toBe('1000001');
  });
  it.each(['0', '-1', '1.1', 'abc', '', '01', '1e6', ((1n << 256n)).toString()])('rejects invalid units %s without throwing', (budgetUnits) => {
    expect(createCampaignDraftSchema.safeParse({ ...draft, milestones: [{ ...milestone, budgetUnits }] }).success).toBe(false);
  });
  it('rejects a sum exceeding uint256 for create and update', () => {
    const input = { ...draft, milestones: [{ ...milestone, budgetUnits: ((1n << 256n) - 1n).toString() }, milestone] };
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
    expect(updateCampaignDraftSchema.safeParse({ ...input, expectedRevision: 1 }).success).toBe(false);
  });
});
