import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import reviewArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryReview.json';
import type {
  VNextCampaignProjection,
  VNextDeployment,
  VNextBackerProjection,
  VNextMilestoneProjection,
} from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';
import { VNextEvidencePanel } from './VNextEvidencePanel';

const CAMPAIGN_FUNDING = 1;
const CAMPAIGN_MILESTONES_RUNNING = 3;
const CAMPAIGN_REFUNDING = 5;
const CAMPAIGN_REFUNDING_REMAINDER = 6;
const MILESTONE_PENDING = 0;
const MILESTONE_REVIEW_ENROLLMENT = 2;
const MILESTONE_BASE_REVIEW = 3;
const MILESTONE_RETRY_PENDING = 4;
const MILESTONE_PROVISIONAL_RULING = 5;
const MILESTONE_APPEAL_WINDOW = 6;
const MILESTONE_CORRECTION = 12;
const MILESTONE_RESUBMIT = 13;
const MILESTONE_PAYABLE = 8;
const campaignAbi = campaignArtifact.abi as Abi;
const reviewAbi = reviewArtifact.abi as Abi;

function tokenAmount(value: string): bigint | null {
  if (!/^[0-9]+$/.test(value) || value === '0') return null;
  try { return BigInt(value); } catch { return null; }
}

function VNextMilestoneActions({
  campaignId,
  campaign,
  milestone,
  deployment,
  creator,
  userId,
  onRefresh,
}: {
  campaignId: string;
  campaign: VNextCampaignProjection;
  milestone: VNextMilestoneProjection;
  deployment: VNextDeployment;
  creator: boolean;
  userId?: string;
  onRefresh: () => void;
}) {
  const transaction = useVNextTransaction(onRefresh);
  const client = usePublicClient({ chainId: 31339 });
  const [evidenceHash, setEvidenceHash] = useState('');
  const campaignNumber = /^[0-9]+$/.test(campaignId) ? BigInt(campaignId) : null;
  const milestoneNumber = BigInt(milestone.milestoneId);
  const timing = useQuery({
    queryKey: ['vnext-milestone-timing', campaignId, milestone.milestoneId, deployment.campaignEscrow],
    enabled: Boolean(client && deployment.campaignEscrow && campaignNumber !== null),
    queryFn: async () => {
      if (!client || !deployment.campaignEscrow || campaignNumber === null) throw new Error('Milestone read client is unavailable');
      const [submissionDeadline, correctionDeadline] = await Promise.all([
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'milestoneSubmissionDeadline', args: [campaignNumber, milestoneNumber] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'milestoneCorrectionDeadline', args: [campaignNumber, milestoneNumber] }),
      ]);
      return { submissionDeadline: BigInt(submissionDeadline as bigint), correctionDeadline: BigInt(correctionDeadline as bigint) };
    },
    retry: false,
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  const submissionExpired = Boolean(timing.data?.submissionDeadline && now >= timing.data.submissionDeadline);
  const correctionExpired = Boolean(timing.data?.correctionDeadline && now >= timing.data.correctionDeadline);
  const settlement = useQuery({
    queryKey: ['vnext-review-settlement', milestone.reviewCaseId, deployment.juryReview],
    enabled: Boolean(client && deployment.juryReview && milestone.reviewCaseId),
    queryFn: async () => {
      if (!client || !deployment.juryReview || !milestone.reviewCaseId) throw new Error('Review settlement client is unavailable');
      const [outcome, phase, settled, complete] = await Promise.all([
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'finalOutcome', args: [milestone.reviewCaseId as `0x${string}`] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementPhase', args: [milestone.reviewCaseId as `0x${string}`] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'reviewCaseSettled', args: [milestone.reviewCaseId as `0x${string}`] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementComplete', args: [milestone.reviewCaseId as `0x${string}`] }),
      ]);
      return { outcome: Number(outcome), phase: Number(phase), settled: Boolean(settled), complete: Boolean(complete) };
    },
    retry: false,
  });
  const settlementState = settlement.data;
  const canEditEvidence = creator && campaign.state === CAMPAIGN_MILESTONES_RUNNING
    && [MILESTONE_PENDING, MILESTONE_CORRECTION, MILESTONE_RESUBMIT].includes(milestone.state);
  const canSubmit = canEditEvidence && /^0x[0-9a-fA-F]{64}$/.test(evidenceHash);

  return (
    <article className="monograph-card space-y-3" data-vnext-milestone={milestone.milestoneId}>
      <div>
        <span className="monograph-card__kicker">MILESTONE {milestone.milestoneId}</span>
        <p className="text-sm text-[var(--ink-subtle)] m-0">State {milestone.state} · revision {milestone.evidenceRevision} · {milestone.paid ? 'đã payout' : 'chưa payout'}</p>
      </div>

      {canEditEvidence && (
        <div className="space-y-2" data-vnext-action="submitMilestoneEvidence">
          <label className="text-sm block" htmlFor={`vnext-evidence-hash-${milestone.milestoneId}`}>Evidence hash cho milestone {milestone.milestoneId}</label>
          <input id={`vnext-evidence-hash-${milestone.milestoneId}`} className="font-mono" value={evidenceHash} onChange={event => setEvidenceHash(event.target.value)} placeholder="0x + 64 hex chars" />
          <button type="button" className="button button--primary" disabled={!canSubmit || transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'submitMilestoneEvidence', [campaignNumber!, milestoneNumber, evidenceHash as `0x${string}`])}>Submit evidence revision</button>
        </div>
      )}

      {creator && milestone.reviewCaseId && <VNextEvidencePanel reviewCaseId={milestone.reviewCaseId} enabled={Boolean(userId)} />}

      {campaignNumber !== null && (
        <div className="flex flex-wrap gap-2" data-vnext-action="milestone-timeouts">
          {milestone.state === MILESTONE_PENDING && submissionExpired && <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('campaign', 'expireMilestoneSubmission', [campaignNumber, milestoneNumber])}>Expire submission deadline</button>}
          {milestone.state === MILESTONE_CORRECTION && correctionExpired && <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('campaign', 'finalizeCorrectionFailure', [campaignNumber, milestoneNumber])}>Finalize correction failure</button>}
          {[MILESTONE_REVIEW_ENROLLMENT, MILESTONE_BASE_REVIEW, MILESTONE_PROVISIONAL_RULING, MILESTONE_APPEAL_WINDOW].includes(milestone.state) && milestone.reviewCaseId && <>
            <button type="button" className="button button--quiet" disabled={transaction.busy || Boolean(settlementState?.outcome && settlementState.outcome !== 0 && !settlementState.complete)} onClick={() => void transaction.send('campaign', 'syncFinalRuling', [campaignNumber, milestoneNumber])}>Sync final ruling</button>
            {[MILESTONE_PROVISIONAL_RULING, MILESTONE_APPEAL_WINDOW].includes(milestone.state) && <>
              <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('campaign', 'openAppeal', [campaignNumber, milestoneNumber])}>Open appeal</button>
              <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'finalizeNoAppeal', [milestone.reviewCaseId as `0x${string}`])}>Finalize no appeal</button>
            </>}
          </>}
          {milestone.state === MILESTONE_RETRY_PENDING && milestone.reviewCaseId && <>
            {settlementState?.phase === 0 && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'prepareRetrySettlement', [milestone.reviewCaseId as `0x${string}`])}>Prepare retry settlement</button>}
            {settlementState && settlementState.phase > 0 && !settlementState.settled && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'settleCaseBatch', [milestone.reviewCaseId as `0x${string}`, 32n])}>Settle retry batch</button>}
            <button type="button" className="button button--quiet" disabled={transaction.busy || !settlementState?.settled} onClick={() => void transaction.send('campaign', 'retryMilestoneReview', [campaignNumber, milestoneNumber])}>Retry review</button>
            <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'finalizeProtocolFailure', [milestone.reviewCaseId as `0x${string}`])}>Finalize protocol failure</button>
          </>}
          {settlementState && settlementState.outcome !== 0 && !settlementState.complete && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'settleFinalRuling', [milestone.reviewCaseId as `0x${string}`, 32n])}>Settle final ruling batch</button>}
        </div>
      )}

      {milestone.state === MILESTONE_PAYABLE && campaignNumber !== null && <button type="button" className="button button--primary" disabled={transaction.busy} onClick={() => void transaction.send('campaign', 'payMilestone', [campaignNumber, milestoneNumber])}>Payout milestone {milestone.milestoneId}</button>}
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </article>
  );
}

export function VNextActionPanel({
  campaignId,
  userId,
  campaign,
  milestones,
  deployment,
  onRefresh,
}: {
  campaignId: string;
  userId?: string;
  campaign: VNextCampaignProjection;
  milestones: VNextMilestoneProjection[];
  deployment: VNextDeployment;
  onRefresh: () => void;
}) {
  const transaction = useVNextTransaction(onRefresh);
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const [amount, setAmount] = useState('');
  const creator = Boolean(transaction.address && transaction.address.toLowerCase() === campaign.creator.toLowerCase());
  const amountValue = tokenAmount(amount);
  const fundingClock = useQuery({
    queryKey: ['vnext-funding-chain-clock', client?.chain?.id],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error('VNext chain clock is unavailable');
      return (await client.getBlock({ blockTag: 'latest' })).timestamp;
    },
    retry: false,
    staleTime: 5_000,
  });
  const fundingChainTimestamp = fundingClock.data;
  const fundingEnded = fundingChainTimestamp !== undefined
    && fundingChainTimestamp >= BigInt(campaign.fundingDeadline);
  const campaignNumber = /^[0-9]+$/.test(campaignId) ? BigInt(campaignId) : null;
  const reviews = useQuery({
    queryKey: ['vnext-reviews', deployment.juryReview],
    queryFn: ({ signal }) => campaignApi.vnextReviews(signal),
    enabled: Boolean(deployment.juryReview),
    retry: false,
  });
  const publicationReview = reviews.data?.find(review => review.reviewCaseId.toLowerCase() === campaign.publicationReviewCaseId?.toLowerCase());
  const publicationFinality = useQuery({
    queryKey: ['vnext-publication-finality', campaignId, campaign.publicationReviewCaseId, deployment.juryReview],
    enabled: Boolean(client && deployment.juryReview && campaign.publicationReviewCaseId),
    queryFn: async () => {
      if (!client || !deployment.juryReview || !campaign.publicationReviewCaseId) throw new Error('Publication review client is unavailable');
      const outcome = await client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'finalOutcome', args: [campaign.publicationReviewCaseId as `0x${string}`] });
      return Number(outcome);
    },
    retry: false,
  });
  const publicationSettlement = useQuery({
    queryKey: ['vnext-publication-settlement', campaign.publicationReviewCaseId, deployment.juryReview],
    enabled: Boolean(client && deployment.juryReview && campaign.publicationReviewCaseId),
    queryFn: async () => {
      if (!client || !deployment.juryReview || !campaign.publicationReviewCaseId) throw new Error('Publication settlement client is unavailable');
      const [phase, settled, complete] = await Promise.all([
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementPhase', args: [campaign.publicationReviewCaseId as `0x${string}`] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'reviewCaseSettled', args: [campaign.publicationReviewCaseId as `0x${string}`] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementComplete', args: [campaign.publicationReviewCaseId as `0x${string}`] }),
      ]);
      return { phase: Number(phase), settled: Boolean(settled), complete: Boolean(complete) };
    },
    retry: false,
  });
  const publicationFinalOutcome = publicationFinality.data ?? (campaign.publicationOutcome && campaign.publicationOutcome !== 0 ? campaign.publicationOutcome : 0);
  const backerPosition = useQuery({
    queryKey: ['vnext-backer-position', campaignId, account.address, deployment.campaignEscrow],
    enabled: Boolean(client && account.address && deployment.campaignEscrow && campaignNumber !== null),
    queryFn: async () => {
      if (!client || !account.address || !deployment.campaignEscrow) throw new Error('Backer read client is unavailable');
      if (campaignNumber === null) throw new Error('Campaign ID không hợp lệ');
      const [contribution, entitlement, claimed, allocationsFrozen] = await Promise.all([
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'contributionOf', args: [campaignNumber, account.address] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'refundEntitlement', args: [campaignNumber, account.address] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'refundClaimed', args: [campaignNumber, account.address] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'refundAllocationsFrozen', args: [campaignNumber] }),
      ]);
      return { contribution: BigInt(contribution as bigint), entitlement: BigInt(entitlement as bigint), claimed: Boolean(claimed), allocationsFrozen: Boolean(allocationsFrozen) };
    },
    retry: false,
  });
  const indexedBackerPosition = useQuery<VNextBackerProjection[]>({
    queryKey: ['vnext-indexed-backer-position', campaignId, account.address],
    queryFn: ({ signal }) => campaignApi.vnextBackerPosition(campaignId, signal),
    enabled: Boolean(userId && account.address),
    retry: false,
  });

  const sendContribution = () => {
    if (!amountValue || !deployment.campaignEscrow || campaignNumber === null) return;
    void transaction.send('campaign', 'contribute', [campaignNumber, amountValue]);
  };

  const approveContribution = () => {
    if (!amountValue || !deployment.campaignEscrow) return;
    void transaction.send('token', 'approve', [deployment.campaignEscrow, amountValue]);
  };

  return (
    <section className="monograph-card space-y-3" aria-labelledby="vnext-actions-title">
      <span className="monograph-card__kicker">PERMISSIONLESS ACTIONS</span>
      <h2 id="vnext-actions-title" className="monograph-card__title">Thao tác on-chain</h2>
      <p className="text-sm text-[var(--ink-subtle)] m-0">Mọi nút dưới đây gọi trực tiếp contract VNext. Backend chỉ xác nhận receipt và indexed event.</p>

      {campaign.state === 0 && campaign.publicationReviewCaseId && (
        <div className="space-y-2" data-vnext-action="publication-review">
          <p className="text-sm text-[var(--ink-subtle)] m-0">Publication case {publicationReview?.outcome == null ? 'đang chờ canonical review outcome' : `đã có court result ${publicationReview.outcome}`}. Chỉ final ruling từ review contract mới mở funding.</p>
          {publicationReview?.outcome === 1 && publicationFinalOutcome === 0 && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'finalizeNoAppeal', [campaign.publicationReviewCaseId as `0x${string}`])}>Finalize publication review</button>}
          {publicationReview?.outcome === 2 && publicationFinalOutcome === 0 && creator && <>
            <button type="button" className="button button--quiet" disabled={transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'openAppeal', [campaignNumber!, 2n ** 256n - 1n])}>Open publication appeal</button>
            <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'finalizeNoAppeal', [campaign.publicationReviewCaseId as `0x${string}`])}>Finalize publication review</button>
          </>}
          {(publicationReview?.outcome === 3 || publicationReview?.outcome === 4) && publicationFinalOutcome === 0 && <>
            {publicationSettlement.data?.phase === 0 && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'prepareRetrySettlement', [campaign.publicationReviewCaseId as `0x${string}`])}>Prepare publication retry settlement</button>}
            {publicationSettlement.data && publicationSettlement.data.phase > 0 && !publicationSettlement.data.settled && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'settleCaseBatch', [campaign.publicationReviewCaseId as `0x${string}`, 32n])}>Settle publication retry batch</button>}
            <button type="button" className="button button--quiet" disabled={transaction.busy || campaignNumber === null || !publicationSettlement.data?.settled} onClick={() => void transaction.send('campaign', 'retryPublication', [campaignNumber!])}>Retry publication review</button>
          </>}
          {publicationFinalOutcome !== 0 && <p className="text-sm text-[var(--ink-subtle)] m-0">Final publication outcome {publicationFinalOutcome} đã được ghi nhận bởi review contract.</p>}
        </div>
      )}

      {campaign.state === 0 && publicationFinalOutcome !== 0 && publicationSettlement.data && !publicationSettlement.data.complete && (
        <div data-vnext-action="settle-publication">
          <p className="text-sm text-[var(--ink-subtle)] m-0">Final ruling đã tồn tại nhưng stake settlement chưa hoàn tất.</p>
          <button type="button" className="button button--primary" disabled={transaction.busy || !campaign.publicationReviewCaseId} onClick={() => void transaction.send('review', 'settleFinalRuling', [campaign.publicationReviewCaseId as `0x${string}`, 32n])}>Settle publication ruling batch</button>
        </div>
      )}

      {campaign.state === 0 && publicationFinalOutcome !== 0 && publicationSettlement.data?.complete && (
        <div data-vnext-action="finalizePublication">
          <p className="text-sm text-[var(--ink-subtle)] m-0">Publication review đã có final outcome; bất kỳ caller nào cũng có thể materialize state tiếp theo từ contract.</p>
          <button type="button" className="button button--primary" disabled={transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'finalizePublication', [campaignNumber!])}>Finalize publication</button>
        </div>
      )}

      {campaign.state === CAMPAIGN_FUNDING && (
        <div className="space-y-2" data-vnext-action="contribute">
          <label className="text-sm block" htmlFor="vnext-contribution-amount">Góp vốn (MockUSDC, 6 decimals)</label>
          <input id="vnext-contribution-amount" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} placeholder="10000000 = 10 MockUSDC" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button--secondary" disabled={!amountValue || transaction.busy} onClick={approveContribution}>Approve MockUSDC</button>
            <button type="button" className="button button--primary" disabled={!amountValue || transaction.busy} onClick={sendContribution}>Góp vốn</button>
          </div>
          {!amountValue && amount && <p className="text-sm text-[var(--danger)] m-0">Chỉ nhập số nguyên token unit, lớn hơn 0.</p>}
        </div>
      )}

      {account.address && backerPosition.data && (
        <div className="text-sm text-[var(--ink-subtle)]" data-vnext-read="backer-position">
          Wallet hiện tại đã góp {backerPosition.data.contribution.toString()} token units; entitlement refund đọc từ contract là {backerPosition.data.entitlement.toString()}.
        </div>
      )}
      {indexedBackerPosition.data?.[0] && (
        <p className="text-xs text-[var(--ink-subtle)] m-0" data-vnext-read="indexed-backer-position">
          Contract position: contribution {indexedBackerPosition.data[0].contributed}, refund entitlement {indexedBackerPosition.data[0].refundEntitlement}, claimed {indexedBackerPosition.data[0].refundClaimed ? 'yes' : 'no'}; indexed projection ghi nhận contribution {indexedBackerPosition.data[0].indexedContributed} và refund {indexedBackerPosition.data[0].indexedRefunded} ở block {indexedBackerPosition.data[0].lastBlockNumber}.
        </p>
      )}

      {campaign.state === CAMPAIGN_FUNDING && (
        <div data-vnext-action="finalizeFunding">
          <button type="button" className="button button--secondary" disabled={!fundingEnded || transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'finalizeFunding', [campaignNumber!])}>Chốt funding sau deadline</button>
          {!fundingEnded && <p className="text-sm text-[var(--ink-subtle)] m-0">Funding chỉ đóng khi thời gian funding hết hạn.</p>}
        </div>
      )}

      {creator && campaign.publicationReviewCaseId && <VNextEvidencePanel reviewCaseId={campaign.publicationReviewCaseId} enabled={Boolean(userId)} />}
      {campaign.state === CAMPAIGN_MILESTONES_RUNNING && milestones.map(milestone => (
        <VNextMilestoneActions
          key={milestone.milestoneId}
          campaignId={campaignId}
          campaign={campaign}
          milestone={milestone}
          deployment={deployment}
          creator={creator}
          userId={userId}
          onRefresh={onRefresh}
        />
      ))}

      {(campaign.state === CAMPAIGN_REFUNDING || campaign.state === CAMPAIGN_REFUNDING_REMAINDER) && (
        <div className="flex flex-wrap gap-2" data-vnext-action="claimRefund">
          <button type="button" className="button button--secondary" disabled={transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'freezeRefundAllocations', [campaignNumber!, 50n])}>Chuẩn bị entitlement refund</button>
          <button type="button" className="button button--primary" disabled={transaction.busy || campaignNumber === null || !backerPosition.data?.allocationsFrozen || backerPosition.data.claimed || backerPosition.data.contribution === 0n} onClick={() => void transaction.send('campaign', 'claimRefund', [campaignNumber!])}>Claim refund</button>
        </div>
      )}

      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </section>
  );
}
