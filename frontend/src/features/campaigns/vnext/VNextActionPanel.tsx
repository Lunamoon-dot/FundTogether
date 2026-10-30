import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { erc20Abi } from 'viem';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import reviewArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryReview.json';
import type {
  VNextCampaignProjection,
  VNextDeployment,
  VNextBackerProjection,
  VNextMilestoneProjection,
  VNextReviewWithAssignments,
} from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';
import { VNextEvidencePanel } from './VNextEvidencePanel';
import { vnextAppealBondApprovalRequired } from './vnext-appeal-bond';
import {
  finalOutcomeLabel,
  roundVerdictLabel,
  vnextBlockedReason,
  vnextPaymentStatus,
  vnextRetryStatus,
} from './vnext-milestone-flow';

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
const MILESTONE_CORRECTION = 11;
const MILESTONE_RESUBMIT = 12;
const MILESTONE_TERMINAL = 13;
const MILESTONE_CHALLENGE_WINDOW = 9;
const campaignAbi = campaignArtifact.abi as Abi;
const reviewAbi = reviewArtifact.abi as Abi;
const tokenAbi = erc20Abi as Abi;

function tokenAmount(value: string): bigint | null {
  if (!/^[0-9]+$/.test(value) || value === '0') return null;
  try { return BigInt(value); } catch { return null; }
}

interface ActionAvailability {
  ready: boolean;
  reason?: string;
}

function GuardedAction({
  label,
  availability,
  busy,
  primary = false,
  onClick,
}: {
  label: string;
  availability: ActionAvailability;
  busy: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`button ${primary ? 'button--primary' : 'button--quiet'}`}
        disabled={busy || !availability.ready}
        onClick={onClick}
      >
        {label}
      </button>
      {!availability.ready && availability.reason ? (
        <p className="text-xs text-[var(--ink-subtle)] m-0" data-vnext-blocked-reason>{availability.reason}</p>
      ) : null}
    </div>
  );
}

function timestampLabel(value?: bigint) {
  if (!value || value === 0n) return 'Chưa thiết lập';
  return new Date(Number(value * 1_000n)).toLocaleString('vi-VN');
}

const paymentStatusLabels = {
  NOT_ELIGIBLE: 'Chưa đủ điều kiện payout',
  SETTLEMENT_PENDING: 'Judge settlement đang chờ hoàn tất',
  SYNC_PENDING: 'Final ruling chưa được đồng bộ vào milestone',
  CHALLENGE_WINDOW_OPEN: 'Challenge window đang mở',
  PAYOUT_ELIGIBLE: 'Đủ điều kiện payout on-chain',
  TRANSACTION_PENDING: 'Payout đã gửi/confirm; đang chờ MilestonePaid được index',
  PAID_INDEXED: 'PAID — canonical MilestonePaid đã được index',
  CORRECTION: 'VERDICT_FAIL — chuyển sang correction/resubmission',
  RECOVERY_REFUND: 'PROTOCOL_FAIL — recovery/refund theo state canonical',
} as const;

function VNextAppealBondActions({
  deployment,
  actionArgs,
  label,
  onRefresh,
}: {
  deployment: VNextDeployment;
  actionArgs: readonly unknown[];
  label: string;
  onRefresh: () => void;
}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const bond = useQuery({
    queryKey: ['vnext-appeal-bond', deployment.juryReview],
    enabled: Boolean(client && deployment.juryReview),
    queryFn: async () => {
      if (!client || !deployment.juryReview) throw new Error('Appeal bond client is unavailable');
      return BigInt(String(await client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'appealBond' })));
    },
    retry: false,
  });
  const allowance = useQuery({
    queryKey: ['vnext-appeal-bond-allowance', deployment.tokenAddress, deployment.juryReview, account.address],
    enabled: Boolean(client && account.address && deployment.tokenAddress && deployment.juryReview),
    queryFn: async () => {
      if (!client || !account.address || !deployment.tokenAddress || !deployment.juryReview) throw new Error('Appeal allowance client is unavailable');
      return BigInt(String(await client.readContract({
        address: deployment.tokenAddress,
        abi: tokenAbi,
        functionName: 'allowance',
        args: [account.address, deployment.juryReview],
      })));
    },
    retry: false,
  });
  const bondAmount = bond.data;
  const allowanceAmount = allowance.data;
  const approvalRequired = bondAmount !== undefined && allowanceAmount !== undefined
    ? vnextAppealBondApprovalRequired(allowanceAmount, bondAmount)
    : true;
  const appealReady = bondAmount !== undefined && allowanceAmount !== undefined && !approvalRequired;
  const appealPreflight = useQuery<ActionAvailability>({
    queryKey: ['vnext-appeal-preflight', deployment.campaignEscrow, account.address, ...actionArgs.map(String)],
    enabled: Boolean(client && account.address && deployment.campaignEscrow && appealReady),
    queryFn: async () => {
      if (!client || !account.address || !deployment.campaignEscrow) throw new Error('Appeal preflight is unavailable');
      try {
        await client.simulateContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'openAppeal',
          args: actionArgs,
          account: account.address,
        });
        return { ready: true };
      } catch (cause) {
        return { ready: false, reason: vnextBlockedReason(cause) };
      }
    },
    retry: false,
    refetchInterval: 5_000,
  });
  const refreshAppeal = () => {
    onRefresh();
    void appealPreflight.refetch();
  };
  const transaction = useVNextTransaction(refreshAppeal, refreshAppeal);
  const appealAvailability = !appealReady
    ? { ready: false, reason: 'Approve đủ appeal bond trước khi mở appeal.' }
    : appealPreflight.data ?? { ready: false, reason: 'Đang kiểm tra appeal preconditions on-chain…' };

  if (!account.address || !deployment.tokenAddress || !deployment.juryReview) return null;

  const approveAppealBond = async () => {
    if (bondAmount === undefined || !deployment.juryReview) return;
    await transaction.send('token', 'approve', [deployment.juryReview, bondAmount]);
    await allowance.refetch();
  };

  return (
    <div className="flex flex-wrap gap-2" data-vnext-action="appeal-bond">
      <span className="text-sm text-[var(--ink-subtle)]">Appeal bond: {bondAmount?.toString() ?? 'đang đọc…'} token units</span>
      {approvalRequired && <button type="button" className="button button--secondary" disabled={transaction.busy || bondAmount === undefined} onClick={() => void approveAppealBond()}>Approve appeal bond</button>}
      <GuardedAction label={label} availability={appealAvailability} busy={transaction.busy} onClick={() => void transaction.send('campaign', 'openAppeal', actionArgs)} />
      {transaction.stage !== 'idle' && <span className="text-xs text-[var(--ink-subtle)]" role="status">{vnextStageLabel(transaction.stage)}</span>}
    </div>
  );
}

export function VNextMilestoneActions({
  campaignId,
  campaign,
  milestone,
  review,
  deployment,
  userId,
  onRefresh,
}: {
  campaignId: string;
  campaign: VNextCampaignProjection;
  milestone: VNextMilestoneProjection;
  review?: VNextReviewWithAssignments;
  deployment: VNextDeployment;
  userId?: string;
  onRefresh: () => void;
}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const [evidenceHash, setEvidenceHash] = useState('');
  const campaignNumber = /^[0-9]+$/.test(campaignId) ? BigInt(campaignId) : null;
  const milestoneNumber = BigInt(milestone.milestoneId);
  const reviewCaseId = milestone.reviewCaseId as `0x${string}` | null;
  const rootCaseId = (review?.rootCaseId ?? milestone.reviewCaseId) as `0x${string}` | null;
  const creator = Boolean(account.address && account.address.toLowerCase() === campaign.creator.toLowerCase());
  const timing = useQuery({
    queryKey: ['vnext-milestone-timing', campaignId, milestone.milestoneId, deployment.campaignEscrow],
    enabled: Boolean(client && deployment.campaignEscrow && campaignNumber !== null),
    queryFn: async () => {
      if (!client || !deployment.campaignEscrow || campaignNumber === null) throw new Error('Milestone read client is unavailable');
      const [submissionDeadline, correctionDeadline, state] = await Promise.all([
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'milestoneSubmissionDeadline', args: [campaignNumber, milestoneNumber] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'milestoneCorrectionDeadline', args: [campaignNumber, milestoneNumber] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'milestoneState', args: [campaignNumber, milestoneNumber] }),
      ]);
      return {
        submissionDeadline: BigInt(submissionDeadline as bigint),
        correctionDeadline: BigInt(correctionDeadline as bigint),
        state: Number(state),
      };
    },
    retry: false,
  });
  const milestoneClock = useQuery({
    queryKey: ['vnext-milestone-chain-clock', client?.chain?.id],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error('VNext milestone chain clock is unavailable');
      return (await client.getBlock({ blockTag: 'latest' })).timestamp;
    },
    retry: false,
    staleTime: 5_000,
  });
  const milestoneChainTimestamp = milestoneClock.data;
  const submissionExpired = Boolean(milestoneChainTimestamp !== undefined && timing.data?.submissionDeadline && milestoneChainTimestamp >= timing.data.submissionDeadline);
  const correctionExpired = Boolean(milestoneChainTimestamp !== undefined && timing.data?.correctionDeadline && milestoneChainTimestamp >= timing.data.correctionDeadline);
  const settlement = useQuery({
    queryKey: ['vnext-review-settlement', reviewCaseId, rootCaseId, deployment.juryReview],
    enabled: Boolean(client && deployment.juryReview && reviewCaseId && rootCaseId),
    queryFn: async () => {
      if (!client || !deployment.juryReview || !reviewCaseId || !rootCaseId) throw new Error('Review settlement client is unavailable');
      const [outcome, phase, settled, complete, result, retries, maximumRetries, revealDeadline, appealWindowDuration, roundStatus] = await Promise.all([
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'finalOutcome', args: [reviewCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementPhase', args: [reviewCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'reviewCaseSettled', args: [reviewCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementComplete', args: [reviewCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'reviewResult', args: [reviewCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'retryCount', args: [rootCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'MAXIMUM_RETRIES_PER_REVIEW_LEVEL' }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'revealDeadline', args: [reviewCaseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'appealWindowDuration' }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'roundStatus', args: [reviewCaseId] }),
      ]);
      return {
        outcome: Number(outcome),
        phase: Number(phase),
        settled: Boolean(settled),
        complete: Boolean(complete),
        result: Number(result),
        retries: BigInt(retries as bigint),
        maximumRetries: BigInt(maximumRetries as bigint),
        appealDeadline: BigInt(revealDeadline as bigint) + BigInt(appealWindowDuration as bigint),
        roundStatus: Number(roundStatus),
      };
    },
    retry: false,
    refetchInterval: 5_000,
  });
  const settlementState = settlement.data;
  const actionPreflight = useQuery<Record<string, ActionAvailability>>({
    queryKey: [
      'vnext-milestone-action-preflight',
      campaignId,
      milestone.milestoneId,
      reviewCaseId,
      account.address,
      timing.data?.state,
      settlementState?.outcome,
      settlementState?.phase,
      settlementState?.complete,
      milestoneChainTimestamp?.toString(),
    ],
    enabled: Boolean(
      client && account.address && deployment.campaignEscrow && deployment.juryReview
      && campaignNumber !== null && reviewCaseId,
    ),
    queryFn: async () => {
      if (!client || !account.address || !deployment.campaignEscrow || !deployment.juryReview || campaignNumber === null || !reviewCaseId) {
        throw new Error('Milestone action preflight is unavailable');
      }
      const checks: Array<[string, 'campaign' | 'review', string, readonly unknown[]]> = [
        ['sync', 'campaign', 'syncFinalRuling', [campaignNumber, milestoneNumber]],
        ['finalizeNoAppeal', 'review', 'finalizeNoAppeal', [reviewCaseId]],
        ['prepareRetry', 'review', 'prepareRetrySettlement', [reviewCaseId]],
        ['settleRetry', 'review', 'settleCaseBatch', [reviewCaseId, 32n]],
        ['retry', 'campaign', 'retryMilestoneReview', [campaignNumber, milestoneNumber]],
        ['finalizeProtocolFailure', 'review', 'finalizeProtocolFailure', [reviewCaseId]],
        ['settleFinal', 'review', 'settleFinalRuling', [reviewCaseId, 32n]],
        ['pay', 'campaign', 'payMilestone', [campaignNumber, milestoneNumber]],
      ];
      const results = await Promise.all(checks.map(async ([key, kind, functionName, args]) => {
        try {
          await client.simulateContract({
            address: kind === 'campaign' ? deployment.campaignEscrow! : deployment.juryReview!,
            abi: kind === 'campaign' ? campaignAbi : reviewAbi,
            functionName,
            args,
            account: account.address,
          });
          return [key, { ready: true }] as const;
        } catch (cause) {
          return [key, { ready: false, reason: vnextBlockedReason(cause) }] as const;
        }
      }));
      return Object.fromEntries(results);
    },
    retry: false,
    refetchInterval: 5_000,
  });
  const refreshLocalState = () => {
    onRefresh();
    void Promise.all([
      timing.refetch(),
      milestoneClock.refetch(),
      settlement.refetch(),
      actionPreflight.refetch(),
    ]);
  };
  const transaction = useVNextTransaction(refreshLocalState, refreshLocalState);
  const availability = (action: string): ActionAvailability => {
    if (!account.address) return { ready: false, reason: 'Kết nối ví chain 31339 để thực hiện thao tác permissionless.' };
    if (actionPreflight.isPending) return { ready: false, reason: 'Đang kiểm tra preconditions trực tiếp từ contract…' };
    if (actionPreflight.error) return { ready: false, reason: 'Không đọc được preconditions on-chain; refresh trước khi thử lại.' };
    return actionPreflight.data?.[action] ?? { ready: false, reason: 'Thao tác chưa khả dụng ở trạng thái on-chain hiện tại.' };
  };
  const retryStatus = vnextRetryStatus(
    settlementState?.result ?? review?.roundOutcome,
    settlementState?.retries ?? 0n,
    settlementState?.maximumRetries ?? 2n,
  );
  const synchronized = settlementState?.outcome === 1
    ? timing.data?.state === MILESTONE_CHALLENGE_WINDOW || timing.data?.state === 10
    : settlementState?.outcome === 2
      ? [MILESTONE_CORRECTION, MILESTONE_RESUBMIT, MILESTONE_TERMINAL].includes(timing.data?.state ?? -1)
      : settlementState?.outcome === 3 && timing.data?.state === MILESTONE_TERMINAL;
  const challengeDeadline = milestone.challengeDeadline && /^[0-9]+$/.test(milestone.challengeDeadline)
    ? BigInt(milestone.challengeDeadline)
    : undefined;
  const currentMilestoneState = timing.data?.state ?? milestone.state;
  const canEditEvidence = creator && campaign.state === CAMPAIGN_MILESTONES_RUNNING
    && [MILESTONE_PENDING, MILESTONE_CORRECTION, MILESTONE_RESUBMIT].includes(currentMilestoneState);
  const canSubmit = canEditEvidence && /^0x[0-9a-fA-F]{64}$/.test(evidenceHash);
  const paymentStatus = vnextPaymentStatus({
    paid: milestone.paid,
    finalOutcome: settlementState?.outcome ?? milestone.finalOutcome ?? 0,
    settlementComplete: settlementState?.complete ?? false,
    synchronized,
    chainTimestamp: milestoneChainTimestamp,
    challengeDeadline,
    payoutPreflightReady: availability('pay').ready,
    transactionStage: transaction.action === 'payMilestone' ? transaction.stage : 'idle',
  });
  const nextSettlementAction = [
    ['finalizeNoAppeal', 'Finalize final ruling'],
    ['prepareRetry', 'Prepare retry settlement'],
    ['settleRetry', 'Settle retry Judge batch'],
    ['retry', 'Open bounded retry'],
    ['finalizeProtocolFailure', 'Finalize protocol failure'],
    ['settleFinal', 'Settle final ruling Judge batch'],
    ['sync', 'Synchronize milestone outcome'],
    ['pay', 'Pay milestone'],
  ].find(([action]) => availability(action).ready)?.[1];
  const nextAction = canEditEvidence
    ? canSubmit ? 'Submit evidence revision' : 'Nhập evidence hash hợp lệ để submit'
    : nextSettlementAction ?? 'Chưa có thao tác on-chain hợp lệ';

  return (
    <article className="monograph-card space-y-3" data-vnext-milestone={milestone.milestoneId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="monograph-card__kicker">SETTLEMENT & DISBURSEMENT</span>
          <h3 className="monograph-card__title">Current status: {paymentStatusLabels[paymentStatus]}</h3>
          <p className="text-sm text-[var(--ink-subtle)] m-0">Revision {milestone.evidenceRevision} · on-chain milestone state {timing.data?.state ?? 'đang đọc'}</p>
        </div>
        <button type="button" className="button button--secondary" onClick={refreshLocalState}>Refresh on-chain state</button>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3" data-vnext-settlement-status>
        <div><dt className="muted">Court result</dt><dd>{roundVerdictLabel(settlementState?.result ?? review?.roundOutcome)}</dd></div>
        <div><dt className="muted">Final ruling</dt><dd>{finalOutcomeLabel(settlementState?.outcome ?? milestone.finalOutcome)}</dd></div>
        <div><dt className="muted">Judge settlement</dt><dd>{settlementState?.outcome === 0 ? 'Chờ final ruling' : settlementState?.complete ? 'COMPLETED' : 'PENDING'}</dd></div>
        <div><dt className="muted">Milestone outcome</dt><dd>{synchronized ? 'SYNCHRONIZED ON-CHAIN' : 'SYNC PENDING'}</dd></div>
        <div><dt className="muted">Retry budget</dt><dd>{settlementState ? `${settlementState.retries}/${settlementState.maximumRetries} · ${retryStatus}` : 'Đang đọc'}</dd></div>
        <div><dt className="muted">Next available action</dt><dd>{nextAction}</dd></div>
        <div><dt className="muted">Appeal deadline</dt><dd>{timestampLabel(settlementState?.appealDeadline)}</dd></div>
        <div><dt className="muted">Challenge deadline</dt><dd>{timestampLabel(challengeDeadline)}</dd></div>
        <div><dt className="muted">Correction deadline</dt><dd>{timestampLabel(timing.data?.correctionDeadline)}</dd></div>
      </dl>

      {settlement.isPending || timing.isPending ? <p role="status" className="muted">Đang tải canonical on-chain state…</p> : null}
      {settlement.error || timing.error ? <p role="alert" className="monograph-alert monograph-alert--error">Không đọc được settlement state từ contract. Refresh trước khi gửi transaction.</p> : null}
      {retryStatus === 'RETRY_EXHAUSTED' ? <p className="monograph-alert">Retry budget đã hết; không mở thêm vòng retry. Chỉ protocol-failure terminalization hợp lệ mới được phép.</p> : null}
      {(settlementState?.outcome ?? milestone.finalOutcome) === 2 ? <p className="monograph-alert">VERDICT_FAIL là substantive failure. Creator có thể correction/resubmit trong deadline hiện có; payout luôn bị khóa.</p> : null}
      {(settlementState?.outcome ?? milestone.finalOutcome) === 3 ? <p className="monograph-alert">PROTOCOL_FAIL là lỗi vận hành phân xử, không quy kết Creator gian lận. Recovery/refund hiện tại: {campaign.state === CAMPAIGN_REFUNDING || campaign.state === CAMPAIGN_REFUNDING_REMAINDER ? 'canonical refund state đã được index' : 'đang chờ milestone sync/indexer'}.</p> : null}

      {canEditEvidence && (
        <div className="space-y-2" data-vnext-action="submitMilestoneEvidence">
          <label className="text-sm block" htmlFor={`vnext-evidence-hash-${milestone.milestoneId}`}>Evidence hash cho milestone {milestone.milestoneId}</label>
          <input id={`vnext-evidence-hash-${milestone.milestoneId}`} className="font-mono" value={evidenceHash} onChange={event => setEvidenceHash(event.target.value)} placeholder="0x + 64 hex chars" />
          <button type="button" className="button button--primary" disabled={!canSubmit || transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'submitMilestoneEvidence', [campaignNumber!, milestoneNumber, evidenceHash as `0x${string}`])}>Submit evidence revision</button>
        </div>
      )}

      {creator && milestone.reviewCaseId && <VNextEvidencePanel reviewCaseId={milestone.reviewCaseId} enabled={Boolean(userId)} />}

      {campaignNumber !== null && (
        <div className="grid gap-3 sm:grid-cols-2" data-vnext-action="milestone-timeouts">
          {currentMilestoneState === MILESTONE_PENDING && submissionExpired && <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('campaign', 'expireMilestoneSubmission', [campaignNumber, milestoneNumber])}>Expire submission deadline</button>}
          {currentMilestoneState === MILESTONE_CORRECTION && correctionExpired && <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('campaign', 'finalizeCorrectionFailure', [campaignNumber, milestoneNumber])}>Finalize correction failure</button>}
          {reviewCaseId && settlementState?.outcome === 0 && (settlementState.result === 1 || settlementState.result === 2) ? (
            <GuardedAction label="Finalize no appeal" availability={availability('finalizeNoAppeal')} busy={transaction.busy} onClick={() => void transaction.send('review', 'finalizeNoAppeal', [reviewCaseId])} />
          ) : null}
          {[MILESTONE_PROVISIONAL_RULING, MILESTONE_APPEAL_WINDOW].includes(timing.data?.state ?? milestone.state) && reviewCaseId && <>
              <VNextAppealBondActions deployment={deployment} actionArgs={[campaignNumber, milestoneNumber]} label="Open appeal" onRefresh={onRefresh} />
          </>}
          {reviewCaseId && (retryStatus === 'RETRY_ELIGIBLE' || availability('prepareRetry').ready || availability('retry').ready || Boolean(settlementState && settlementState.phase > 0 && !settlementState.settled)) && <>
            {settlementState?.phase === 0 ? <GuardedAction label="Prepare retry settlement" availability={availability('prepareRetry')} busy={transaction.busy} onClick={() => void transaction.send('review', 'prepareRetrySettlement', [reviewCaseId])} /> : null}
            {settlementState && settlementState.phase > 0 && !settlementState.settled ? <GuardedAction label="Settle retry Judge batch" availability={availability('settleRetry')} busy={transaction.busy} onClick={() => void transaction.send('review', 'settleCaseBatch', [reviewCaseId, 32n])} /> : null}
            <GuardedAction label="Open bounded retry" availability={availability('retry')} busy={transaction.busy} onClick={() => void transaction.send('campaign', 'retryMilestoneReview', [campaignNumber, milestoneNumber])} />
          </>}
          {reviewCaseId && settlementState?.outcome === 0 && (retryStatus === 'RETRY_EXHAUSTED' || availability('finalizeProtocolFailure').ready) ? <GuardedAction label="Finalize protocol failure" availability={availability('finalizeProtocolFailure')} busy={transaction.busy} onClick={() => void transaction.send('review', 'finalizeProtocolFailure', [reviewCaseId])} /> : null}
          {reviewCaseId && settlementState && settlementState.outcome !== 0 && !settlementState.complete ? <GuardedAction label="Settle final ruling Judge batch" availability={availability('settleFinal')} busy={transaction.busy} onClick={() => void transaction.send('review', 'settleFinalRuling', [reviewCaseId, 32n])} /> : null}
          {reviewCaseId && !synchronized && ([MILESTONE_REVIEW_ENROLLMENT, MILESTONE_BASE_REVIEW, MILESTONE_RETRY_PENDING, MILESTONE_PROVISIONAL_RULING, MILESTONE_APPEAL_WINDOW].includes(timing.data?.state ?? milestone.state)) ? <GuardedAction label={retryStatus === 'RETRY_ELIGIBLE' ? 'Sync retry eligibility' : 'Sync final ruling to milestone'} availability={availability('sync')} busy={transaction.busy} onClick={() => void transaction.send('campaign', 'syncFinalRuling', [campaignNumber, milestoneNumber])} /> : null}
        </div>
      )}

      {(settlementState?.outcome === 1 || milestone.finalOutcome === 1 || timing.data?.state === MILESTONE_CHALLENGE_WINDOW) && campaignNumber !== null && !milestone.paid ? (
        <div className="space-y-2" data-vnext-action="payMilestone">
          <p className="text-sm m-0">Payout là permissionless. Nút chỉ bật khi `payMilestone` simulate thành công trên chain hiện tại; backend không chuyển tiền.</p>
          <GuardedAction label={`Pay milestone ${milestone.milestoneId}`} availability={availability('pay')} busy={transaction.busy} primary onClick={() => void transaction.send('campaign', 'payMilestone', [campaignNumber, milestoneNumber])} />
        </div>
      ) : null}
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </article>
  );
}

export function VNextActionPanel({
  campaignId,
  userId,
  campaign,
  deployment,
  onRefresh,
}: {
  campaignId: string;
  userId?: string;
  campaign: VNextCampaignProjection;
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
          {publicationReview?.outcome === 2 && publicationFinalOutcome === 0 && creator && campaignNumber !== null && <>
            <VNextAppealBondActions deployment={deployment} actionArgs={[campaignNumber!, 2n ** 256n - 1n]} label="Open publication appeal" onRefresh={onRefresh} />
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
