import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { erc20Abi } from 'viem';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import type { VNextCampaignProjection, VNextDeployment } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import {
  displayVNextFundingAmount,
  parseVNextContributionAmount,
  vnextContributionApprovalRequired,
  vnextContributionEligibility,
  vnextContributionLifecycle,
  vnextFundingProgress,
  vnextFundingSimulationReason,
} from './vnext-funding-flow';
import { vnextStageLabel } from './vnext-actions';
import { useVNextTransaction } from './vnext-transaction';

const campaignAbi = campaignArtifact.abi as Abi;
const tokenAbi = erc20Abi as Abi;
const CAMPAIGN_FUNDING = 1;
const pendingContributionStages = new Set(['wallet_requested', 'submitted', 'receipt_confirmed', 'indexing']);
const campaignStateLabels = [
  'CREATED',
  'FUNDING',
  'FUNDED',
  'MILESTONES_RUNNING',
  'COMPLETED',
  'REFUNDING',
  'REFUNDING_REMAINDER',
  'REFUND_SETTLED',
];

function fundingDeadlineLabel(value: bigint) {
  return new Date(Number(value * 1_000n)).toLocaleString('vi-VN');
}

export function VNextFundingCheckout({
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
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const [amountInput, setAmountInput] = useState('');
  const campaignNumber = /^\d+$/.test(campaignId) ? BigInt(campaignId) : null;
  const tokenDecimals = deployment.tokenDecimals;
  const fundingDeadline = BigInt(campaign.fundingDeadline);
  const indexedRaised = BigInt(campaign.raised);
  const indexedGoal = BigInt(campaign.goal);
  const indexedProgress = vnextFundingProgress(indexedRaised, indexedGoal);
  const cappedPercentage = indexedProgress.percentageHundredths > 10_000n
    ? 10_000n
    : indexedProgress.percentageHundredths;
  const progressWidth = `${cappedPercentage / 100n}.${(cappedPercentage % 100n).toString().padStart(2, '0')}%`;

  const contractPosition = useQuery({
    queryKey: [
      'vnext-funding-checkout-position',
      campaignId,
      account.address,
      deployment.campaignEscrow,
      deployment.tokenAddress,
    ],
    enabled: Boolean(
      client
      && campaignNumber !== null
      && deployment.campaignEscrow
      && deployment.tokenAddress
    ),
    queryFn: async () => {
      if (!client || campaignNumber === null || !deployment.campaignEscrow || !deployment.tokenAddress) {
        throw new Error('Funding checkout RPC is unavailable.');
      }
      const walletReads = account.address
        ? Promise.all([
          client.readContract({
            address: deployment.tokenAddress,
            abi: tokenAbi,
            functionName: 'balanceOf',
            args: [account.address],
          }),
          client.readContract({
            address: deployment.tokenAddress,
            abi: tokenAbi,
            functionName: 'allowance',
            args: [account.address, deployment.campaignEscrow],
          }),
          client.readContract({
            address: deployment.campaignEscrow,
            abi: campaignAbi,
            functionName: 'contributionOf',
            args: [campaignNumber, account.address],
          }),
        ])
        : Promise.resolve([undefined, undefined, undefined] as const);
      const [state, raised, goal, latestBlock, [balance, allowance, contribution]] = await Promise.all([
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'campaignState',
          args: [campaignNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'campaignRaised',
          args: [campaignNumber],
        }),
        client.readContract({
          address: deployment.campaignEscrow,
          abi: campaignAbi,
          functionName: 'campaignGoal',
          args: [campaignNumber],
        }),
        client.getBlock({ blockTag: 'latest' }),
        walletReads,
      ]);
      return {
        state: Number(state),
        raised: BigInt(raised as bigint),
        goal: BigInt(goal as bigint),
        chainTimestamp: latestBlock.timestamp,
        balance: balance === undefined ? undefined : BigInt(balance as bigint),
        allowance: allowance === undefined ? undefined : BigInt(allowance as bigint),
        contribution: contribution === undefined ? undefined : BigInt(contribution as bigint),
      };
    },
    retry: false,
    refetchInterval: campaign.state === CAMPAIGN_FUNDING ? 5_000 : false,
  });

  const indexedPositions = useQuery({
    queryKey: ['vnext-funding-checkout-indexed-position', campaignId, account.address],
    queryFn: ({ signal }) => campaignApi.vnextBackerPosition(campaignId, signal),
    enabled: Boolean(userId && account.address),
    retry: false,
  });
  const indexedPosition = indexedPositions.data?.find(
    position => position.backerAddress.toLowerCase() === account.address?.toLowerCase(),
  );
  const indexedContribution = !account.address || !userId || indexedPositions.isPending
    ? undefined
    : indexedPosition?.indexedContributed ?? '0';

  const refreshContractPosition = () => {
    void contractPosition.refetch();
  };
  const refreshCheckout = () => {
    onRefresh();
    void Promise.all([contractPosition.refetch(), indexedPositions.refetch()]);
  };
  const transaction = useVNextTransaction(refreshCheckout, refreshContractPosition);
  const parsedAmount = tokenDecimals === undefined
    ? { error: 'Deployment manifest chưa xác nhận token decimals.' }
    : parseVNextContributionAmount(amountInput, tokenDecimals);
  const onchainRemaining = contractPosition.data
    ? vnextFundingProgress(contractPosition.data.raised, contractPosition.data.goal).remaining
    : 0n;
  const transactionPending = transaction.action === 'contribute'
    && pendingContributionStages.has(transaction.stage);
  const eligibility = parsedAmount.amount === undefined
    ? { ready: false, reason: parsedAmount.error }
    : vnextContributionEligibility({
      amount: parsedAmount.amount,
      walletConnected: Boolean(account.address),
      correctChain: account.chainId === deployment.chainId,
      fundingState: contractPosition.data?.state,
      chainTimestamp: contractPosition.data?.chainTimestamp,
      fundingDeadline,
      walletBalance: contractPosition.data?.balance,
      remaining: onchainRemaining,
      rpcReady: Boolean(client && contractPosition.data && !contractPosition.error),
      transactionPending,
    });
  const approvalRequired = parsedAmount.amount !== undefined && contractPosition.data?.allowance !== undefined
    ? vnextContributionApprovalRequired(contractPosition.data.allowance, parsedAmount.amount)
    : undefined;

  const contributionPreflight = useQuery({
    queryKey: [
      'vnext-funding-contribution-preflight',
      campaignId,
      account.address,
      account.chainId,
      parsedAmount.amount?.toString(),
      contractPosition.data?.state,
      contractPosition.data?.raised.toString(),
    ],
    enabled: Boolean(
      client
      && account.address
      && userId
      && deployment.campaignEscrow
      && campaignNumber !== null
      && parsedAmount.amount !== undefined
      && eligibility.ready
      && approvalRequired === false
    ),
    queryFn: async () => {
      if (!client || !account.address || !deployment.campaignEscrow || campaignNumber === null || parsedAmount.amount === undefined) {
        throw new Error('Contribution simulation is unavailable.');
      }
      await client.simulateContract({
        address: deployment.campaignEscrow,
        abi: campaignAbi,
        functionName: 'contribute',
        args: [campaignNumber, parsedAmount.amount],
        account: account.address,
      });
      return true;
    },
    retry: false,
    refetchInterval: 5_000,
  });

  const approvalReady = Boolean(
    userId
    && parsedAmount.amount !== undefined
    && eligibility.ready
    && approvalRequired
    && !transaction.busy
  );
  const contributionReady = Boolean(
    userId
    && parsedAmount.amount !== undefined
    && eligibility.ready
    && approvalRequired === false
    && contributionPreflight.data
    && !transaction.busy
  );
  const blockingReason = !userId
    ? 'Liên kết ví bằng SIWE để gửi transaction từ giao diện này.'
    : eligibility.reason
      ?? (approvalRequired === undefined
        ? 'Đang đọc allowance MockUSDC.'
        : approvalRequired
          ? 'Approve đúng số tiền MockUSDC trước khi đóng góp.'
          : contributionPreflight.isFetching
            ? 'Đang mô phỏng contribution với contract.'
            : contributionPreflight.error
              ? vnextFundingSimulationReason(contributionPreflight.error)
              : contributionPreflight.data
                ? undefined
                : 'Contract simulation chưa xác nhận contribution.');

  const approveContribution = async () => {
    if (!approvalReady || parsedAmount.amount === undefined || !deployment.campaignEscrow) return;
    await transaction.send('token', 'approve', [deployment.campaignEscrow, parsedAmount.amount], { waitForIndexer: false });
    refreshContractPosition();
  };
  const contribute = async () => {
    if (!contributionReady || parsedAmount.amount === undefined || campaignNumber === null || !account.address) return;
    const latestPreflight = await contributionPreflight.refetch();
    if (!latestPreflight.data || latestPreflight.error) return;
    await transaction.send('campaign', 'contribute', [campaignNumber, parsedAmount.amount], {
      canonicalEvent: {
        eventName: 'ContributionReceived',
        args: {
          campaignId,
          backer: account.address,
          amount: parsedAmount.amount.toString(),
        },
      },
    });
  };

  const currentState = contractPosition.data?.state ?? campaign.state;
  const fundingStatus = currentState !== CAMPAIGN_FUNDING
    ? campaignStateLabels[currentState] ?? `STATE_${currentState}`
    : contractPosition.data?.chainTimestamp !== undefined && contractPosition.data.chainTimestamp >= fundingDeadline
      ? 'FUNDING_DEADLINE_REACHED'
      : onchainRemaining === 0n
        ? 'TARGET_REACHED · AWAITING FINALIZE_FUNDING'
        : 'FUNDING_OPEN';
  const contributionLifecycle = transaction.action === 'contribute'
    ? vnextContributionLifecycle(transaction.stage)
    : transaction.action === 'approve'
      ? `APPROVAL · ${vnextStageLabel(transaction.stage)}`
      : 'READY';

  return (
    <section className="monograph-card space-y-4" aria-labelledby="vnext-funding-checkout-title" data-vnext-funding-checkout>
      <div className="space-y-1">
        <span className="monograph-card__kicker">BACKER FUNDING CHECKOUT</span>
        <h2 id="vnext-funding-checkout-title" className="monograph-card__title">Đóng góp MockUSDC</h2>
        <p className="monograph-card__desc">Projection hiển thị tiến độ; contract state và simulation quyết định transaction có hợp lệ hay không.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <strong>{displayVNextFundingAmount(indexedRaised, tokenDecimals)} / {displayVNextFundingAmount(indexedGoal, tokenDecimals)}</strong>
          <span>{indexedProgress.percentageLabel}</span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full border border-[var(--border-hairline)] bg-[var(--paper-bone)]"
          role="progressbar"
          aria-label="Campaign funding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Number(cappedPercentage / 100n)}
          aria-valuetext={indexedProgress.percentageLabel}
        >
          <div className="h-full bg-[var(--escrow-bronze)]" style={{ width: progressWidth }} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="muted">Raised · indexed</dt><dd>{displayVNextFundingAmount(indexedRaised, tokenDecimals)}</dd></div>
          <div><dt className="muted">Funding goal</dt><dd>{displayVNextFundingAmount(indexedGoal, tokenDecimals)}</dd></div>
          <div><dt className="muted">Remaining</dt><dd>{displayVNextFundingAmount(indexedProgress.remaining, tokenDecimals)}</dd></div>
          <div><dt className="muted">Funding status</dt><dd>{fundingStatus}</dd></div>
        </dl>
        <p className="text-sm text-[var(--ink-subtle)] m-0">Deadline: {fundingDeadlineLabel(fundingDeadline)}. 100% hiển thị không tự finalize funding hoặc giải ngân Creator.</p>
      </div>

      <div className="rounded border border-[var(--border-hairline)] bg-[var(--paper-bone)] p-3 space-y-2">
        <div>
          <span className="text-xs text-[var(--ink-subtle)]">Connected wallet</span>
          <p className="font-mono text-sm break-all m-0">{account.address ?? 'Chưa kết nối ví'}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="muted">Wallet balance</dt><dd>{displayVNextFundingAmount(contractPosition.data?.balance, tokenDecimals)}</dd></div>
          <div><dt className="muted">Current allowance</dt><dd>{displayVNextFundingAmount(contractPosition.data?.allowance, tokenDecimals)}</dd></div>
          <div><dt className="muted">Bạn đã góp · indexed</dt><dd>{displayVNextFundingAmount(indexedContribution, tokenDecimals)}</dd></div>
        </dl>
        {contractPosition.data?.contribution !== undefined && indexedPosition
          && contractPosition.data.contribution !== BigInt(indexedPosition.indexedContributed) ? (
            <p className="text-xs text-[var(--ink-subtle)] m-0">Contract contribution đã thay đổi; đang chờ projection canonical cập nhật.</p>
          ) : null}
      </div>

      {currentState === CAMPAIGN_FUNDING ? (
        <div className="space-y-3">
          <label className="text-sm block" htmlFor="vnext-contribution-amount">Số MockUSDC muốn đóng góp</label>
          <input
            id="vnext-contribution-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amountInput}
            onChange={event => setAmountInput(event.target.value)}
            placeholder="25.50"
            aria-describedby="vnext-contribution-blocking-reason"
          />
          <div className="flex flex-wrap gap-2">
            {approvalRequired ? (
              <button type="button" className="button button--secondary" disabled={!approvalReady} onClick={() => void approveContribution()}>
                Approve {displayVNextFundingAmount(parsedAmount.amount, tokenDecimals)}
              </button>
            ) : null}
            <button type="button" className="button button--primary" disabled={!contributionReady} onClick={() => void contribute()}>
              Contribute
            </button>
          </div>
          {blockingReason ? <p id="vnext-contribution-blocking-reason" className="text-sm text-[var(--danger)] m-0">{blockingReason}</p> : null}
        </div>
      ) : (
        <p className="muted">Campaign không còn nhận contribution mới.</p>
      )}

      <div className="rounded border border-[var(--border-hairline)] p-3 space-y-1" aria-live="polite">
        <strong>{contributionLifecycle}</strong>
        {transaction.txHash ? <code className="block text-xs break-all">{transaction.txHash}</code> : null}
        {transaction.action === 'contribute' && transaction.stage === 'indexing' ? (
          <button type="button" className="button button--quiet" disabled={transaction.busy} onClick={() => void transaction.reconcile()}>
            Reconcile canonical contribution
          </button>
        ) : null}
      </div>
      {contractPosition.error ? <p role="alert" className="monograph-alert monograph-alert--error">Không đọc được funding state từ RPC.</p> : null}
      {indexedPositions.error ? <p role="alert" className="monograph-alert monograph-alert--error">Không đọc được canonical Backer projection.</p> : null}
      {transaction.error ? <p role="alert" className="monograph-alert monograph-alert--error">{transaction.error}</p> : null}
    </section>
  );
}
