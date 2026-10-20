import { useQuery } from '@tanstack/react-query';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';

const campaignStates = ['CREATED', 'FUNDING', 'FUNDED', 'MILESTONES_RUNNING', 'COMPLETED', 'REFUNDING'];
const milestoneStates = ['PENDING', 'SUBMITTED', 'REVIEW_ENROLLMENT', 'BASE_REVIEW', 'RETRY_PENDING', 'PROVISIONAL_RULING', 'APPEAL_WINDOW', 'FINAL_RULING', 'PAYABLE', 'CHALLENGE_WINDOW', 'PAID', 'CORRECTION', 'RESUBMIT', 'TERMINAL'];

export function VNextProtocolPage({ campaignId }: { campaignId?: string }) {
  const deployment = useQuery({ queryKey: ['vnext-deployment'], queryFn: campaignApi.vnextDeployment, retry: false });
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
      </section>

      {campaignId && campaign.error && <p role="alert" className="monograph-alert monograph-alert--error">{getErrorMessage(campaign.error)}</p>}
      {campaign.data && <>
        <section className="monograph-card space-y-3">
          <span className="monograph-card__kicker">CANONICAL PROJECTION</span>
          <h2 className="monograph-card__title">{campaignStates[campaign.data.state] ?? `STATE_${campaign.data.state}`}</h2>
          <p className="monograph-card__desc">Raised {campaign.data.raised} · Paid {campaign.data.paidOut} · Refunded {campaign.data.refunded}</p>
          <p className="text-xs font-mono break-all">Terms {campaign.data.termsHash} · last event {campaign.data.lastEventName} · block {campaign.data.lastBlockNumber}</p>
        </section>
        <section className="monograph-card space-y-3">
          <span className="monograph-card__kicker">MILESTONE REVIEW</span>
          {milestones.data?.length ? milestones.data.map(milestone => (
            <article key={milestone.milestoneId} className="border-t border-[var(--border-hairline)] pt-3">
              <strong>Milestone {milestone.milestoneId} · {milestoneStates[milestone.state] ?? `STATE_${milestone.state}`}</strong>
              <p className="text-sm text-[var(--ink-subtle)] m-0">Revision {milestone.evidenceRevision} · {milestone.paid ? 'đã payout' : 'chưa payout'}</p>
              {milestone.reviewCaseId && <code className="text-xs break-all">Review case {milestone.reviewCaseId}</code>}
            </article>
          )) : <p className="muted">Chưa có milestone projection.</p>}
        </section>
      </>}
    </div>
  );
}
