import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import { getErrorMessage } from '../../../lib/api/error';
import type { VNextCampaignProjection, VNextDeployment } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { displayVNextTokenAmount, vnextRefundDashboardState } from './vnext-refund-flow';
import { useVNextTransaction } from './vnext-transaction';

const campaignAbi = campaignArtifact.abi as Abi;
const CAMPAIGN_REFUNDING = 5;
const CAMPAIGN_REFUNDING_REMAINDER = 6;
const REFUND_BATCH_SIZE = 50n;

const refundStatusLabels = {
  READY_TO_CLAIM: 'Refund đã được tính và contract simulation cho phép claim.',
  SUBMITTED: 'Transaction đã được submit; chưa phải refund hoàn tất.',
  RECEIPT_CONFIRMED: 'Receipt thành công; đang chờ canonical indexer.',
  INDEXING: 'Đang chờ BackerRefundClaimed được index canonical.',
  REFUNDED: 'Refund đã được xác nhận trong indexed projection.',
  FAILED: 'Refund transaction thất bại.',
  UNAVAILABLE: 'Refund chưa sẵn sàng cho ví hiện tại.',
} as const;

export function VNextRefundDashboard({
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
  const campaignNumber = /^[0-9]+$/.test(campaignId) ? BigInt(campaignId) : null;
  const correctChain = account.chainId === deployment.chainId;

  const contractPosition = useQuery({
    queryKey: ['vnext-refund-contract-position', campaignId, account.address, deployment.campaignEscrow],
    enabled: Boolean(client && account.address && deployment.campaignEscrow && campaignNumber !== null),
    queryFn: async () => {
      if (!client || !account.address || !deployment.campaignEscrow || campaignNumber === null) {
        throw new Error('Backer refund RPC is unavailable.');
      }
      const [contribution, entitlement, claimed, allocationsFrozen, refundPool, refundSnapshot] = await Promise.all([
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'contributionOf', args: [campaignNumber, account.address] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'refundEntitlement', args: [campaignNumber, account.address] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'refundClaimed', args: [campaignNumber, account.address] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'refundAllocationsFrozen', args: [campaignNumber] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'campaignRefundPool', args: [campaignNumber] }),
        client.readContract({ address: deployment.campaignEscrow, abi: campaignAbi, functionName: 'campaignRefundSnapshot', args: [campaignNumber] }),
      ]);
      return {
        contribution: BigInt(contribution as bigint),
        entitlement: BigInt(entitlement as bigint),
        claimed: Boolean(claimed),
        allocationsFrozen: Boolean(allocationsFrozen),
        refundPool: BigInt(refundPool as bigint),
        refundSnapshot: BigInt(refundSnapshot as bigint),
      };
    },
    retry: false,
  });

  const indexedPositions = useQuery({
    queryKey: ['vnext-indexed-refund-position', campaignId, account.address],
    queryFn: ({ signal }) => campaignApi.vnextBackerPosition(campaignId, signal),
    enabled: Boolean(userId && account.address),
    retry: false,
    refetchInterval: query => {
      if (!contractPosition.data?.claimed || query.state.error) return false;
      const position = query.state.data?.find(
        item => item.backerAddress.toLowerCase() === account.address?.toLowerCase(),
      );
      return position?.indexedRefundClaimed ? false : 2_000;
    },
  });
  const indexedPosition = indexedPositions.data?.find(
    position => position.backerAddress.toLowerCase() === account.address?.toLowerCase(),
  );

  const claimPreflight = useQuery({
    queryKey: [
      'vnext-refund-claim-preflight',
      campaignId,
      account.address,
      account.chainId,
      contractPosition.data?.allocationsFrozen,
      contractPosition.data?.contribution.toString(),
      contractPosition.data?.claimed,
    ],
    enabled: Boolean(
      client
      && account.address
      && correctChain
      && deployment.campaignEscrow
      && campaignNumber !== null
      && campaign.state === CAMPAIGN_REFUNDING
      && contractPosition.data?.allocationsFrozen
      && contractPosition.data.contribution > 0n
      && !contractPosition.data.claimed
    ),
    queryFn: async () => {
      if (!client || !account.address || !deployment.campaignEscrow || campaignNumber === null) {
        throw new Error('Claim simulation is unavailable.');
      }
      await client.simulateContract({
        address: deployment.campaignEscrow,
        abi: campaignAbi,
        functionName: 'claimRefund',
        args: [campaignNumber],
        account: account.address,
      });
      return true;
    },
    retry: false,
  });

  const refreshContractPosition = () => {
    void contractPosition.refetch();
  };
  const refreshRefund = () => {
    void Promise.all([contractPosition.refetch(), indexedPositions.refetch()]).then(onRefresh);
  };
  const transaction = useVNextTransaction(refreshRefund, refreshContractPosition);
  const refundState = vnextRefundDashboardState({
    campaignState: campaign.state,
    walletConnected: Boolean(account.address),
    correctChain,
    rpcAvailable: Boolean(client && !contractPosition.error && (!account.address || contractPosition.data)),
    allocationsFrozen: contractPosition.data?.allocationsFrozen ?? false,
    contribution: contractPosition.data?.contribution ?? 0n,
    refundClaimed: contractPosition.data?.claimed ?? false,
    indexedRefundClaimed: indexedPosition?.indexedRefundClaimed ?? false,
    indexedRefunded: BigInt(indexedPosition?.indexedRefunded ?? '0'),
    simulationReady: claimPreflight.data === true,
    simulationPending: claimPreflight.fetchStatus === 'fetching',
    simulationError: claimPreflight.error ? getErrorMessage(claimPreflight.error) : undefined,
    transactionAction: transaction.action,
    transactionBusy: transaction.busy,
    transactionStage: transaction.stage,
  });
  const entitlement = !account.address
    ? 'Kết nối ví để xem'
    : !contractPosition.data
      ? 'Đang tải…'
      : !contractPosition.data.allocationsFrozen
        ? 'Chưa tính — allocation chưa frozen'
        : displayVNextTokenAmount(contractPosition.data.entitlement, deployment.tokenDecimals);
  const displayStatus = account.address && contractPosition.isPending ? 'LOADING' : refundState.status;
  const showRefundActions = campaign.state === CAMPAIGN_REFUNDING
    || campaign.state === CAMPAIGN_REFUNDING_REMAINDER;
  const siweReason = userId ? undefined : 'Liên kết ví bằng SIWE để gửi transaction từ giao diện này.';

  return (
    <section className="monograph-card space-y-4" aria-labelledby="vnext-refund-dashboard-title" data-vnext-refund-dashboard>
      <div className="space-y-1">
        <span className="monograph-card__kicker">BACKER REFUND DASHBOARD</span>
        <h2 id="vnext-refund-dashboard-title" className="monograph-card__title">Refund của bạn</h2>
        <p className="monograph-card__desc">Contract quyết định entitlement; indexed projection xác nhận refund canonical.</p>
      </div>

      <div className="rounded border border-[var(--border-hairline)] bg-[var(--paper-bone)] p-3">
        <span className="text-xs text-[var(--ink-subtle)]">Connected Backer wallet</span>
        <p className="font-mono text-sm break-all m-0">{account.address ?? 'Chưa kết nối ví'}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="muted">Bạn đã đóng góp</dt><dd>{displayVNextTokenAmount(contractPosition.data?.contribution, deployment.tokenDecimals)}</dd></div>
        <div><dt className="muted">Campaign funding</dt><dd>{displayVNextTokenAmount(campaign.raised, deployment.tokenDecimals)}</dd><small>Goal {displayVNextTokenAmount(campaign.goal, deployment.tokenDecimals)}</small></div>
        <div><dt className="muted">Đã giải ngân Creator</dt><dd>{displayVNextTokenAmount(campaign.paidOut, deployment.tokenDecimals)}</dd></div>
        <div><dt className="muted">Refund pool</dt><dd>{displayVNextTokenAmount(contractPosition.data?.refundPool, deployment.tokenDecimals)}</dd></div>
      </dl>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="muted">Refund entitlement</dt><dd>{entitlement}</dd></div>
        <div><dt className="muted">Allocation</dt><dd>{contractPosition.data?.allocationsFrozen ? 'FROZEN' : 'PENDING'}</dd></div>
        <div><dt className="muted">Claimed on-chain</dt><dd>{contractPosition.data?.claimed ? 'YES' : 'NO'}</dd></div>
        <div><dt className="muted">Actual refunded · indexed</dt><dd>{displayVNextTokenAmount(indexedPosition?.indexedRefunded, deployment.tokenDecimals)}</dd></div>
      </dl>
      {contractPosition.data && (
        <p className="text-xs text-[var(--ink-subtle)] m-0">
          Refund snapshot {displayVNextTokenAmount(contractPosition.data.refundSnapshot, deployment.tokenDecimals)} · indexed block {indexedPosition?.lastBlockNumber ?? 'chưa có'}.
        </p>
      )}

      {!account.address && <p className="monograph-alert">Kết nối ví Backer để đọc contribution và refund entitlement.</p>}
      {account.address && contractPosition.isPending && <p role="status" className="muted">Đang tải refund position từ contract…</p>}
      {contractPosition.error && <p role="alert" className="monograph-alert monograph-alert--error">RPC unavailable: {getErrorMessage(contractPosition.error)}</p>}
      {indexedPositions.error && <p role="alert" className="monograph-alert monograph-alert--error">Indexed refund projection unavailable: {getErrorMessage(indexedPositions.error)}</p>}
      {account.address && contractPosition.data?.contribution === 0n && <p className="muted">Ví hiện tại chưa có contribution trong campaign này.</p>}

      <div className="rounded border border-[var(--border-hairline)] p-3 space-y-1" aria-live="polite">
        <strong>{displayStatus}</strong>
        <p className="text-sm text-[var(--ink-subtle)] m-0">{displayStatus === 'LOADING' ? 'Đang đọc canonical refund state.' : refundStatusLabels[refundState.status]}</p>
        {transaction.txHash && <code className="block text-xs break-all">{transaction.txHash}</code>}
      </div>

      {showRefundActions ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <button
              type="button"
              className="button button--secondary"
              disabled={!refundState.allocation.ready || transaction.busy || !userId || campaignNumber === null}
              onClick={() => {
                if (campaignNumber === null) return;
                void transaction.send('campaign', 'freezeRefundAllocations', [campaignNumber, REFUND_BATCH_SIZE], { waitForIndexer: false });
              }}
            >
              {contractPosition.data?.allocationsFrozen ? 'Allocation đã frozen' : `Xử lý allocation batch (${REFUND_BATCH_SIZE})`}
            </button>
            {!refundState.allocation.ready && refundState.allocation.reason && <p className="text-xs text-[var(--ink-subtle)] m-0">{refundState.allocation.reason}</p>}
            {refundState.allocation.ready && siweReason && <p className="text-xs text-[var(--ink-subtle)] m-0">{siweReason}</p>}
          </div>
          <div className="space-y-1">
            <button
              type="button"
              className="button button--primary"
              disabled={!refundState.claim.ready || transaction.busy || !userId || campaignNumber === null}
              onClick={() => {
                if (campaignNumber === null) return;
                void transaction.send('campaign', 'claimRefund', [campaignNumber]);
              }}
            >
              Claim Refund
            </button>
            {!refundState.claim.ready && refundState.claim.reason && <p className="text-xs text-[var(--ink-subtle)] m-0">{refundState.claim.reason}</p>}
            {refundState.claim.ready && siweReason && <p className="text-xs text-[var(--ink-subtle)] m-0">{siweReason}</p>}
          </div>
        </div>
      ) : (
        <p className="muted">Campaign chưa ở trạng thái REFUNDING; không có refund action hợp lệ.</p>
      )}

      {transaction.error && <p role="alert" className="monograph-alert monograph-alert--error">{transaction.error}</p>}
    </section>
  );
}
