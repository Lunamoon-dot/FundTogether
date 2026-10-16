import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import type { Address } from 'viem';
import { listEditionsWallets } from '../../../lib/api/reward';
import type { EditionsChain, EditionsDeployment, EditionsEntitlement } from '../../../lib/api/editions';
import type { EditionsTransactionRecord } from '../editions-transaction-recovery';
import { EditionsTransactionStatus } from './EditionsTransactionStatus';

export type PledgeReadiness =
  | 'READY'
  | 'SIGN_IN_REQUIRED'
  | 'WALLET_REQUIRED'
  | 'WRONG_CHAIN'
  | 'ACCOUNT_NOT_LINKED'
  | 'INSUFFICIENT_BALANCE'
  | 'ALREADY_PLEDGED'
  | 'ORPHANED_ENTITLEMENT'
  | 'NOT_FUNDING'
  | 'INDEXER_PENDING'
  | 'READ_FAILED'
  | 'CHECKING'
  | 'TRANSACTION_PENDING';

function money(value: string) {
  return `${formatUnits(BigInt(value), 6)} MockUSDC`;
}

function readinessCopy(readiness: PledgeReadiness, price: string) {
  switch (readiness) {
    case 'SIGN_IN_REQUIRED': return 'Đăng nhập tài khoản trước khi pledge.';
    case 'WALLET_REQUIRED': return 'Kết nối ví đã liên kết với tài khoản để tiếp tục.';
    case 'WRONG_CHAIN': return 'Chuyển ví sang mạng local 31339 trước khi ký.';
    case 'ACCOUNT_NOT_LINKED': return 'Ví hiện tại chưa được liên kết bằng chữ ký với tài khoản này.';
    case 'INSUFFICIENT_BALANCE': return `Số dư MockUSDC chưa đủ ${money(price)}.`;
    case 'ALREADY_PLEDGED': return 'Ví này đã có entitlement cho campaign; không pledge lần thứ hai.';
    case 'ORPHANED_ENTITLEMENT': return 'Khoản pledge cũ thuộc stream không còn canonical. Đây không phải entitlement hiện tại; cần đối chiếu trước khi pledge lại.';
    case 'NOT_FUNDING': return 'Campaign không ở trạng thái FUNDING; pledge đang bị khóa.';
    case 'INDEXER_PENDING': return 'Campaign chưa có binding canonical hoặc indexer chưa đồng bộ xong.';
    case 'READ_FAILED': return 'Không đọc được wallet, số dư hoặc allowance. Pledge bị khóa để tránh gửi giao dịch khi preflight chưa đầy đủ.';
    case 'CHECKING': return 'Đang kiểm tra account, wallet và số dư MockUSDC…';
    case 'TRANSACTION_PENDING': return 'Giao dịch trước đó chưa được canonical indexer xác nhận.';
    default: return '';
  }
}

export function EditionsPledgePreflight({
  campaignId,
  userId,
  activeId,
  price,
  chain,
  deployment,
  entitlement,
  transaction,
  busy,
  onPledge,
  onReconcile,
}: {
  campaignId: string;
  userId?: string;
  activeId: bigint;
  price: string;
  chain: EditionsChain;
  deployment: EditionsDeployment;
  entitlement: EditionsEntitlement | null;
  transaction: EditionsTransactionRecord | null;
  busy: boolean;
  onPledge: () => void;
  onReconcile: () => void;
}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const funding = chain.status === 'ON_CHAIN_CONFIRMED' && chain.snapshot?.state === 0;
  const wallets = useQuery({
    queryKey: ['reward-editions-wallets', userId],
    queryFn: () => listEditionsWallets(),
    enabled: Boolean(userId && account.address && account.chainId === 31339),
    retry: false,
  });
  const balance = useQuery({
    queryKey: ['reward-editions-token-balance', activeId.toString(), deployment.tokenAddress, account.address],
    queryFn: () => client!.readContract({ address: deployment.tokenAddress as Address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address!] }),
    enabled: Boolean(client && account.address && account.chainId === 31339 && funding),
    retry: false,
  });
  const allowance = useQuery({
    queryKey: ['reward-editions-token-allowance', activeId.toString(), deployment.tokenAddress, deployment.contractAddress, account.address],
    queryFn: () => client!.readContract({ address: deployment.tokenAddress as Address, abi: erc20Abi, functionName: 'allowance', args: [account.address!, deployment.contractAddress as Address] }),
    enabled: Boolean(client && account.address && account.chainId === 31339 && funding),
    retry: false,
  });

  let readiness: PledgeReadiness;
  if (!userId) readiness = 'SIGN_IN_REQUIRED';
  else if (!account.address) readiness = 'WALLET_REQUIRED';
  else if (account.chainId !== 31339) readiness = 'WRONG_CHAIN';
  else if (!chain.snapshot || chain.onchainCampaignId === null) readiness = 'INDEXER_PENDING';
  else if (!funding) readiness = 'NOT_FUNDING';
  else if (entitlement?.access === 'ORPHANED') readiness = 'ORPHANED_ENTITLEMENT';
  else if (entitlement) readiness = 'ALREADY_PLEDGED';
  else if (wallets.isPending || balance.isPending || allowance.isPending) readiness = 'CHECKING';
  else if (wallets.error || balance.error || allowance.error) readiness = 'READ_FAILED';
  else if (!wallets.data?.some(item => item.address.toLowerCase() === account.address!.toLowerCase())) readiness = 'ACCOUNT_NOT_LINKED';
  else if (balance.data !== undefined && balance.data < BigInt(price)) readiness = 'INSUFFICIENT_BALANCE';
  else if (transaction && transaction.stage !== 'failed') readiness = 'TRANSACTION_PENDING';
  else readiness = 'READY';

  const canPledge = readiness === 'READY' && !transaction && !busy;
  const balanceText = balance.data === undefined ? 'Đang kiểm tra số dư' : `${formatUnits(balance.data, 6)} MockUSDC khả dụng`;
  const allowanceText = allowance.data === undefined
    ? 'Đang kiểm tra allowance'
    : allowance.data < BigInt(price)
      ? 'Bước 1/2: approve đúng giá · Bước 2/2: pledge'
      : 'Allowance đã đủ · chỉ cần bước pledge';

  return (
    <section className="editions-pledge-preflight" aria-labelledby={`pledge-preflight-${campaignId}`}>
      <div className="editions-pledge-preflight__summary">
        <div>
          <span className="edition-eyebrow">Backer</span>
          <h2 id={`pledge-preflight-${campaignId}`}>Ủng hộ một PDF tiêu chuẩn</h2>
          <p>Giá cố định {money(price)}. Pledge được giữ trong escrow; entitlement chỉ xuất hiện sau receipt và canonical indexer. Ví có thể yêu cầu phí gas của mạng local.</p>
        </div>
        <strong>{money(price)}</strong>
      </div>

      {readiness !== 'READY' && <p className={`editions-pledge-preflight__message editions-pledge-preflight__message--${readiness.toLowerCase()}`} role={readiness === 'CHECKING' ? 'status' : 'alert'}>{readinessCopy(readiness, price)}</p>}
      {account.address && account.chainId === 31339 && funding && <p className="editions-pledge-preflight__balance">{balanceText} · {allowanceText}</p>}

      {transaction && (
        <EditionsTransactionStatus
          record={transaction}
          busy={busy}
          onReconcile={onReconcile}
          onRetry={onPledge}
        />
      )}

      {canPledge && (
        <button type="button" className="button button--primary" onClick={onPledge}>
          {allowance.data !== undefined && allowance.data < BigInt(price) ? 'Bắt đầu approve rồi pledge' : `Ủng hộ ${money(price)} · một PDF`}
        </button>
      )}
    </section>
  );
}
