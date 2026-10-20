import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { encodeAbiParameters, keccak256 } from 'viem';
import type { Abi } from 'viem';
import { usePublicClient } from 'wagmi';
import reviewArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryReview.json';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { campaignApi, type VNextDeployment, type VNextReviewWithAssignments } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';
import { VNextEvidencePanel } from './VNextEvidencePanel';

const reviewAbi = reviewArtifact.abi as Abi;
const campaignAbi = campaignArtifact.abi as Abi;
const ZERO_HASH = `0x${'0'.repeat(64)}` as `0x${string}`;
const ROUND_ENROLLMENT_OPEN = 0;
const ROUND_ASSIGNMENT_PENDING = 2;
const ROUND_VOTING = 3;

function validBytes32(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function voteNumber(vote: 'PASS' | 'FAIL') {
  return vote === 'PASS' ? 1n : 2n;
}

function makeCommitment(
  review: VNextReviewWithAssignments,
  courtId: bigint,
  judge: `0x${string}`,
  caseNumber: bigint,
  protocolVersion: bigint,
  vote: 'PASS' | 'FAIL',
  salt: `0x${string}`,
) {
  return keccak256(encodeAbiParameters(
    [
      { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
      { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
      { type: 'address' }, { type: 'uint8' }, { type: 'bytes32' },
    ],
    [
      31339n,
      protocolVersion,
      BigInt(review.campaignId),
      BigInt(review.milestoneId),
      BigInt(review.evidenceRevision),
      caseNumber,
      BigInt(review.roundId),
      courtId,
      judge,
      Number(voteNumber(vote)),
      salt,
    ],
  ));
}

function JudgeStakePanel({ deployment }: { deployment: VNextDeployment }) {
  const transaction = useVNextTransaction();
  const [amount, setAmount] = useState('');
  const amountValue = /^[0-9]+$/.test(amount) && amount !== '0' ? BigInt(amount) : null;
  if (!deployment.juryRegistry) return null;
  return (
    <section className="monograph-card space-y-3" aria-labelledby="vnext-judge-stake-title">
      <span className="monograph-card__kicker">JUDGE STAKE</span>
      <h2 id="vnext-judge-stake-title" className="monograph-card__title">Stake và nghĩa vụ review</h2>
      <p className="text-sm text-[var(--ink-subtle)] m-0">Stake dùng riêng cho Judge Registry; không phải contribution escrow của campaign.</p>
      <input inputMode="numeric" aria-label="Judge stake amount" value={amount} onChange={event => setAmount(event.target.value)} placeholder="10000000 = 10 MockUSDC" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button--secondary" disabled={!amountValue || transaction.busy} onClick={() => void transaction.send('token', 'approve', [deployment.juryRegistry, amountValue!])}>Approve token cho Registry</button>
        <button type="button" className="button button--primary" disabled={!amountValue || transaction.busy} onClick={() => void transaction.send('registry', 'depositStake', [amountValue!])}>Deposit stake</button>
        <button type="button" className="button button--secondary" disabled={!amountValue || transaction.busy} onClick={() => void transaction.send('registry', 'withdrawStake', [amountValue!])}>Withdraw available stake</button>
      </div>
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </section>
  );
}

function JudgeReviewCard({
  review,
  deployment,
  onRefresh,
}: {
  review: VNextReviewWithAssignments;
  deployment: VNextDeployment;
  onRefresh: () => void;
}) {
  const client = usePublicClient({ chainId: 31339 });
  const transaction = useVNextTransaction(onRefresh);
  const [vote, setVote] = useState<'PASS' | 'FAIL'>('PASS');
  const [salt, setSalt] = useState('');
  const currentAssignment = review.assignments.find(item => item.judgeAddress.toLowerCase() === transaction.address?.toLowerCase());
  const courtId = currentAssignment ? BigInt(currentAssignment.courtId) : 0n;
  const caseId = review.reviewCaseId as `0x${string}`;
  const meta = useQuery({
    queryKey: ['vnext-judge-case-meta', review.reviewCaseId, transaction.address, currentAssignment?.courtId],
    enabled: Boolean(client && deployment.juryReview && deployment.campaignEscrow && transaction.address),
    queryFn: async () => {
      if (!client || !deployment.juryReview || !deployment.campaignEscrow || !transaction.address) throw new Error('VNext review client is unavailable');
      const [caseNumber, protocolVersion, requiredCaseStake, commitment, revealed, roundStatus, enrollmentDeadline, commitDeadline, revealDeadline, snapshotFinalized, courtAssigned, courtFinalized, contribution] = await Promise.all([
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'caseNumber', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'protocolVersion' }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'requiredCaseStake', args: [caseId] }),
        currentAssignment ? client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'commitments', args: [caseId, courtId, transaction.address] }) : ZERO_HASH,
        currentAssignment ? client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'revealed', args: [caseId, courtId, transaction.address] }) : false,
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'roundStatus', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'enrollmentDeadline', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'commitDeadline', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'revealDeadline', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'snapshotFinalized', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'courtAssigned', args: [caseId, courtId] }),
        currentAssignment ? client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'courtFinalized', args: [caseId, courtId] }) : false,
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'contributionOf', args: [BigInt(review.campaignId), transaction.address] }),
      ]);
      return {
        caseNumber: BigInt(caseNumber as bigint), protocolVersion: BigInt(protocolVersion as bigint), requiredCaseStake: BigInt(requiredCaseStake as bigint),
        commitment: commitment as `0x${string}`, revealed: Boolean(revealed), roundStatus: Number(roundStatus),
        enrollmentDeadline: BigInt(enrollmentDeadline as bigint), commitDeadline: BigInt(commitDeadline as bigint), revealDeadline: BigInt(revealDeadline as bigint),
        snapshotFinalized: Boolean(snapshotFinalized), courtAssigned: Boolean(courtAssigned), courtFinalized: Boolean(courtFinalized),
        contribution: BigInt(contribution as bigint),
      };
    },
    retry: false,
  });
  const evidence = useQuery({
    queryKey: ['vnext-judge-case-evidence', review.reviewCaseId, transaction.address],
    queryFn: ({ signal }) => campaignApi.vnextEvidence(review.reviewCaseId, signal),
    enabled: Boolean(currentAssignment && transaction.address),
    retry: false,
  });
  const computedCommitment = meta.data && transaction.address && validBytes32(salt)
    ? makeCommitment(review, courtId, transaction.address, meta.data.caseNumber, meta.data.protocolVersion, vote, salt)
    : null;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const creatorConflict = Boolean(transaction.address && transaction.address.toLowerCase() === review.creator.toLowerCase());
  const contributorConflict = Boolean(meta.data?.contribution && meta.data.contribution > 0n);
  const evidenceReady = evidence.data?.availabilityPolicy.status === 'READY';
  const evidenceBlocked = Boolean(evidence.data && !evidenceReady);
  const canEnroll = Boolean(!currentAssignment && meta.data && meta.data.roundStatus === ROUND_ENROLLMENT_OPEN && now < meta.data.enrollmentDeadline && !creatorConflict && !contributorConflict);
  const canFinalizeSnapshot = Boolean(meta.data && meta.data.roundStatus === ROUND_ENROLLMENT_OPEN && !meta.data.snapshotFinalized && now >= meta.data.enrollmentDeadline && BigInt(review.enrolledCount) >= 3n);
  const canAssignCourt = Boolean(meta.data && meta.data.roundStatus === ROUND_ASSIGNMENT_PENDING && meta.data.snapshotFinalized && !meta.data.courtAssigned);
  const canCommit = Boolean(evidenceReady && currentAssignment && meta.data?.roundStatus === ROUND_VOTING && now >= meta.data.enrollmentDeadline && now < meta.data.commitDeadline && computedCommitment && meta.data.commitment === ZERO_HASH);
  const canReveal = Boolean(evidenceReady && currentAssignment && meta.data?.roundStatus === ROUND_VOTING && now >= meta.data.commitDeadline && now < meta.data.revealDeadline && computedCommitment === meta.data.commitment && !meta.data.revealed && validBytes32(salt));
  const canFinalizeCourt = Boolean(currentAssignment && meta.data?.roundStatus === ROUND_VOTING && now >= meta.data.revealDeadline && !meta.data.courtFinalized);

  return (
    <article className="monograph-card space-y-3">
      <span className="monograph-card__kicker">CANONICAL JUDGE CASE</span>
      <h2 className="monograph-card__title">Case {review.reviewCaseId}</h2>
      <p className="text-sm m-0">Campaign {review.campaignId} · milestone {review.milestoneId} · round {review.roundId} · enrolled {review.enrolledCount}</p>
      <p className="text-xs font-mono break-all m-0">Assignment: {currentAssignment ? `court ${currentAssignment.courtId}, slot ${currentAssignment.slot}` : 'chưa được chọn vào court'}</p>
      <p className="text-sm text-[var(--ink-subtle)] m-0">{review.outcome == null ? 'Court chưa final canonical outcome; chưa hiển thị PASS/FAIL cuối cùng.' : `Canonical review outcome: ${review.outcome}`}</p>
      {creatorConflict && <p className="text-sm text-[var(--danger)] m-0">Creator conflict: wallet tạo case không được enroll.</p>}
      {contributorConflict && !creatorConflict && <p className="text-sm text-[var(--danger)] m-0">Contributor conflict: wallet đã góp vốn cho campaign không được enroll.</p>}
      {meta.data && <p className="text-sm text-[var(--ink-subtle)] m-0">Case stake tối thiểu: {meta.data.requiredCaseStake.toString()} token units.</p>}
      {evidenceBlocked && <p className="text-sm text-[var(--danger)] m-0">Evidence chưa sẵn sàng ({evidence.data?.availabilityPolicy.status}); Judge không thể commit/reveal. {evidence.data?.availabilityPolicy.status === 'TIMEOUT_RETRY_ELIGIBLE' ? 'Review đã tới timeout; chỉ dùng protocol retry/fail path.' : 'Chờ storage hoặc indexer xác nhận trước deadline.'}</p>}
      {canEnroll && deployment.juryRegistry && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('registry', 'reserveCaseStake', [caseId, meta.data!.requiredCaseStake])}>Reserve case stake</button>
          <button type="button" className="button button--primary" disabled={transaction.busy} onClick={() => void transaction.send('review', 'enroll', [caseId])}>Enroll case</button>
        </div>
      )}
      {currentAssignment && (
        <div className="space-y-2">
          <label className="text-sm block" htmlFor={`vnext-vote-${review.reviewCaseId}`}>Vote</label>
          <select id={`vnext-vote-${review.reviewCaseId}`} value={vote} onChange={event => setVote(event.target.value as 'PASS' | 'FAIL')}>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
          </select>
          <label className="text-sm block" htmlFor={`vnext-salt-${review.reviewCaseId}`}>Salt bytes32</label>
          <input id={`vnext-salt-${review.reviewCaseId}`} className="font-mono" value={salt} onChange={event => setSalt(event.target.value)} placeholder="0x + 64 hex chars" />
          {computedCommitment && <p className="text-xs font-mono break-all m-0">Commitment: {computedCommitment}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button--primary" disabled={!canCommit || transaction.busy} onClick={() => void transaction.send('review', 'commitVote', [caseId, courtId, computedCommitment!])}>Commit vote</button>
            <button type="button" className="button button--secondary" disabled={!canReveal || transaction.busy} onClick={() => void transaction.send('review', 'revealVote', [caseId, courtId, voteNumber(vote), salt as `0x${string}`])}>Reveal vote</button>
          </div>
        </div>
      )}
      {currentAssignment && review.finalized && meta.data?.revealed && (
        <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('registry', 'claimReward', [caseId])}>Claim Judge reward</button>
      )}
      {currentAssignment && <VNextEvidencePanel reviewCaseId={review.reviewCaseId} />}
      <div className="flex flex-wrap gap-2">
        {meta.data?.roundStatus === ROUND_ENROLLMENT_OPEN && <button type="button" className="button button--quiet" disabled={!canFinalizeSnapshot || transaction.busy} onClick={() => void transaction.send('review', 'finalizeSnapshot', [caseId])}>Finalize snapshot</button>}
        {meta.data?.roundStatus === ROUND_ASSIGNMENT_PENDING && <button type="button" className="button button--quiet" disabled={!canAssignCourt || transaction.busy} onClick={() => void transaction.send('review', 'assignCourt', [caseId, 0n])}>Assign court 0</button>}
        {currentAssignment && <button type="button" className="button button--quiet" disabled={!canFinalizeCourt || transaction.busy} onClick={() => void transaction.send('review', 'finalizeCourt', [caseId, courtId])}>Finalize court</button>}
      </div>
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{getErrorMessage(transaction.error)}</p>}
    </article>
  );
}

export function VNextJudgePage() {
  const { session } = useAccountSession();
  const deployment = useQuery({ queryKey: ['vnext-deployment'], queryFn: campaignApi.vnextDeployment, retry: false });
  const reviews = useQuery({ queryKey: ['vnext-assigned-reviews'], queryFn: ({ signal }) => campaignApi.vnextAssignedReviews(signal), enabled: Boolean(session), retry: false });
  const ledger = useQuery({ queryKey: ['vnext-judge-ledger'], queryFn: ({ signal }) => campaignApi.vnextJudgeLedger(signal), enabled: Boolean(session), retry: false });

  if (!session) return <p>Đăng nhập bằng wallet để mở Judge workspace. <a href="#/account">Đăng nhập</a></p>;
  if (deployment.isPending || reviews.isPending) return <p role="status" className="muted">Đang tải VNext Judge workspace…</p>;
  if (deployment.error || reviews.error || !deployment.data?.configured) return <p role="alert" className="monograph-alert monograph-alert--error">{getErrorMessage(deployment.error ?? reviews.error ?? new Error('VNext deployment chưa được cấu hình.'))}</p>;

  return (
    <div className="campaign-container space-y-4">
      <section className="panel space-y-3">
        <span className="campaign-eyebrow">FUNDTOGETHER VNEXT · JUDGE</span>
        <h1>Judge workspace</h1>
        <p className="muted">Enrollment, assignment, commit và reveal đều chỉ có hiệu lực khi contract xác nhận đúng case, court và deadline.</p>
        {ledger.data?.length ? <p className="text-xs text-[var(--ink-subtle)] m-0" data-vnext-read="judge-ledger">
          Indexed ledger: {ledger.data.length} case rows · accrued {ledger.data.reduce((total, item) => total + BigInt(item.rewardAccrued), 0n).toString()} · claimed {ledger.data.reduce((total, item) => total + BigInt(item.rewardClaimed), 0n).toString()} token units. Contract state remains authoritative.
        </p> : null}
      </section>
      <JudgeStakePanel deployment={deployment.data} />
      {reviews.data?.length ? reviews.data.map(review => (
        <JudgeReviewCard key={review.reviewCaseId} review={review} deployment={deployment.data!} onRefresh={() => void reviews.refetch()} />
      )) : <p className="muted" role="status">Chưa có review case trong projection hiện tại.</p>}
    </div>
  );
}

export { makeCommitment };
