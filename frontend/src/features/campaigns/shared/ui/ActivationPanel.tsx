import { formatUnits } from 'viem';
import type { CampaignChain, DeploymentManifest, CampaignTerms } from '../../api/campaigns';
import type { TransactionRecord } from '../../transactions/recovery';
import { TransactionStatus } from './TransactionStatus';

function money(value: string) {
  return `${formatUnits(BigInt(value), 6)} MockUSDC`;
}

function chainLabel(chain?: CampaignChain) {
  if (!chain) return { label: 'Đang kiểm tra phát hành', detail: 'Đang đọc trạng thái canonical từ contract và indexer.' };
  if (chain.status === 'ORPHANED') return { label: 'Cần đối chiếu giao dịch', detail: 'Có dấu vết giao dịch nhưng chưa có binding canonical hợp lệ; chưa mở pledge.' };
  if (chain.status === 'NOT_PUBLISHED') return { label: 'Chưa kích hoạt on-chain', detail: 'Hồ sơ đã duyệt nhưng chưa có campaign canonical trên contract.' };
  switch (chain.snapshot?.state) {
    case 0: return { label: 'Đang gây quỹ', detail: 'Campaign đã được indexer xác nhận và Backer có thể pledge.' };
    case 1: return { label: 'Đang sản xuất', detail: 'Gây quỹ đã hoàn tất; Creator đang chuẩn bị bằng chứng.' };
    case 2: return { label: 'Chờ duyệt PDF', detail: 'Bằng chứng đã gửi và đang chờ Resolver.' };
    case 3: return { label: 'PDF đã duyệt', detail: 'Đang chờ hết challenge window hoặc xử lý tranh chấp.' };
    case 4: return { label: 'Đang hoàn tiền', detail: 'Contract đã mở refund; Backer tự claim khoản của mình.' };
    case 5: return { label: 'Chờ Resolver chốt hoàn thành', detail: 'Creator đã gửi requestCompletion; Resolver kiểm tra dossier và quyết định, không có countdown cố định.' };
    case 6: return { label: 'Đã hoàn thành · chờ claim surplus', detail: 'Creator nhận đúng goal; Backer tự chọn nhận hoặc gửi phần surplus của mình.' };
    default: return { label: 'Đã kích hoạt on-chain', detail: 'Binding canonical đã tồn tại; đọc thêm trạng thái contract để tiếp tục.' };
  }
}

export function ActivationPanel({
  mode,
  terms,
  chain,
  transaction,
  busy,
  onRefresh,
  onActivate,
  onReconcile,
}: {
  mode: 'creator' | 'resolver';
  terms?: CampaignTerms;
  chain?: CampaignChain;
  transaction: TransactionRecord | null;
  busy: boolean;
  onRefresh: () => void;
  onActivate: () => void;
  onReconcile: () => void;
}) {
  const state = chainLabel(chain);
  const notPublished = chain?.status === 'NOT_PUBLISHED';
  const orphaned = chain?.status === 'ORPHANED';
  const resolverNeedsToSign = mode === 'resolver' && notPublished && terms && !terms.onchainApproved;
  const creatorCanPublish = mode === 'creator' && notPublished && terms?.onchainApproved;

  return (
    <section className="campaign-activation-panel" aria-labelledby="campaign-activation-title">
      <div className="campaign-activation-panel__header">
        <div>
          <span className="campaign-eyebrow">Activation boundary</span>
          <h2 id="campaign-activation-title">{state.label}</h2>
          <p>{state.detail}</p>
        </div>
        <button type="button" className="button button--quiet" disabled={busy} onClick={onRefresh}>Kiểm tra lại</button>
      </div>

      {terms && (
        <dl className="campaign-activation-panel__terms">
          <div><dt>Cam kết</dt><dd><code>{terms.commitmentHash}</code></dd></div>
          <div><dt>Giá / mục tiêu</dt><dd>{money(terms.price)} / {money(terms.goal)}</dd></div>
          <div><dt>Ví Creator</dt><dd><code>{terms.creatorWallet}</code></dd></div>
        </dl>
      )}

      {orphaned && <p className="campaign-activation-panel__warning" role="alert">Binding có thể đã reorg hoặc thuộc deployment stream cũ. Điều khoản đã duyệt vẫn được giữ, nhưng không tự cho phép tạo campaign mới; hãy đối chiếu receipt và indexer.</p>}
      {orphaned && chain?.bindingTransactionHash && <p>Transaction cần đối chiếu: <code>{chain.bindingTransactionHash}</code></p>}
      {notPublished && terms && !terms.onchainApproved && mode === 'creator' && <p className="campaign-activation-panel__warning">Primary Resolver chưa ký đúng commitment trên chain. Creator chưa thể tạo campaign.</p>}
      {notPublished && terms?.onchainApproved && mode === 'resolver' && <p className="campaign-activation-panel__success" role="status">Primary Resolver đã ký commitment; đang chờ Creator tạo campaign.</p>}

      {transaction && (
        <TransactionStatus record={transaction} busy={busy} onReconcile={onReconcile} onRetry={onActivate} />
      )}

      {!transaction && resolverNeedsToSign && (
        <button type="button" className="button button--primary" disabled={busy} onClick={onActivate}>Ký duyệt đúng commitment trên chain</button>
      )}
      {!transaction && creatorCanPublish && (
        <button type="button" className="button button--primary" disabled={busy} onClick={onActivate}>Tạo campaign trên chain</button>
      )}
      {!transaction && notPublished && terms?.onchainApproved && mode === 'creator' && (
        <p className="campaign-activation-panel__success" role="status">Commitment đã được Resolver ký. Bạn có thể tạo campaign trên contract.</p>
      )}
      {!transaction && notPublished && !terms && <p role="status">Đang tải điều khoản publication đã khóa…</p>}
      {!transaction && chain?.status === 'ON_CHAIN_CONFIRMED' && chain.snapshot?.state === 0 && (
        <p className="campaign-activation-panel__success" role="status">Funding đã mở canonical. Backer có thể pledge theo đúng giá đã khóa.</p>
      )}
      {!transaction && orphaned && <button type="button" className="button button--secondary" disabled={busy} onClick={onReconcile}>Đối chiếu lại transaction</button>}

      <details className="technical-details">
        <summary>Chi tiết deployment</summary>
        <p>
          Contract: <code>{chain?.deployment.contractAddress}</code><br />
          Token: <code>{chain?.deployment.tokenAddress}</code><br />
          Resolver: <code>{chain?.deployment.resolver}</code>
          {chain?.bindingTransactionHash && <><br />Binding transaction: <code>{chain.bindingTransactionHash}</code></>}
        </p>
      </details>
    </section>
  );
}

export type { DeploymentManifest };
