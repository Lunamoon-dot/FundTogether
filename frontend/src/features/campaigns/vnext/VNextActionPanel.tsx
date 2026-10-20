import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import type {
  VNextCampaignProjection,
  VNextDeployment,
  VNextMilestoneProjection,
} from '../api/campaigns';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';

const CAMPAIGN_FUNDING = 1;
const CAMPAIGN_MILESTONES_RUNNING = 3;
const CAMPAIGN_REFUNDING = 5;
const CAMPAIGN_REFUNDING_REMAINDER = 6;
const MILESTONE_PAYABLE = 8;
const campaignAbi = campaignArtifact.abi as Abi;

function tokenAmount(value: string): bigint | null {
  if (!/^[0-9]+$/.test(value) || value === '0') return null;
  try { return BigInt(value); } catch { return null; }
}

export function VNextActionPanel({
  campaignId,
  userId: _userId,
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
  const [evidenceHash, setEvidenceHash] = useState('');
  const creator = Boolean(transaction.address && transaction.address.toLowerCase() === campaign.creator.toLowerCase());
  const amountValue = tokenAmount(amount);
  const fundingEnded = BigInt(Math.floor(Date.now() / 1000)) >= BigInt(campaign.fundingDeadline);
  const firstMilestone = milestones[0];
  const campaignNumber = /^[0-9]+$/.test(campaignId) ? BigInt(campaignId) : null;
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

  const sendContribution = () => {
    if (!amountValue || !deployment.campaignEscrow || campaignNumber === null) return;
    void transaction.send('campaign', 'contribute', [campaignNumber, amountValue]);
  };

  const approveContribution = () => {
    if (!amountValue || !deployment.campaignEscrow) return;
    void transaction.send('token', 'approve', [deployment.campaignEscrow, amountValue]);
  };

  const submitEvidence = () => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(evidenceHash) || campaignNumber === null) return;
    void transaction.send('campaign', 'submitMilestoneEvidence', [campaignNumber, 0n, evidenceHash as `0x${string}`]);
  };

  return (
    <section className="monograph-card space-y-3" aria-labelledby="vnext-actions-title">
      <span className="monograph-card__kicker">PERMISSIONLESS ACTIONS</span>
      <h2 id="vnext-actions-title" className="monograph-card__title">Thao tác on-chain</h2>
      <p className="text-sm text-[var(--ink-subtle)] m-0">Mọi nút dưới đây gọi trực tiếp contract VNext. Backend chỉ xác nhận receipt và indexed event.</p>

      {campaign.state === 0 && campaign.publicationOutcome !== null && campaign.publicationOutcome !== 0 && (
        <div data-vnext-action="finalizePublication">
          <p className="text-sm text-[var(--ink-subtle)] m-0">Publication Judge case đã có outcome; bất kỳ caller nào cũng có thể materialize state tiếp theo từ contract.</p>
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

      {campaign.state === CAMPAIGN_FUNDING && (
        <div data-vnext-action="finalizeFunding">
          <button type="button" className="button button--secondary" disabled={!fundingEnded || transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'finalizeFunding', [campaignNumber!])}>Chốt funding sau deadline</button>
          {!fundingEnded && <p className="text-sm text-[var(--ink-subtle)] m-0">Funding chỉ đóng khi thời gian funding hết hạn.</p>}
        </div>
      )}

      {creator && campaign.state === CAMPAIGN_MILESTONES_RUNNING && firstMilestone && (
        <div className="space-y-2" data-vnext-action="submitMilestoneEvidence">
          <label className="text-sm block" htmlFor="vnext-evidence-hash">Evidence hash cho milestone 0</label>
          <input id="vnext-evidence-hash" className="font-mono" value={evidenceHash} onChange={event => setEvidenceHash(event.target.value)} placeholder="0x + 64 hex chars" />
          <button type="button" className="button button--primary" disabled={!/^0x[0-9a-fA-F]{64}$/.test(evidenceHash) || transaction.busy} onClick={submitEvidence}>Submit evidence</button>
        </div>
      )}

      {firstMilestone?.state === MILESTONE_PAYABLE && (
        <button type="button" className="button button--primary" disabled={transaction.busy || campaignNumber === null} onClick={() => void transaction.send('campaign', 'payMilestone', [campaignNumber!, BigInt(firstMilestone.milestoneId)])}>Payout milestone 0</button>
      )}

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
