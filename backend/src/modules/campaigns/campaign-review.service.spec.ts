import { CampaignReviewService } from './campaign-review.service';

describe('CampaignReviewService authorization', () => {
  const hash = `0x${'1'.repeat(64)}`;
  const input = { decision: 'approve' as const, reason: 'Dossier examined and acceptable', expectedDossierHash: hash };
  const detail = { canSign: true, conflict: false, dossierHash: hash, review: null, campaign: { id: 'campaign', onchainCampaignId: '1', plan: { fundingDeadline: 2000000000 } }, checks: [{ passed: true }] };
  let projection: { reviewDetail: jest.Mock; publication: jest.Mock };
  let chain: { verifyDeployment: jest.Mock };
  let service: CampaignReviewService;
  beforeEach(() => {
    projection = { reviewDetail: jest.fn().mockResolvedValue(detail), publication: jest.fn() };
    chain = { verifyDeployment: jest.fn() };
    service = new CampaignReviewService({} as never, projection as never, chain as never, { assertCampaignOrganizer: jest.fn() } as never);
    jest.spyOn(service as unknown as { confirmed: () => Promise<unknown> }, 'confirmed').mockResolvedValue({
      snapshot: { chainState: 0, bondLocked: true, bondAmountUnits: '10', requiredBondUnits: '10' }, block: { timestamp: 1n },
    });
  });

  it('blocks self review before accessing financial state', async () => {
    projection.reviewDetail.mockResolvedValue({ ...detail, conflict: true });
    await expect(service.decide('campaign', 'reviewer', input)).rejects.toThrow('Cannot review your own');
    expect(chain.verifyDeployment).not.toHaveBeenCalled();
  });

  it('blocks changed dossier before recording a decision', async () => {
    await expect(service.decide('campaign', 'reviewer', { ...input, expectedDossierHash: `0x${'2'.repeat(64)}` })).rejects.toThrow('Dossier changed');
  });

  it('retries the same immutable decision idempotently', async () => {
    const review = { ...input, reviewerUserId: 'reviewer', dossierHash: hash };
    projection.reviewDetail.mockResolvedValue({ ...detail, review });
    await expect(service.decide('campaign', 'reviewer', input)).resolves.toEqual(review);
    expect(chain.verifyDeployment).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a rejection', async () => {
    projection.reviewDetail.mockResolvedValue({ ...detail, review: { decision: 'reject' } });
    await expect(service.decide('campaign', 'reviewer', input)).rejects.toThrow('immutable review');
  });

  it.each([null, { decision: 'request_changes', dossierHash: hash }, { decision: 'approve', dossierHash: 'changed' }])('requires matching human approval before signing (%p)', async review => {
    projection.reviewDetail.mockResolvedValue({ ...detail, review });
    await expect(service.authorizeApproval('campaign', 'reviewer')).rejects.toThrow('matching human approval');
  });

  it('returns approved dossier only after current access check', async () => {
    const approved = { ...detail, review: { decision: 'approve', dossierHash: hash } };
    projection.reviewDetail.mockResolvedValue(approved);
    await expect(service.authorizeApproval('campaign', 'reviewer')).resolves.toEqual(approved);
    expect(projection.reviewDetail).toHaveBeenCalledWith('campaign', 'reviewer');
  });

  it('propagates revoked access before approval', async () => {
    projection.reviewDetail.mockRejectedValue(new Error('role revoked'));
    await expect(service.authorizeApproval('campaign', 'reviewer')).rejects.toThrow('role revoked');
  });

  it('does not sign a saved approval when the deadline/system checks have failed', async () => {
    projection.reviewDetail.mockResolvedValue({ ...detail, campaign: { ...detail.campaign, state: 'DRAFT' }, checks: [{ passed: false }], review: { decision: 'approve', dossierHash: hash } });
    await expect(service.authorizeApproval('campaign', 'reviewer')).rejects.toThrow('System checks no longer pass');
  });
});
