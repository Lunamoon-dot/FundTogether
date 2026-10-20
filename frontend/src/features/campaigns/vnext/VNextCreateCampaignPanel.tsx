import { useState } from 'react';
import type { VNextDeployment } from '../api/campaigns';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';

function tokenAmount(value: string): bigint | null {
  if (!/^[0-9]+$/.test(value) || value === '0') return null;
  try { return BigInt(value); } catch { return null; }
}

function bytes32(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function deadlineAfterDays(days: string): bigint | null {
  if (!/^[0-9]+$/.test(days) || days === '0') return null;
  try { return (BigInt(Date.now()) / 1000n) + BigInt(days) * 86_400n; } catch { return null; }
}

export function VNextCreateCampaignPanel({ deployment }: { deployment: VNextDeployment }) {
  const transaction = useVNextTransaction();
  const [payoutWallet, setPayoutWallet] = useState('');
  const [goal, setGoal] = useState('');
  const [fundingDays, setFundingDays] = useState('7');
  const [acceptanceCriteriaHash, setAcceptanceCriteriaHash] = useState('');
  const [publicationEvidenceHash, setPublicationEvidenceHash] = useState('');
  const goalValue = tokenAmount(goal);
  const deadline = deadlineAfterDays(fundingDays);
  const ready = Boolean(
    deployment.campaignEscrow
      && /^0x[0-9a-fA-F]{40}$/.test(payoutWallet)
      && goalValue
      && deadline
      && bytes32(acceptanceCriteriaHash)
      && bytes32(publicationEvidenceHash),
  );

  const createCampaign = () => {
    if (!ready || !goalValue || !deadline) return;
    const milestoneBudgets = [goalValue];
    const acceptanceCriteriaHashes = [acceptanceCriteriaHash as `0x${string}`];
    void transaction.send('campaign', 'createCampaign', [
      payoutWallet as `0x${string}`,
      goalValue,
      deadline,
      milestoneBudgets,
      acceptanceCriteriaHashes,
      publicationEvidenceHash as `0x${string}`,
    ]);
  };

  return (
    <section className="monograph-card space-y-3" aria-labelledby="vnext-create-title">
      <span className="monograph-card__kicker">CREATOR PROPOSAL</span>
      <h2 id="vnext-create-title" className="monograph-card__title">Tạo Campaign VNext</h2>
      <p className="text-sm text-[var(--ink-subtle)] m-0">
        Giao dịch tạo campaign đồng thời mở publication Judge case. Campaign chỉ chuyển sang FUNDING sau khi final publication outcome được canonical contract xác nhận.
      </p>
      <label className="text-sm block" htmlFor="vnext-payout-wallet">Payout wallet</label>
      <input id="vnext-payout-wallet" className="font-mono" value={payoutWallet} onChange={event => setPayoutWallet(event.target.value)} placeholder="0x + 40 hex chars" />
      <label className="text-sm block" htmlFor="vnext-goal">Funding goal (MockUSDC token units)</label>
      <input id="vnext-goal" inputMode="numeric" value={goal} onChange={event => setGoal(event.target.value)} placeholder="100000000 = 100 MockUSDC" />
      <label className="text-sm block" htmlFor="vnext-funding-days">Funding duration (whole days)</label>
      <input id="vnext-funding-days" inputMode="numeric" value={fundingDays} onChange={event => setFundingDays(event.target.value)} />
      <label className="text-sm block" htmlFor="vnext-acceptance-hash">Milestone acceptance criteria hash</label>
      <input id="vnext-acceptance-hash" className="font-mono" value={acceptanceCriteriaHash} onChange={event => setAcceptanceCriteriaHash(event.target.value)} placeholder="0x + 64 hex chars" />
      <label className="text-sm block" htmlFor="vnext-publication-hash">Publication evidence hash</label>
      <input id="vnext-publication-hash" className="font-mono" value={publicationEvidenceHash} onChange={event => setPublicationEvidenceHash(event.target.value)} placeholder="0x + 64 hex chars" />
      <p className="text-sm text-[var(--ink-subtle)] m-0">MVP local scope dùng một milestone có budget đúng bằng goal; file/evidence bytes vẫn nằm ngoài chain.</p>
      <button type="button" className="button button--primary" disabled={!ready || transaction.busy} onClick={createCampaign}>Tạo campaign và mở Judge case</button>
      {!ready && <p className="text-sm text-[var(--danger)] m-0">Điền payout wallet, số nguyên token unit, thời hạn dương và ba hash bytes32 hợp lệ.</p>}
      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </section>
  );
}
