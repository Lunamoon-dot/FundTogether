import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Abi } from 'viem';
import { usePublicClient } from 'wagmi';
import reviewArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryReview.json';
import registryArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryRegistry.json';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import {
  campaignApi,
  type VNextDeployment,
  type VNextJudgeLedgerProjection,
  type VNextReviewWithAssignments,
} from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';
import { VNextEvidencePanel } from './VNextEvidencePanel';
import { loadVNextJudgeSecret, vnextSaltStorageKey } from './vnext-salt-storage';
import {
  formatVNextChainDeadline,
  generateVNextJudgeSalt,
  isVNextBytes32,
  makeVNextVoteCommitment,
  parseVNextJudgeSecretBackup,
  serializeVNextJudgeSecretBackup,
  vnextJudgeCaseState,
  vnextJudgeVoteNumber,
  type VNextJudgeVote,
} from './vnext-judge-flow';
import { displayVNextTokenAmount } from './vnext-refund-flow';
import { courtVerdictLabel, finalOutcomeLabel, roundVerdictLabel } from './vnext-milestone-flow';

const reviewAbi = reviewArtifact.abi as Abi;
const registryAbi = registryArtifact.abi as Abi;
const campaignAbi = campaignArtifact.abi as Abi;
const ZERO_HASH = `0x${'0'.repeat(64)}` as `0x${string}`;
const ROUND_ENROLLMENT_OPEN = 0;
const ROUND_ASSIGNMENT_PENDING = 2;
const ROUND_VOTING = 3;

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
        <button type="button" className="button button--secondary" disabled={!amountValue || transaction.busy} onClick={() => void transaction.send('token', 'approve', [deployment.juryRegistry, amountValue!], { waitForIndexer: false })}>Approve token cho Registry</button>
        <button type="button" className="button button--primary" disabled={!amountValue || transaction.busy} onClick={() => void transaction.send('registry', 'depositStake', [amountValue!])}>Deposit stake</button>
        <button type="button" className="button button--secondary" disabled={!amountValue || transaction.busy} onClick={() => void transaction.send('registry', 'withdrawStake', [amountValue!])}>Withdraw available stake</button>
      </div>
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </section>
  );
}

function JudgeReviewCard({ review, deployment, ledger, onRefresh }: {
  review: VNextReviewWithAssignments;
  deployment: VNextDeployment;
  ledger: VNextJudgeLedgerProjection[];
  onRefresh: () => void;
}) {
  const client = usePublicClient({ chainId: 31339 });
  const transaction = useVNextTransaction(onRefresh, onRefresh);
  const [vote, setVote] = useState<VNextJudgeVote>('PASS');
  const [salt, setSalt] = useState('');
  const [loadedSecretKey, setLoadedSecretKey] = useState<string | null>(null);
  const [secretSource, setSecretSource] = useState<'LEGACY' | 'GENERATED' | 'IMPORTED' | null>(null);
  const [backupInput, setBackupInput] = useState('');
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const caseId = review.reviewCaseId as `0x${string}`;
  const wallet = transaction.address;
  const indexedAssignment = review.assignments.find(item => item.judgeAddress.toLowerCase() === wallet?.toLowerCase());

  const meta = useQuery({
    queryKey: ['vnext-judge-case-meta', review.reviewCaseId, wallet],
    enabled: Boolean(client && deployment.juryReview && deployment.juryRegistry && deployment.campaignEscrow && wallet),
    queryFn: async () => {
      if (!client || !deployment.juryReview || !deployment.juryRegistry || !deployment.campaignEscrow || !wallet) throw new Error('VNext review client is unavailable');
      const [
        caseNumber,
        protocolVersion,
        requiredCaseStake,
        roundStatus,
        enrollmentDeadline,
        commitDeadline,
        revealDeadline,
        courtCount,
        contribution,
        enrolled,
        assignedJudge,
        assignedCourtId,
        caseStake,
        pendingReward,
        rewardClaimed,
        judgeSettled,
        reviewCaseSettled,
        settlementComplete,
        finalOutcome,
        reviewResult,
      ] = await Promise.all([
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'caseNumber', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'protocolVersion' }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'requiredCaseStake', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'roundStatus', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'enrollmentDeadline', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'commitDeadline', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'revealDeadline', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'courtCount', args: [caseId] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'contributionOf', args: [BigInt(review.campaignId), wallet] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'enrolled', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'assignedJudge', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'assignedCourtId', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryRegistry, abi: registryAbi, functionName: 'caseStake', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryRegistry, abi: registryAbi, functionName: 'pendingReward', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryRegistry, abi: registryAbi, functionName: 'rewardClaimed', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryRegistry, abi: registryAbi, functionName: 'caseSettled', args: [caseId, wallet] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'reviewCaseSettled', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'settlementComplete', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'finalOutcome', args: [caseId] }),
        client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'reviewResult', args: [caseId] }),
      ]);
      const totalCourts = Number(courtCount as bigint);
      const assignedCourtState = totalCourts === 0 ? [] : await Promise.all(Array.from({ length: totalCourts }, (_, courtIndex) => client.readContract({
        address: deployment.juryReview!, abi: reviewAbi, functionName: 'courtAssigned', args: [caseId, BigInt(courtIndex)],
      })));
      const assignedCourtIds = assignedCourtState.flatMap((assigned, courtIndex) => assigned ? [courtIndex] : []);
      const courts = await Promise.all(assignedCourtIds.map(async courtIndex => ({
        courtId: courtIndex,
        finalized: Boolean(await client.readContract({ address: deployment.juryReview!, abi: reviewAbi, functionName: 'courtFinalized', args: [caseId, BigInt(courtIndex)] })),
        result: Number(await client.readContract({ address: deployment.juryReview!, abi: reviewAbi, functionName: 'courtResult', args: [caseId, BigInt(courtIndex)] })),
      })));
      let assignment: { courtId: bigint; slot: number } | null = null;
      let commitment = ZERO_HASH;
      let revealed = false;
      if (assignedJudge) {
        const assignedCourt = BigInt(assignedCourtId as bigint);
        const judges = await Promise.all([0n, 1n, 2n].map(slot => client.readContract({
          address: deployment.juryReview!, abi: reviewAbi, functionName: 'courtJudge', args: [caseId, assignedCourt, slot],
        })));
        const slot = judges.findIndex(judge => String(judge).toLowerCase() === wallet.toLowerCase());
        if (slot >= 0) {
          assignment = { courtId: assignedCourt, slot };
          const [canonicalCommitment, canonicalRevealed] = await Promise.all([
            client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'commitments', args: [caseId, assignedCourt, wallet] }),
            client.readContract({ address: deployment.juryReview, abi: reviewAbi, functionName: 'revealed', args: [caseId, assignedCourt, wallet] }),
          ]);
          commitment = canonicalCommitment as `0x${string}`;
          revealed = Boolean(canonicalRevealed);
        }
      }
      return {
        caseNumber: BigInt(caseNumber as bigint),
        protocolVersion: BigInt(protocolVersion as bigint),
        requiredCaseStake: BigInt(requiredCaseStake as bigint),
        roundStatus: Number(roundStatus),
        enrollmentDeadline: BigInt(enrollmentDeadline as bigint),
        commitDeadline: BigInt(commitDeadline as bigint),
        revealDeadline: BigInt(revealDeadline as bigint),
        courtCount: totalCourts,
        courts,
        assignedCourtIds,
        contribution: BigInt(contribution as bigint),
        enrolled: Boolean(enrolled),
        assignment,
        caseStake: BigInt(caseStake as bigint),
        pendingReward: BigInt(pendingReward as bigint),
        rewardClaimed: Boolean(rewardClaimed),
        judgeSettled: Boolean(judgeSettled),
        reviewCaseSettled: Boolean(reviewCaseSettled),
        settlementComplete: Boolean(settlementComplete),
        finalOutcome: Number(finalOutcome),
        reviewResult: Number(reviewResult),
        commitment,
        revealed,
      };
    },
    retry: false,
  });
  const judgeClock = useQuery({
    queryKey: ['vnext-judge-chain-clock', client?.chain?.id],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error('VNext Judge chain clock is unavailable');
      return (await client.getBlock({ blockTag: 'latest' })).timestamp;
    },
    retry: false,
    staleTime: 5_000,
  });
  const evidence = useQuery({
    queryKey: ['vnext-judge-case-evidence', review.reviewCaseId, wallet],
    queryFn: ({ signal }) => campaignApi.vnextEvidence(review.reviewCaseId, signal),
    enabled: Boolean(meta.data?.assignment && wallet),
    retry: false,
  });
  const courtId = meta.data?.assignment?.courtId;
  const saltKey = courtId !== undefined && wallet ? vnextSaltStorageKey(review.reviewCaseId, courtId, wallet) : null;
  /* oxlint-disable react/set-state-in-effect -- Canonical assignment selects the read-only legacy storage key. */
  useEffect(() => {
    if (!saltKey) {
      setSalt('');
      setVote('PASS');
      setLoadedSecretKey(null);
      setSecretSource(null);
      return;
    }
    if (loadedSecretKey === saltKey) return;
    const legacy = loadVNextJudgeSecret(saltKey);
    setSalt(legacy.salt);
    setVote(legacy.vote);
    setSecretSource(isVNextBytes32(legacy.salt) ? 'LEGACY' : null);
    setLoadedSecretKey(saltKey);
  }, [loadedSecretKey, saltKey]);
  /* oxlint-enable react/set-state-in-effect */

  const computedCommitment = meta.data && wallet && courtId !== undefined && isVNextBytes32(salt)
    ? makeVNextVoteCommitment({
        chainId: BigInt(deployment.chainId ?? 31339),
        protocolVersion: meta.data.protocolVersion,
        campaignId: BigInt(review.campaignId),
        milestoneId: BigInt(review.milestoneId),
        evidenceRevision: BigInt(review.evidenceRevision),
        reviewCaseNumber: meta.data.caseNumber,
        roundId: BigInt(review.roundId),
        courtId,
        judgeAddress: wallet,
        vote,
        salt,
      })
    : null;
  const evidenceReady = evidence.data?.availabilityPolicy.status === 'READY';
  const creatorConflict = Boolean(wallet && wallet.toLowerCase() === review.creator.toLowerCase());
  const contributorConflict = Boolean(meta.data?.contribution && meta.data.contribution > 0n);
  const claimPreflight = useQuery({
    queryKey: ['vnext-judge-claim-preflight', review.reviewCaseId, wallet, meta.data?.pendingReward.toString(), meta.data?.rewardClaimed],
    enabled: Boolean(client && deployment.juryRegistry && wallet && meta.data?.assignment && meta.data.pendingReward > 0n && !meta.data.rewardClaimed),
    queryFn: async () => {
      if (!client || !deployment.juryRegistry || !wallet) throw new Error('Claim Reward simulation unavailable');
      await client.simulateContract({ address: deployment.juryRegistry, abi: registryAbi, functionName: 'claimReward', args: [caseId], account: wallet });
      return true;
    },
    retry: false,
  });
  const caseState = vnextJudgeCaseState({
    rpcAvailable: Boolean(meta.data && judgeClock.data !== undefined && !meta.error && !judgeClock.error),
    chainTimestamp: judgeClock.data,
    roundStatus: meta.data?.roundStatus,
    enrollmentDeadline: meta.data?.enrollmentDeadline,
    commitDeadline: meta.data?.commitDeadline,
    revealDeadline: meta.data?.revealDeadline,
    creatorConflict,
    contributorConflict,
    enrolled: meta.data?.enrolled ?? false,
    assigned: Boolean(meta.data?.assignment),
    evidenceReady,
    secretValid: isVNextBytes32(salt),
    hasOnchainCommitment: Boolean(meta.data && meta.data.commitment !== ZERO_HASH),
    commitmentMatches: Boolean(computedCommitment && meta.data && computedCommitment.toLowerCase() === meta.data.commitment.toLowerCase()),
    revealed: meta.data?.revealed ?? false,
    courtFinalized: Boolean(courtId !== undefined && meta.data?.courts.find(court => BigInt(court.courtId) === courtId)?.finalized),
    judgeSettled: meta.data?.judgeSettled ?? false,
    pendingReward: meta.data?.pendingReward ?? 0n,
    rewardClaimed: meta.data?.rewardClaimed ?? false,
    claimSimulationReady: claimPreflight.data === true,
    transactionAction: transaction.action,
    transactionStage: transaction.stage,
    transactionHash: transaction.txHash,
    receiptStatus: transaction.receiptStatus,
  });
  const unassignedCourtIds = meta.data
    ? Array.from({ length: meta.data.courtCount }, (_, courtIndex) => courtIndex).filter(courtIndex => !meta.data!.assignedCourtIds.includes(courtIndex))
    : [];
  const canFinalizeSnapshot = Boolean(judgeClock.data !== undefined && meta.data?.roundStatus === ROUND_ENROLLMENT_OPEN && judgeClock.data >= meta.data.enrollmentDeadline && BigInt(review.enrolledCount) >= 3n);
  const canAssignCourt = Boolean(meta.data && meta.data.roundStatus >= ROUND_ASSIGNMENT_PENDING && unassignedCourtIds.length > 0);
  const finalizableCourts = meta.data?.courts.filter(court => !court.finalized && meta.data.roundStatus === ROUND_VOTING && judgeClock.data !== undefined && judgeClock.data >= meta.data.revealDeadline) ?? [];
  const eligibleToEnroll = caseState.participationStatus === 'ELIGIBLE_NOT_ENROLLED';
  const selectionLocked = Boolean((meta.data && meta.data.commitment !== ZERO_HASH) || (transaction.action === 'commitVote' && transaction.txHash && transaction.receiptStatus !== 'reverted'));
  const commitTransactionUnresolved = Boolean(transaction.action === 'commitVote' && transaction.txHash && transaction.receiptStatus !== 'reverted' && (!meta.data || meta.data.commitment === ZERO_HASH));
  const indexedLedger = ledger.find(item => item.reviewCaseId.toLowerCase() === review.reviewCaseId.toLowerCase() && item.judgeAddress.toLowerCase() === wallet?.toLowerCase());
  const projectionMismatch = Boolean((indexedAssignment && !meta.data?.assignment) || (indexedAssignment && meta.data?.assignment && BigInt(indexedAssignment.courtId) !== meta.data.assignment.courtId));
  const secretContext = wallet && courtId !== undefined ? { chainId: deployment.chainId ?? 31339, reviewCaseId: review.reviewCaseId, courtId, judgeAddress: wallet } : null;

  const copySecretBackup = async () => {
    if (!secretContext || !isVNextBytes32(salt)) return;
    if (!navigator.clipboard) {
      setSecretMessage('Clipboard không khả dụng trong browser hiện tại.');
      return;
    }
    try {
      await navigator.clipboard.writeText(serializeVNextJudgeSecretBackup(secretContext, { vote, salt }));
      setSecretMessage('Secret backup đã copy theo đúng case, court và ví. Cất giữ riêng tư.');
    } catch (cause) {
      setSecretMessage(getErrorMessage(cause));
    }
  };
  const importSecretBackup = () => {
    if (!secretContext) return;
    try {
      const imported = parseVNextJudgeSecretBackup(backupInput, secretContext);
      setVote(imported.vote);
      setSalt(imported.salt);
      setSecretSource('IMPORTED');
      setSecretMessage('Backup hợp lệ đã được nạp vào bộ nhớ cho Reveal recovery.');
    } catch (cause) {
      setSecretMessage(getErrorMessage(cause));
    }
  };
  const commitVote = () => {
    if (!caseState.commit.ready || courtId === undefined || !computedCommitment || !wallet) return;
    void transaction.send('review', 'commitVote', [caseId, courtId, computedCommitment], {
      canonicalEvent: { eventName: 'VoteCommitted', args: { reviewCaseId: review.reviewCaseId, courtId: courtId.toString(), judge: wallet, commitment: computedCommitment } },
    });
  };
  const revealVote = () => {
    if (!caseState.reveal.ready || courtId === undefined || !isVNextBytes32(salt) || !wallet) return;
    void transaction.send('review', 'revealVote', [caseId, courtId, vnextJudgeVoteNumber(vote), salt], {
      canonicalEvent: { eventName: 'VoteRevealed', args: { reviewCaseId: review.reviewCaseId, courtId: courtId.toString(), judge: wallet, vote: vnextJudgeVoteNumber(vote).toString() } },
    });
  };
  const claimReward = () => {
    if (!caseState.claim.ready || !wallet || !meta.data) return;
    void transaction.send('registry', 'claimReward', [caseId], {
      canonicalEvent: { eventName: 'JudgeRewardClaimed', args: { reviewCaseId: review.reviewCaseId, judge: wallet, amount: meta.data.pendingReward.toString() } },
    });
  };

  return (
    <article className="monograph-card space-y-3" style={{ order: caseState.priority }} data-vnext-judge-case={review.reviewCaseId}>
      <span className="monograph-card__kicker">{caseState.participationStatus.replaceAll('_', ' ')}</span>
      <h2 className="monograph-card__title">Campaign {review.campaignId} · milestone {review.milestoneId}</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="muted">Evidence revision</dt><dd>{review.evidenceRevision}</dd></div>
        <div><dt className="muted">Review Case ID</dt><dd className="font-mono break-all">{review.reviewCaseId}</dd></div>
        <div><dt className="muted">Court / slot · canonical</dt><dd>{meta.data?.assignment ? `${meta.data.assignment.courtId.toString()} / ${meta.data.assignment.slot}` : 'Not assigned'}</dd></div>
        <div><dt className="muted">Current phase</dt><dd>{caseState.phaseLabel}</dd></div>
        <div><dt className="muted">Committed</dt><dd>{meta.data && meta.data.commitment !== ZERO_HASH ? 'YES' : 'NO'}</dd></div>
        <div><dt className="muted">Revealed</dt><dd>{meta.data?.revealed ? 'YES' : 'NO'}</dd></div>
        <div><dt className="muted">Enrollment deadline</dt><dd>{formatVNextChainDeadline(meta.data?.enrollmentDeadline)}</dd></div>
        <div><dt className="muted">Commit deadline</dt><dd>{formatVNextChainDeadline(meta.data?.commitDeadline)}</dd></div>
        <div><dt className="muted">Reveal deadline</dt><dd>{formatVNextChainDeadline(meta.data?.revealDeadline)}</dd></div>
      </dl>
      <p className="text-xs text-[var(--ink-subtle)] m-0">ENROLLMENT → ASSIGNMENT → COMMIT → REVEAL → COURT FINALIZATION → SETTLEMENT</p>
      <p className="text-sm m-0"><strong>Next available action:</strong> {caseState.nextAction}</p>
      <p className="text-xs text-[var(--ink-subtle)] m-0">Deadline hiển thị theo giờ local để tham khảo; eligibility luôn dùng timestamp của latest chain block.</p>
      {projectionMismatch && <p className="monograph-alert" data-vnext-indexer-assignment-lag>Indexer assignment đang lệch canonical contract; voting bị khóa theo contract state.</p>}
      <p className="text-sm text-[var(--ink-subtle)] m-0">Court verdict: {courtVerdictLabel(meta.data?.reviewResult)} · Provisional Review verdict: {roundVerdictLabel(review.roundOutcome)} · Final protocol outcome: {finalOutcomeLabel(meta.data?.finalOutcome ?? review.finalOutcome)}</p>
      <p className="text-sm text-[var(--ink-subtle)] m-0">Judge settlement: {meta.data?.judgeSettled ? 'SETTLED' : meta.data?.reviewCaseSettled ? 'CASE SETTLED' : 'PENDING'} · Full ruling settlement: {meta.data?.settlementComplete ? 'COMPLETE' : 'PENDING'}</p>
      {creatorConflict && <p className="text-sm text-[var(--danger)] m-0">Creator conflict: wallet tạo case không được enroll.</p>}
      {contributorConflict && !creatorConflict && <p className="text-sm text-[var(--danger)] m-0">Contributor conflict: wallet đã góp vốn cho campaign không được enroll.</p>}
      {meta.data && <p className="text-sm text-[var(--ink-subtle)] m-0">Case stake: {displayVNextTokenAmount(meta.data.caseStake, deployment.tokenDecimals)} / required {displayVNextTokenAmount(meta.data.requiredCaseStake, deployment.tokenDecimals)}.</p>}
      {meta.error && <p role="alert" className="monograph-alert monograph-alert--error">Không đọc được metadata Judge từ chain: {getErrorMessage(meta.error)}</p>}
      {judgeClock.error && <p role="alert" className="monograph-alert monograph-alert--error">RPC unavailable: {getErrorMessage(judgeClock.error)}</p>}
      {evidence.data && evidence.data.availabilityPolicy.status !== 'READY' && <p className="text-sm text-[var(--danger)] m-0">Evidence chưa sẵn sàng ({evidence.data.availabilityPolicy.status}); Commit bị khóa. Reveal recovery vẫn khả dụng cho commitment hợp lệ. {evidence.data.availabilityPolicy.status === 'TIMEOUT_RETRY_ELIGIBLE' ? 'Chỉ dùng protocol retry/fail path hiện có.' : 'Chờ storage hoặc indexer xác nhận.'}</p>}
      {eligibleToEnroll && (
        <div className="space-y-2">
          <p className="text-sm m-0">Eligible nhưng chưa enroll. Reserve đủ case stake trước, sau đó Enroll bằng transaction riêng.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button--secondary" disabled={meta.data!.caseStake > 0n || transaction.busy} onClick={() => void transaction.send('registry', 'reserveCaseStake', [caseId, meta.data!.requiredCaseStake])}>Reserve case stake</button>
            <button type="button" className="button button--primary" disabled={meta.data!.caseStake < meta.data!.requiredCaseStake || transaction.busy} onClick={() => void transaction.send('review', 'enroll', [caseId])}>Enroll case</button>
          </div>
        </div>
      )}
      {meta.data?.assignment && (
        <section className="border-t border-[var(--border-hairline)] pt-3 space-y-3" aria-label="Secure vote secret">
          <h3 className="m-0">Secure Commit–Reveal</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vote selection">
            {(['PASS', 'FAIL'] as const).map(option => <button key={option} type="button" className={vote === option ? 'button button--primary' : 'button button--secondary'} disabled={selectionLocked} onClick={() => setVote(option)}>{option}</button>)}
          </div>
          <label className="text-sm block" htmlFor={`vnext-salt-${review.reviewCaseId}`}>Secret salt · bytes32</label>
          <input id={`vnext-salt-${review.reviewCaseId}`} type="password" autoComplete="off" className="font-mono" value={salt} readOnly placeholder="Generate hoặc import backup" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button--secondary" disabled={selectionLocked} onClick={() => { setSalt(generateVNextJudgeSalt()); setSecretSource('GENERATED'); setSecretMessage('Salt 32-byte đã tạo bằng Web Crypto và chỉ giữ trong bộ nhớ.'); }}>Generate secret salt</button>
            <button type="button" className="button button--quiet" disabled={!isVNextBytes32(salt)} onClick={() => void copySecretBackup()}>Copy secret backup</button>
          </div>
          <p className="text-xs text-[var(--ink-subtle)] m-0">Secret source: {secretSource ?? 'NONE'} · Secrets mới không tự ghi plaintext vào localStorage. Browser storage không bảo vệ khỏi XSS.</p>
          {secretSource === 'LEGACY' && <p className="monograph-alert">Legacy localStorage secret đã được đọc vào memory nhưng không bị sửa hoặc xóa. Hãy chủ động copy backup mới.</p>}
          <p className="monograph-alert">Mất vote hoặc salt backup có thể khiến Reveal thất bại và Judge chịu protocol penalty.</p>
          <label className="text-sm block" htmlFor={`vnext-secret-import-${review.reviewCaseId}`}>Reveal recovery backup</label>
          <textarea id={`vnext-secret-import-${review.reviewCaseId}`} value={backupInput} onChange={event => setBackupInput(event.target.value)} placeholder="Paste JSON backup" rows={4} />
          <button type="button" className="button button--quiet" disabled={!backupInput.trim() || commitTransactionUnresolved} onClick={importSecretBackup}>Import backup</button>
          {secretMessage && <p className="text-sm m-0" role="status">{secretMessage}</p>}
          <div className="space-y-1" aria-label="Commit confirmation summary">
            <p className="text-sm m-0"><strong>Confirmation:</strong> Campaign {review.campaignId}, milestone {review.milestoneId}, revision {review.evidenceRevision}, court {meta.data.assignment.courtId.toString()}, slot {meta.data.assignment.slot}, vote {vote}.</p>
            <p className="text-xs font-mono break-all m-0">Computed commitment: {computedCommitment ?? 'Secret chưa hợp lệ'}</p>
            {meta.data.commitment !== ZERO_HASH && <p className="text-xs font-mono break-all m-0">Canonical commitment: {meta.data.commitment}</p>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <button type="button" className="button button--primary" disabled={!caseState.commit.ready || transaction.busy} onClick={commitVote}>Commit vote</button>
              {!caseState.commit.ready && <p className="text-xs text-[var(--ink-subtle)]">{caseState.commit.reason}</p>}
            </div>
            <div>
              <button type="button" className="button button--secondary" disabled={!caseState.reveal.ready || transaction.busy} onClick={revealVote}>Reveal vote</button>
              {!caseState.reveal.ready && <p className="text-xs text-[var(--ink-subtle)]">{caseState.reveal.reason}</p>}
            </div>
          </div>
        </section>
      )}
      {meta.data?.assignment && <VNextEvidencePanel reviewCaseId={review.reviewCaseId} evidenceRevision={review.evidenceRevision} allowUpload={false} />}
      {meta.data?.assignment && (
        <section className="border-t border-[var(--border-hairline)] pt-3 space-y-2" aria-label="Judge rewards">
          <h3 className="m-0">Settlement & reward</h3>
          <p className="text-sm m-0">Pending canonical reward: {displayVNextTokenAmount(meta.data.pendingReward, deployment.tokenDecimals)} · Claimed: {meta.data.rewardClaimed ? 'YES' : 'NO'}.</p>
          <p className="text-xs text-[var(--ink-subtle)] m-0">Indexed ledger accrued {displayVNextTokenAmount(indexedLedger?.rewardAccrued, deployment.tokenDecimals)} · claimed {displayVNextTokenAmount(indexedLedger?.rewardClaimed, deployment.tokenDecimals)}. Contract remains authoritative.</p>
          <button type="button" className="button button--secondary" disabled={!caseState.claim.ready || transaction.busy} onClick={claimReward}>Claim Judge reward</button>
          {!caseState.claim.ready && <p className="text-xs text-[var(--ink-subtle)] m-0">{caseState.claim.reason}{claimPreflight.error ? ` ${getErrorMessage(claimPreflight.error)}` : ''}</p>}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {meta.data?.roundStatus === ROUND_ENROLLMENT_OPEN && <button type="button" className="button button--quiet" disabled={!canFinalizeSnapshot || transaction.busy} onClick={() => void transaction.send('review', 'finalizeSnapshot', [caseId])}>Finalize snapshot</button>}
        {unassignedCourtIds.map(unassignedCourtId => <button key={unassignedCourtId} type="button" className="button button--quiet" disabled={!canAssignCourt || transaction.busy} onClick={() => void transaction.send('review', 'assignCourt', [caseId, BigInt(unassignedCourtId)])}>Assign court {unassignedCourtId}</button>)}
        {finalizableCourts.map(court => <button key={court.courtId} type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.send('review', 'finalizeCourt', [caseId, BigInt(court.courtId)])}>Finalize court {court.courtId}</button>)}
      </div>
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.txHash && transaction.receiptStatus !== 'reverted' && transaction.stage !== 'indexed' && <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.reconcile()}>Reconcile canonical transaction</button>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{getErrorMessage(transaction.error)}</p>}
    </article>
  );
}

export function VNextJudgePage() {
  const { session } = useAccountSession();
  const queryClient = useQueryClient();
  const deployment = useQuery({ queryKey: ['vnext-deployment'], queryFn: campaignApi.vnextDeployment, retry: false });
  const reviews = useQuery({ queryKey: ['vnext-assigned-reviews'], queryFn: ({ signal }) => campaignApi.vnextAssignedReviews(signal), enabled: Boolean(session), retry: false });
  const ledger = useQuery({ queryKey: ['vnext-judge-ledger'], queryFn: ({ signal }) => campaignApi.vnextJudgeLedger(signal), enabled: Boolean(session), retry: false });
  const refreshJudgeWorkspace = () => {
    void reviews.refetch();
    void ledger.refetch();
    void queryClient.invalidateQueries({ queryKey: ['vnext-judge-case-meta'] });
    void queryClient.invalidateQueries({ queryKey: ['vnext-judge-case-evidence'] });
    void queryClient.invalidateQueries({ queryKey: ['vnext-case-evidence'] });
  };

  if (!session) return <p>Đăng nhập bằng wallet để mở Judge workspace. <a href="#/account">Đăng nhập</a></p>;
  if (deployment.isPending || reviews.isPending) return <p role="status" className="muted">Đang tải VNext Judge workspace…</p>;
  if (deployment.error || reviews.error || !deployment.data?.configured) return <p role="alert" className="monograph-alert monograph-alert--error">{getErrorMessage(deployment.error ?? reviews.error ?? new Error('VNext deployment chưa được cấu hình.'))}</p>;

  return (
    <div className="campaign-container space-y-4">
      <section className="panel space-y-3">
        <span className="campaign-eyebrow">FUNDTOGETHER VNEXT · JUDGE</span>
        <h1>Judge workspace</h1>
        <p className="muted">Inspect private evidence, keep vote secrets client-side, then Commit, Reveal, settle and claim against canonical contract state.</p>
        {ledger.data?.length ? <p className="text-xs text-[var(--ink-subtle)] m-0" data-vnext-read="judge-ledger">
          Indexed ledger: {ledger.data.length} case rows · accrued {ledger.data.reduce((total, item) => total + BigInt(item.rewardAccrued), 0n).toString()} · claimed {ledger.data.reduce((total, item) => total + BigInt(item.rewardClaimed), 0n).toString()} token units. Contract state remains authoritative.
        </p> : null}
      </section>
      <JudgeStakePanel deployment={deployment.data} />
      <section className="flex flex-col gap-4" aria-label="Judge review cases">
        {reviews.data?.length ? reviews.data.map(review => (
          <JudgeReviewCard key={review.reviewCaseId} review={review} deployment={deployment.data!} ledger={ledger.data ?? []} onRefresh={refreshJudgeWorkspace} />
        )) : <p className="muted" role="status">Chưa có review case trong projection hiện tại.</p>}
      </section>
    </div>
  );
}
