import type { TransactionRecord } from '../../transactions/recovery';

const stageCopy: Record<TransactionRecord['stage'], { label: string; detail: string }> = {
  preflight: { label: 'Đang kiểm tra', detail: 'Đang kiểm tra ví, mạng và deployment trước khi ký.' },
  awaiting_signature: { label: 'Chờ ví xác nhận', detail: 'Yêu cầu ký đang mở trong ví đã liên kết.' },
  submitted: { label: 'Đã gửi giao dịch', detail: 'Giao dịch đã có hash; chưa được xem là hoàn tất.' },
  receipt_confirmed: { label: 'Receipt thành công', detail: 'Contract đã nhận giao dịch; đang chờ indexer ghi nhận.' },
  indexing: { label: 'Đang đồng bộ canonical', detail: 'Đang đối chiếu receipt và event với deployment hiện tại.' },
  canonical: { label: 'Đã đồng bộ', detail: 'Indexer đã ghi nhận trạng thái canonical.' },
  failed: { label: 'Cần kiểm tra lại', detail: 'Giao dịch chưa tạo trạng thái canonical; không tự gửi lại.' },
};

export function TransactionStatus({
  record,
  onReconcile,
  onRetry,
  busy = false,
}: {
  record: TransactionRecord | null;
  onReconcile?: () => void;
  onRetry?: () => void;
  busy?: boolean;
}) {
  if (!record) return null;
  const copy = stageCopy[record.stage];
  const canReconcile = Boolean(record.txHash) && record.stage !== 'canonical';
  const canRetry = record.stage === 'failed' || (!record.txHash && record.stage === 'awaiting_signature');

  return (
    <section className={`campaign-transaction-status campaign-transaction-status--${record.stage}`} aria-live="polite">
      <div className="campaign-transaction-status__heading">
        <strong>{copy.label}</strong>
        <span>{record.action}</span>
      </div>
      <p>{record.error || copy.detail}</p>
      {record.txHash && (
        <details>
          <summary>Chi tiết giao dịch</summary>
          <code>{record.txHash}</code>
        </details>
      )}
      <div className="campaign-transaction-status__actions">
        {canReconcile && onReconcile && (
          <button type="button" className="button button--secondary" disabled={busy} onClick={onReconcile}>
            {busy ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái'}
          </button>
        )}
        {canRetry && onRetry && (
          <button type="button" className="button button--primary" disabled={busy} onClick={onRetry}>
            {record.stage === 'awaiting_signature' ? 'Đóng yêu cầu ví cũ rồi thử lại' : 'Kiểm tra điều kiện và thử lại'}
          </button>
        )}
      </div>
    </section>
  );
}
