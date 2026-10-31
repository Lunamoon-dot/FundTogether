import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import type { VNextCampaignProjection, VNextDeployment, VNextMilestoneProjection } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useVNextTransaction } from './vnext-transaction';
import { vnextBlockedReason } from './vnext-milestone-flow';
import {
  canSendVNextEvidenceTransaction,
  hashVNextEvidenceFile,
  isVNextEvidenceReady,
  isVNextEvidenceSubmissionState,
  matchVNextCanonicalSubmission,
  selectVNextEvidenceFile,
  type VNextEvidenceSelection,
  type VNextEvidenceWizardStatus,
  vnextEvidenceSubmissionBlockReason,
} from './vnext-evidence-wizard';

const campaignAbi = campaignArtifact.abi as Abi;

const steps = ['Select File', 'Verify Hash', 'Submit On-chain', 'Upload Evidence', 'Evidence Ready'];

interface LockedSubmission {
  evidenceHash: `0x${string}`;
  expectedRevision: string;
  txHash: `0x${string}`;
}
function fileSizeLabel(size: number) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(2)} MiB` : `${(size / 1024).toFixed(1)} KiB`;
}

function currentStep(status: VNextEvidenceWizardStatus, hasHash: boolean, hasCanonicalCase: boolean) {
  if (status === 'READY') return 5;
  if (hasCanonicalCase) return 4;
  if (['WALLET_CONFIRMATION', 'TRANSACTION_SUBMITTED', 'RECEIPT_CONFIRMED', 'WAITING_FOR_INDEXER'].includes(status)) return 3;
  return hasHash ? 3 : status === 'HASHING' ? 2 : 1;
}

export function VNextEvidenceSubmissionWizard({
  campaignId,
  campaign,
  milestone,
  deployment,
  userId,
  onRefresh,
}: {
  campaignId: string;
  campaign: VNextCampaignProjection;
  milestone: VNextMilestoneProjection;
  deployment: VNextDeployment;
  userId?: string;
  onRefresh: () => void;
}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const [selection, setSelection] = useState<VNextEvidenceSelection | null>(null);
  const [summary, setSummary] = useState('');
  const [hashing, setHashing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedSubmission, setLockedSubmission] = useState<LockedSubmission | null>(null);
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [waitingForIndexer, setWaitingForIndexer] = useState(false);
  const campaignNumber = /^[0-9]+$/.test(campaignId) ? BigInt(campaignId) : null;
  const milestoneNumber = BigInt(milestone.milestoneId);

  const preflight = useQuery({
    queryKey: ['vnext-evidence-wizard-preflight', campaignId, milestone.milestoneId, deployment.campaignEscrow, account.address, selection?.evidenceHash],
    enabled: Boolean(client && deployment.campaignEscrow && campaignNumber !== null),
    queryFn: async () => {
      if (!client || !deployment.campaignEscrow || campaignNumber === null) throw new Error('Evidence preflight client is unavailable');
      const [creator, campaignState, milestoneState, currentRevision, onchainEvidenceHash, submissionDeadline, correctionDeadline, acceptanceCriteriaHash, maximumCorrections, latestBlock] = await Promise.all([
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'campaignCreator',
          args: [campaignNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'campaignState',
          args: [campaignNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'milestoneState',
          args: [campaignNumber, milestoneNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'milestoneEvidenceRevision',
          args: [campaignNumber, milestoneNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'milestoneEvidenceHash',
          args: [campaignNumber, milestoneNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'milestoneSubmissionDeadline',
          args: [campaignNumber, milestoneNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'milestoneCorrectionDeadline',
          args: [campaignNumber, milestoneNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'milestoneAcceptanceCriteria',
          args: [campaignNumber, milestoneNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'MAX_MILESTONE_CORRECTIONS',
        }),
        client.getBlock({ blockTag: 'latest' }),
      ]);
      const snapshot = {
        creator: String(creator),
        campaignState: Number(campaignState),
        milestoneState: Number(milestoneState),
        currentRevision: BigInt(String(currentRevision)),
        evidenceHash: String(onchainEvidenceHash).toLowerCase(),
        submissionDeadline: BigInt(String(submissionDeadline)),
        correctionDeadline: BigInt(String(correctionDeadline)),
        acceptanceCriteriaHash: String(acceptanceCriteriaHash),
        maximumCorrections: BigInt(String(maximumCorrections)),
        chainTimestamp: latestBlock.timestamp,
      };
      const blockedReason = vnextEvidenceSubmissionBlockReason({
        wallet: account.address,
        creator: snapshot.creator,
        campaignState: snapshot.campaignState,
        milestoneState: snapshot.milestoneState,
        chainTimestamp: snapshot.chainTimestamp,
        submissionDeadline: snapshot.submissionDeadline,
        correctionDeadline: snapshot.correctionDeadline,
      });
      if (blockedReason || !selection?.evidenceHash || !account.address) {
        return {
          ...snapshot,
          ready: false,
          reason: blockedReason ?? 'Tính SHA-256 trước khi chạy transaction preflight.',
        };
      }
      try {
        await client.simulateContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'submitMilestoneEvidence',
          args: [campaignNumber, milestoneNumber, selection.evidenceHash],
          account: account.address,
        });
        return { ...snapshot, ready: true, reason: null };
      } catch (cause) {
        return { ...snapshot, ready: false, reason: vnextBlockedReason(cause) };
      }
    },
    retry: false,
    refetchInterval: isVNextEvidenceSubmissionState(milestone.state) && !lockedSubmission ? 5_000 : false,
  });

  const transaction = useVNextTransaction(
    onRefresh,
    () => setReceiptConfirmed(true),
    (txHash) => {
      const evidenceHash = selection?.evidenceHash;
      const currentRevision = preflight.data?.currentRevision;
      if (!evidenceHash || currentRevision === undefined) return;
      setLockedSubmission(
        (current) =>
          current ?? {
            evidenceHash,
            expectedRevision: (currentRevision + 1n).toString(),
            txHash,
          },
      );
    },
  );

  const recoveryHash =
    preflight.data && !isVNextEvidenceSubmissionState(preflight.data.milestoneState) && /^0x[0-9a-f]{64}$/.test(preflight.data.evidenceHash) && preflight.data.evidenceHash !== `0x${'0'.repeat(64)}`
      ? (preflight.data.evidenceHash as `0x${string}`)
      : null;
  const canonicalTargetHash = lockedSubmission?.evidenceHash ?? recoveryHash;
  const canonicalTargetRevision = lockedSubmission?.expectedRevision ?? (recoveryHash ? preflight.data?.currentRevision.toString() : undefined);

  const canonicalProjection = useQuery({
    queryKey: ['vnext-evidence-wizard-canonical-case', campaignId, milestone.milestoneId, canonicalTargetHash, canonicalTargetRevision],
    enabled: Boolean(canonicalTargetHash && canonicalTargetRevision),
    queryFn: async ({ signal }) => {
      const milestones = await campaignApi.vnextMilestones(campaignId, signal);
      return matchVNextCanonicalSubmission(milestones, milestone.milestoneId, canonicalTargetHash!, canonicalTargetRevision!);
    },
    retry: false,
    refetchInterval: (query) => (query.state.data ? false : 1_500),
  });

  const recoveryProjection = !isVNextEvidenceSubmissionState(milestone.state) && milestone.reviewCaseId && milestone.evidenceHash ? milestone : null;
  const canonicalSubmission = canonicalProjection.data ?? recoveryProjection;
  const reviewCaseId = canonicalSubmission?.reviewCaseId ?? null;
  const canonicalHash = canonicalSubmission?.evidenceHash ?? null;
  const evidence = useQuery({
    queryKey: ['vnext-case-evidence', reviewCaseId],
    queryFn: ({ signal }) => campaignApi.vnextEvidence(reviewCaseId!, signal),
    enabled: Boolean(userId && reviewCaseId),
    retry: false,
  });
  const evidenceReady = Boolean(canonicalHash && isVNextEvidenceReady(evidence.data, canonicalHash));
  const fileMatchesCanonical = Boolean(selection?.evidenceHash && canonicalHash && selection.evidenceHash.toLowerCase() === canonicalHash.toLowerCase());

  let status: VNextEvidenceWizardStatus = 'NOT_STARTED';
  if (evidenceReady) status = 'READY';
  else if (hashing) status = 'HASHING';
  else if (uploading) status = 'UPLOADING';
  else if (verifying) status = 'VERIFYING_AVAILABILITY';
  else if (error || transaction.error) status = 'FAILED';
  else if (reviewCaseId) status = 'ACTION_REQUIRED';
  else if ((canonicalTargetHash && !reviewCaseId) || waitingForIndexer || transaction.stage === 'indexed') status = 'WAITING_FOR_INDEXER';
  else if (receiptConfirmed) status = 'RECEIPT_CONFIRMED';
  else if (lockedSubmission || transaction.stage === 'submitted') status = 'TRANSACTION_SUBMITTED';
  else if (transaction.stage === 'wallet_requested') status = 'WALLET_CONFIRMATION';
  else if (selection?.evidenceHash && preflight.data?.ready) status = 'READY_TO_SUBMIT';
  else if (preflight.data?.reason && selection?.evidenceHash) status = 'ACTION_REQUIRED';

  const step = currentStep(status, Boolean(selection?.evidenceHash), Boolean(reviewCaseId));
  const canSend = canSendVNextEvidenceTransaction({
    evidenceHash: selection?.evidenceHash ?? null,
    confirmed: selection?.confirmed ?? false,
    preflightReady: preflight.data?.ready ?? false,
    submittedTxHash: lockedSubmission?.txHash,
  });

  const selectFile = (file: File | null) => {
    setError(null);
    if (!file) {
      setSelection(null);
      return;
    }
    try {
      setSelection(selectVNextEvidenceFile(file));
    } catch (cause) {
      setSelection(null);
      setError(getErrorMessage(cause));
    }
  };

  const calculateHash = async () => {
    if (!selection) return;
    const selectedFile = selection.file;
    setHashing(true);
    setError(null);
    try {
      const evidenceHash = await hashVNextEvidenceFile(selectedFile);
      setSelection((current) => (current?.file === selectedFile ? { ...current, evidenceHash, confirmed: false } : current));
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setHashing(false);
    }
  };

  const submitOnChain = async () => {
    if (!canSend || campaignNumber === null || !selection?.evidenceHash) return;
    setError(null);
    const txHash = await transaction.send('campaign', 'submitMilestoneEvidence', [campaignNumber, milestoneNumber, selection.evidenceHash]);
    if (txHash) setWaitingForIndexer(true);
  };

  const verifyAvailability = async () => {
    if (!reviewCaseId || !canonicalHash) return;
    setVerifying(true);
    setError(null);
    try {
      const result = await evidence.refetch();
      if (!isVNextEvidenceReady(result.data, canonicalHash)) {
        setError('Evidence chưa đồng thời đạt object AVAILABLE và policy READY. Kiểm tra trạng thái thực tế bên dưới.');
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setVerifying(false);
    }
  };

  const upload = async () => {
    if (!reviewCaseId || !canonicalHash || !selection?.file || !fileMatchesCanonical || !summary.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await campaignApi.vnextUploadEvidence(reviewCaseId, summary.trim(), selection.file);
      setVerifying(true);
      const result = await evidence.refetch();
      if (!isVNextEvidenceReady(result.data, canonicalHash)) {
        setError('Upload đã trả về nhưng evidence chưa AVAILABLE + READY. Không gửi lại transaction on-chain; hãy verify hoặc retry upload cho cùng Review Case.');
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setUploading(false);
      setVerifying(false);
    }
  };

  const actualCreator = preflight.data?.creator ?? campaign.creator;
  const isCreator = Boolean(account.address && account.address.toLowerCase() === actualCreator.toLowerCase());

  return (
    <section className="border-t border-[var(--border-hairline)] pt-3 space-y-3" data-vnext-evidence-wizard data-vnext-wizard-status={status}>
      <div>
        <span className="monograph-card__kicker">CREATOR EVIDENCE SUBMISSION</span>
        <p className="text-sm m-0">
          <strong>Status:</strong> {status}
        </p>
      </div>

      <ol className="grid gap-2 text-xs sm:grid-cols-5" aria-label="Evidence submission progress">
        {steps.map((label, index) => {
          const number = index + 1;
          return (
            <li key={label} aria-current={number === step ? 'step' : undefined} className={number <= step ? 'font-semibold' : 'text-[var(--ink-subtle)]'}>
              {number}. {label}
            </li>
          );
        })}
      </ol>

      {!isCreator ? (
        <p className="monograph-alert" data-vnext-wizard-blocked>
          Connected wallet is not the canonical Campaign Creator.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm block" htmlFor={`vnext-evidence-file-${milestone.milestoneId}`}>
              Evidence file for milestone {milestone.milestoneId}
            </label>
            <input
              id={`vnext-evidence-file-${milestone.milestoneId}`}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={transaction.busy || Boolean(lockedSubmission)}
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
            {selection && (
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="muted">Filename</dt>
                  <dd>{selection.file.name}</dd>
                </div>
                <div>
                  <dt className="muted">Size / type</dt>
                  <dd>
                    {fileSizeLabel(selection.file.size)} · {selection.file.type}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Milestone / revision</dt>
                  <dd>
                    {milestone.milestoneId} · current {preflight.data?.currentRevision.toString() ?? milestone.evidenceRevision}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Acceptance criteria</dt>
                  <dd className="font-mono break-all">{preflight.data?.acceptanceCriteriaHash ?? milestone.acceptanceCriteriaHash ?? 'Unavailable'}</dd>
                </div>
              </dl>
            )}
            {selection && !selection.evidenceHash && (
              <button type="button" className="button button--secondary" disabled={hashing} onClick={() => void calculateHash()}>
                {hashing ? 'Calculating SHA-256…' : 'Calculate SHA-256'}
              </button>
            )}
          </div>

          {selection?.evidenceHash && !reviewCaseId && (
            <div className="space-y-2" data-vnext-wizard-review>
              <h4 className="m-0">Review on-chain commitment</h4>
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="muted">Campaign / milestone</dt>
                  <dd>
                    {campaignId} / {milestone.milestoneId}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Current / next revision</dt>
                  <dd>
                    {preflight.data?.currentRevision.toString() ?? milestone.evidenceRevision} / {preflight.data ? (preflight.data.currentRevision + 1n).toString() : 'checking'}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Creator wallet</dt>
                  <dd className="font-mono break-all">{account.address}</dd>
                </div>
                <div>
                  <dt className="muted">Correction policy</dt>
                  <dd>Maximum {preflight.data?.maximumCorrections.toString() ?? '…'} correction</dd>
                </div>
              </dl>
              <p className="font-mono break-all text-xs m-0">SHA-256 {selection.evidenceHash}</p>
              <label className="text-sm flex gap-2 items-start">
                <input type="checkbox" checked={selection.confirmed} onChange={(event) => setSelection((current) => (current ? { ...current, confirmed: event.target.checked } : current))} />
                Commit this exact SHA-256 on-chain and request wallet confirmation.
              </label>
              <button type="button" className="button button--primary" disabled={!canSend || transaction.busy} onClick={() => void submitOnChain()}>
                Submit on-chain
              </button>
              {preflight.data?.reason && !preflight.data.ready && (
                <p className="text-xs text-[var(--ink-subtle)] m-0" data-vnext-wizard-preflight>
                  {preflight.data.reason}
                </p>
              )}
            </div>
          )}

          {(lockedSubmission?.txHash || transaction.txHash) && <p className="font-mono break-all text-xs m-0">Transaction {lockedSubmission?.txHash ?? transaction.txHash}</p>}
          {canonicalTargetHash && !reviewCaseId && (
            <p className="text-sm muted m-0">{lockedSubmission ? `Receipt ${receiptConfirmed ? 'confirmed' : 'pending'}; ` : ''}waiting for the indexed canonical MilestoneEvidenceSubmitted. This does not send another transaction.</p>
          )}

          {reviewCaseId && canonicalHash && (
            <div className="space-y-2" data-vnext-wizard-upload>
              <h4 className="m-0">Upload private evidence</h4>
              <p className="font-mono break-all text-xs m-0">Review Case {reviewCaseId}</p>
              <p className="font-mono break-all text-xs m-0">Canonical SHA-256 {canonicalHash}</p>
              {!userId && <p className="monograph-alert">Complete the SIWE session for this Creator wallet before private upload or availability verification.</p>}
              {!selection && <p className="monograph-alert">File bytes are not stored across refresh. Reselect the exact original file and verify its SHA-256 before upload.</p>}
              {selection && !selection.evidenceHash && <p className="monograph-alert">Calculate SHA-256 again to prove the reselected bytes match the canonical commitment.</p>}
              {selection?.evidenceHash && !fileMatchesCanonical && <p className="monograph-alert monograph-alert--error">Selected file bytes do not match the canonical evidence hash.</p>}
              <label className="text-sm block" htmlFor={`vnext-wizard-summary-${milestone.milestoneId}`}>
                Evidence summary
              </label>
              <input id={`vnext-wizard-summary-${milestone.milestoneId}`} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe this milestone evidence" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="button button--primary" disabled={!userId || !fileMatchesCanonical || !summary.trim() || uploading} onClick={() => void upload()}>
                  {uploading ? 'Uploading…' : 'Upload exact file'}
                </button>
                <button type="button" className="button button--secondary" disabled={!userId || verifying || evidence.isFetching} onClick={() => void verifyAvailability()}>
                  Verify availability
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {reviewCaseId && (
        <dl className="grid gap-1 text-sm sm:grid-cols-2" data-vnext-wizard-availability>
          <div>
            <dt className="muted">Review Case</dt>
            <dd className="font-mono break-all">{reviewCaseId}</dd>
          </div>
          <div>
            <dt className="muted">Revision</dt>
            <dd>{canonicalSubmission?.evidenceRevision}</dd>
          </div>
          <div>
            <dt className="muted">Object availability</dt>
            <dd>{evidence.data?.evidence.find((item) => item.evidenceHash.toLowerCase() === canonicalHash?.toLowerCase())?.availability ?? 'UNKNOWN'}</dd>
          </div>
          <div>
            <dt className="muted">Policy status</dt>
            <dd>{evidence.data?.availabilityPolicy.status ?? 'WAITING_FOR_INDEXER'}</dd>
          </div>
          <div>
            <dt className="muted">Upload status</dt>
            <dd>{evidence.data?.evidence.some((item) => item.evidenceHash.toLowerCase() === canonicalHash?.toLowerCase()) ? 'METADATA_PRESENT' : 'NOT_UPLOADED'}</dd>
          </div>
          <div>
            <dt className="muted">Completion</dt>
            <dd>{evidenceReady ? 'READY' : 'ACTION_REQUIRED'}</dd>
          </div>
        </dl>
      )}
      {evidence.data?.availabilityPolicy.status === 'TIMEOUT_RETRY_ELIGIBLE' && <p className="monograph-alert">Upload deadline expired. Do not bypass it; use the protocol-supported timeout/retry path.</p>}
      {(error || transaction.error || evidence.error) && (
        <p className="monograph-alert monograph-alert--error" role="alert">
          {error ?? transaction.error ?? getErrorMessage(evidence.error)}
        </p>
      )}
    </section>
  );
}
