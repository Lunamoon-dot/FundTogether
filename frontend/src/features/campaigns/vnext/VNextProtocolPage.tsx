import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { VNextActionPanel, VNextMilestoneActions } from './VNextActionPanel';
import { VNextCreateCampaignPanel } from './VNextCreateCampaignPanel';
import { VNextCourtDashboard } from './VNextCourtDashboard';
import { VNextRefundDashboard } from './VNextRefundDashboard';
import { displayVNextTokenAmount } from './vnext-refund-flow';

const campaignStates = ['CREATED', 'FUNDING', 'FUNDED', 'MILESTONES_RUNNING', 'COMPLETED', 'REFUNDING', 'REFUNDING_REMAINDER', 'REFUND_SETTLED'];
const milestoneStates = ['PENDING', 'SUBMITTED', 'REVIEW_ENROLLMENT', 'BASE_REVIEW', 'RETRY_PENDING', 'PROVISIONAL_RULING', 'APPEAL_WINDOW', 'FINAL_RULING', 'PAYABLE', 'CHALLENGE_WINDOW', 'PAID', 'CORRECTION', 'RESUBMIT', 'TERMINAL'];

export function VNextProtocolPage({ campaignId }: { campaignId?: string }) {
  const { session } = useAccountSession();
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const deployment = useQuery({ queryKey: ['vnext-deployment'], queryFn: campaignApi.vnextDeployment, retry: false });
  const indexer = useQuery({ queryKey: ['vnext-indexer'], queryFn: ({ signal }) => campaignApi.vnextIndexer(signal), retry: false });
  const campaign = useQuery({
    queryKey: ['vnext-campaign', campaignId],
    queryFn: ({ signal }) => campaignApi.vnextCampaign(campaignId!, signal),
    enabled: Boolean(campaignId),
    retry: false,
  });
  const milestones = useQuery({
    queryKey: ['vnext-milestones', campaignId],
    queryFn: ({ signal }) => campaignApi.vnextMilestones(campaignId!, signal),
    enabled: Boolean(campaignId),
    retry: false,
  });
  const reviews = useQuery({
    queryKey: ['vnext-reviews', deployment.data?.juryReview],
    queryFn: ({ signal }) => campaignApi.vnextReviews(signal),
    enabled: Boolean(campaignId && deployment.data?.configured),
    retry: false,
  });
  const selectedMilestone = milestones.data?.find(milestone => milestone.milestoneId === selectedMilestoneId);
  const selectedReview = selectedMilestone?.reviewCaseId
    ? reviews.data?.find(review => review.reviewCaseId.toLowerCase() === selectedMilestone.reviewCaseId?.toLowerCase())
    : undefined;
  const refreshCampaign = () => {
    void Promise.all([
      indexer.refetch(),
      campaign.refetch(),
      milestones.refetch(),
      reviews.refetch(),
    ]);
  };

  return (
    <div className="campaign-container space-y-4">
      <section className="panel space-y-3">
        <span className="campaign-eyebrow">FUNDTOGETHER VNEXT · PURE DECENTRALIZED</span>
        <h1>{campaignId ? `Campaign #${campaignId}` : 'Protocol VNext'}</h1>
        <p className="muted">Financial truth nằm ở CampaignEscrowVNext/Jury contracts. API này chỉ hiển thị indexed projection; không có Resolver/Admin override.</p>
        {deployment.data?.configured ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="muted">Chain</dt><dd>31339 · MockUSDC</dd></div>
            <div><dt className="muted">Policy</dt><dd className="font-mono break-all">{deployment.data.policyHash}</dd></div>
            <div><dt className="muted">Campaign escrow</dt><dd className="font-mono break-all">{deployment.data.campaignEscrow}</dd></div>
            <div><dt className="muted">Review engine</dt><dd className="font-mono break-all">{deployment.data.juryReview}</dd></div>
          </dl>
        ) : deployment.isPending ? <p role="status" className="muted">Đang kiểm tra deployment VNext…</p> : <p className="monograph-alert monograph-alert--error">Chưa có manifest/deployment VNext local.</p>}
        {indexer.data?.configured && <p className="text-xs text-[var(--ink-subtle)] m-0" data-vnext-read="indexer-status">
          Indexer {indexer.data.status} · checkpoint {indexer.data.lastBlock ?? 'chưa có'} / head {indexer.data.headBlock ?? 'chưa có'} · lag {indexer.data.lagBlocks ?? 'chưa biết'} block.
        </p>}
        {indexer.data?.error && <p role="alert" className="text-xs text-[var(--danger)] m-0">Indexer error: {indexer.data.error}</p>}
      </section>

      {campaignId && campaign.error && <p role="alert" className="monograph-alert monograph-alert--error">{getErrorMessage(campaign.error)}</p>}
      {campaignId && reviews.error && <p role="alert" className="monograph-alert monograph-alert--error">Không tải được Court projection: {getErrorMessage(reviews.error)}</p>}
      {!campaignId && deployment.data?.configured && <VNextCreateCampaignPanel deployment={deployment.data} />}
      {campaign.data && <>
        <section className="monograph-card space-y-3">
          <span className="monograph-card__kicker">CANONICAL PROJECTION</span>
          <h2 className="monograph-card__title">{campaignStates[campaign.data.state] ?? `STATE_${campaign.data.state}`}</h2>
          <p className="monograph-card__desc">
            Raised {displayVNextTokenAmount(campaign.data.raised, deployment.data?.tokenDecimals)} · Paid {displayVNextTokenAmount(campaign.data.paidOut, deployment.data?.tokenDecimals)} · Refunded {displayVNextTokenAmount(campaign.data.refunded, deployment.data?.tokenDecimals)}
          </p>
          <p className="text-xs font-mono break-all">Terms {campaign.data.termsHash} · last event {campaign.data.lastEventName} · block {campaign.data.lastBlockNumber}</p>
        </section>
        {deployment.data?.configured && campaignId && (
          <VNextRefundDashboard
            campaignId={campaignId}
            userId={session?.userId}
            campaign={campaign.data}
            deployment={deployment.data}
            onRefresh={refreshCampaign}
          />
        )}
        <section className="monograph-card space-y-3">
          <span className="monograph-card__kicker">MILESTONE REVIEW</span>
          {milestones.isPending ? <p className="muted" role="status">Đang tải milestone projection…</p> : milestones.data?.length ? milestones.data.map(milestone => (
            <article key={milestone.milestoneId} className="border-t border-[var(--border-hairline)] pt-3">
              <strong>Milestone {milestone.milestoneId} · {milestoneStates[milestone.state] ?? `STATE_${milestone.state}`}</strong>
              <p className="text-sm text-[var(--ink-subtle)] m-0">Revision {milestone.evidenceRevision} · {milestone.paid ? 'đã payout' : 'chưa payout'}</p>
              {milestone.reviewCaseId && <code className="text-xs break-all">Review case {milestone.reviewCaseId}</code>}
              <div className="mt-2">
                <button
                  type="button"
                  className="button button--secondary"
                  aria-expanded={selectedMilestoneId === milestone.milestoneId}
                  onClick={() => setSelectedMilestoneId(current => current === milestone.milestoneId ? null : milestone.milestoneId)}
                >
                  {selectedMilestoneId === milestone.milestoneId ? 'Đóng Milestone Dashboard' : 'Mở Milestone Dashboard'}
                </button>
              </div>
            </article>
          )) : <p className="muted">Chưa có milestone projection.</p>}
        </section>
        {selectedMilestone && deployment.data?.configured ? (
          reviews.isPending ? (
            <p role="status" className="muted">Đang tải Court Dashboard…</p>
          ) : (
            <VNextCourtDashboard
              campaignId={campaignId!}
              milestone={selectedMilestone}
              review={selectedReview}
              indexer={indexer.data}
              payoutWallet={campaign.data.payoutWallet}
              onRefresh={refreshCampaign}
            >
              <VNextMilestoneActions
                campaignId={campaignId!}
                campaign={campaign.data}
                milestone={selectedMilestone}
                review={selectedReview}
                deployment={deployment.data}
                userId={session?.userId}
                onRefresh={refreshCampaign}
              />
            </VNextCourtDashboard>
          )
        ) : null}
        {deployment.data?.configured && campaignId && campaign.data && (
          <VNextActionPanel
            campaignId={campaignId!}
            userId={session?.userId}
            campaign={campaign.data}
            deployment={deployment.data}
            onRefresh={refreshCampaign}
          />
        )}
      </>}
    </div>
  );
}
