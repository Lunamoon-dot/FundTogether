import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import type { Address } from 'viem';
import { listTransactionWallets } from '../../api/campaigns';
import type { CampaignChain, DeploymentManifest } from '../../api/campaigns';
import type { TransactionRecord } from '../../transactions/recovery';
import { TransactionStatus } from './TransactionStatus';

export type PledgeReadiness =
  | 'READY'
  | 'SIGN_IN_REQUIRED'
  | 'WALLET_REQUIRED'
  | 'WRONG_CHAIN'
  | 'ACCOUNT_NOT_LINKED'
  | 'INSUFFICIENT_BALANCE'
  | 'FUNDING_EXPIRED'
  | 'INVALID_QUANTITY'
  | 'NOT_FUNDING'
  | 'INDEXER_PENDING'
  | 'READ_FAILED'
  | 'CHECKING'
  | 'TRANSACTION_PENDING';

function money(value: string) {
  return `${formatUnits(BigInt(value), 6)} MockUSDC`;
}

function readinessCopy(readiness: PledgeReadiness, total: string) {
  switch (readiness) {
    case 'SIGN_IN_REQUIRED': return 'Đăng nhập tài khoản trước khi pledge.';
    case 'WALLET_REQUIRED': return 'Kết nối ví đã liên kết với tài khoản để tiếp tục.';
    case 'WRONG_CHAIN': return 'Chuyển ví sang mạng local 31339 trước khi ký.';
    case 'ACCOUNT_NOT_LINKED': return 'Ví hiện tại chưa được liên kết bằng chữ ký với tài khoản này.';
    case 'INSUFFICIENT_BALANCE': return `Số dư MockUSDC chưa đủ ${money(total)}.`;
    case 'FUNDING_EXPIRED': return 'Thời hạn gây quỹ đã kết thúc. Pledge đã bị khóa; chờ Resolver chốt kết quả.';
    case 'INVALID_QUANTITY': return 'Số lượng gói phải là số nguyên dương.';
    case 'NOT_FUNDING': return 'Campaign không ở trạng thái FUNDING; pledge đang bị khóa.';
    case 'INDEXER_PENDING': return 'Campaign chưa có binding canonical hoặc indexer chưa đồng bộ xong.';
    case 'READ_FAILED': return 'Không đọc được wallet, số dư hoặc allowance. Pledge bị khóa để tránh gửi giao dịch khi preflight chưa đầy đủ.';
    case 'CHECKING': return 'Đang kiểm tra account, wallet và số dư MockUSDC…';
    case 'TRANSACTION_PENDING': return 'Giao dịch trước đó chưa được canonical indexer xác nhận.';
    default: return '';
  }
}

export function PledgePreflight({
  campaignId,
  userId,
  activeId,
  price,
  chain,
  deployment,
  transaction,
  busy,
  onPledge,
  onReconcile,
}: {
  campaignId: string;
  userId?: string;
  activeId: bigint;
  price: string;
  chain: CampaignChain;
  deployment: DeploymentManifest;
  transaction: TransactionRecord | null;
  busy: boolean;
  onPledge: (quantity: bigint) => void;
  onReconcile: () => void;
}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const [quantityInput, setQuantityInput] = useState('1');
  const quantity = /^[1-9][0-9]*$/.test(quantityInput) ? BigInt(quantityInput) : null;
  const total = quantity === null ? null : BigInt(price) * quantity;
  const totalText = total?.toString() ?? '0';
  const funding = chain.status === 'ON_CHAIN_CONFIRMED' && chain.snapshot?.state === 0;
  const chainClock = useQuery({
    queryKey: ['campaign-campaign-latest-block-time', activeId.toString(), deployment.contractAddress],
    queryFn: async () => (await client!.getBlock({ blockTag: 'latest' })).timestamp,
    enabled: Boolean(client && funding),
    refetchInterval: 10000,
    retry: false,
  });
  const fundingExpired = Boolean(chain.snapshot?.fundingDeadline && chainClock.data !== undefined
    && chainClock.data >= BigInt(chain.snapshot.fundingDeadline));
  const wallets = useQuery({
    queryKey: ['campaign-campaign-transaction-wallets', userId],
    queryFn: () => listTransactionWallets(),
    enabled: Boolean(userId && account.address && account.chainId === 31339),
    retry: false,
  });
  const balance = useQuery({
    queryKey: ['campaign-campaign-token-balance', activeId.toString(), deployment.tokenAddress, account.address],
    queryFn: () => client!.readContract({ address: deployment.tokenAddress as Address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address!] }),
    enabled: Boolean(client && account.address && account.chainId === 31339 && funding && !fundingExpired),
    retry: false,
  });
  const allowance = useQuery({
    queryKey: ['campaign-campaign-token-allowance', activeId.toString(), deployment.tokenAddress, deployment.contractAddress, account.address],
    queryFn: () => client!.readContract({ address: deployment.tokenAddress as Address, abi: erc20Abi, functionName: 'allowance', args: [account.address!, deployment.contractAddress as Address] }),
    enabled: Boolean(client && account.address && account.chainId === 31339 && funding && !fundingExpired),
    retry: false,
  });

  let readiness: PledgeReadiness;
  if (!userId) readiness = 'SIGN_IN_REQUIRED';
  else if (!account.address) readiness = 'WALLET_REQUIRED';
  else if (account.chainId !== 31339) readiness = 'WRONG_CHAIN';
  else if (!chain.snapshot || chain.onchainCampaignId === null) readiness = 'INDEXER_PENDING';
  else if (!funding) readiness = 'NOT_FUNDING';
  else if (chainClock.isPending) readiness = 'CHECKING';
  else if (chainClock.error) readiness = 'READ_FAILED';
  else if (fundingExpired) readiness = 'FUNDING_EXPIRED';
  else if (quantity === null) readiness = 'INVALID_QUANTITY';
  else if (wallets.isPending || balance.isPending || allowance.isPending) readiness = 'CHECKING';
  else if (wallets.error || balance.error || allowance.error) readiness = 'READ_FAILED';
  else if (!wallets.data?.some(item => item.address.toLowerCase() === account.address!.toLowerCase())) readiness = 'ACCOUNT_NOT_LINKED';
  else if (total !== null && balance.data !== undefined && balance.data < total) readiness = 'INSUFFICIENT_BALANCE';
  else if (transaction && transaction.stage !== 'failed') readiness = 'TRANSACTION_PENDING';
  else readiness = 'READY';

  const canPledge = readiness === 'READY' && quantity !== null && !transaction && !busy;
  const balanceText = balance.data === undefined ? 'Đang kiểm tra số dư' : `${formatUnits(balance.data, 6)} MockUSDC khả dụng`;
  const allowanceText = allowance.data === undefined
    ? 'Đang kiểm tra allowance'
    : total !== null && allowance.data < total
      ? 'Cần approve đủ tổng giá trị · sau đó pledge'
      : 'Allowance đã đủ · chỉ cần pledge';
  const quantityDisabled = busy || Boolean(transaction && transaction.stage !== 'failed');
  const adjustQuantity = (delta: bigint) => {
    const current = quantity ?? 1n;
    const next = current + delta;
    setQuantityInput(next < 1n ? '1' : next.toString());
  };
  async function submitPledge() {
    if (quantity === null || !client || !chain.snapshot) return;
    try {
      const latest = await client.getBlock({ blockTag: 'latest' });
      if (latest.timestamp >= BigInt(chain.snapshot.fundingDeadline)) {
        await chainClock.refetch();
        return;
      }
    } catch {
      await chainClock.refetch();
      return;
    }
    onPledge(quantity);
  }

  return (
    <section className="campaign-pledge-preflight" aria-labelledby={`pledge-preflight-${campaignId}`}>
      <div className="campaign-pledge-preflight__summary">
        <div>
          <span className="campaign-eyebrow">Backer</span>
          <h2 id={`pledge-preflight-${campaignId}`}>Ủng hộ gói PDF tiêu chuẩn</h2>
        </div>
        <strong>{total === null ? '—' : money(totalText)}</strong>
      </div>

      <div className="campaign-pledge-preflight__quantity">
        <label htmlFor={`pledge-quantity-${campaignId}`}>Số lượng gói</label>
        <div className="campaign-pledge-preflight__stepper" role="group" aria-label="Điều chỉnh số lượng gói">
          <button
            type="button"
            className="campaign-pledge-preflight__stepper-button"
            aria-label="Giảm số lượng gói"
            disabled={quantityDisabled || quantity === 1n}
            onClick={() => adjustQuantity(-1n)}
          >
            −
          </button>
          <input
            id={`pledge-quantity-${campaignId}`}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={quantityInput}
            disabled={quantityDisabled}
            onChange={event => setQuantityInput(event.target.value)}
          />
          <button
            type="button"
            className="campaign-pledge-preflight__stepper-button"
            aria-label="Tăng số lượng gói"
            disabled={quantityDisabled}
            onClick={() => adjustQuantity(1n)}
          >
            +
          </button>
        </div>
        <span>Tổng: {total === null ? '—' : money(totalText)}</span>
      </div>

      {readiness !== 'READY' && <p className={`campaign-pledge-preflight__message campaign-pledge-preflight__message--${readiness.toLowerCase()}`} role={readiness === 'CHECKING' ? 'status' : 'alert'}>{readinessCopy(readiness, totalText)}</p>}
      {account.address && account.chainId === 31339 && funding && !fundingExpired && <p className="campaign-pledge-preflight__balance">{balanceText} · {allowanceText}</p>}

      {transaction && (
        <TransactionStatus
          record={transaction}
          busy={busy}
          onReconcile={onReconcile}
          onRetry={() => { if (quantity !== null) onPledge(quantity); }}
        />
      )}

      {canPledge && (
        <button type="button" className="button button--primary" onClick={() => void submitPledge()}>
          {allowance.data !== undefined && total !== null && allowance.data < total ? 'Bắt đầu approve rồi pledge' : `Ủng hộ ${quantity.toString()} gói · ${money(totalText)}`}
        </button>
      )}
    </section>
  );
}
