export type TransactionStage = 'idle' | 'wallet' | 'submitted' | 'receipt' | 'indexed'
const stages: TransactionStage[] = ['wallet', 'submitted', 'receipt', 'indexed']
const labels = ['Chờ ví', 'Đã gửi', 'Receipt thành công', 'Đã index']

export function TransactionSteps({ stage, operation, hash, receiptBlock, approval = false }: {
  stage: TransactionStage; operation: string; hash?: string; receiptBlock?: string; approval?: boolean
}) {
  const position = stages.indexOf(stage)
  return <div className="transaction-progress" aria-label={`Tiến trình ${operation}`}>
    <p>{operation}</p>
    <ol className="transaction-steps">
      {stages.map((item, index) => <li key={item} className={index < position || stage === 'indexed' ? 'step-done' : index === position ? 'step-current' : ''}
        aria-current={index === position ? 'step' : undefined}>{approval && index === 3 ? 'Tiếp theo: ký đóng góp' : labels[index]}</li>)}
    </ol>
    <p className="muted" role="status">{stage === 'idle' ? 'Đối chiếu điều kiện trước khi gửi yêu cầu ký.'
      : stage === 'wallet' ? 'Ký hoặc từ chối yêu cầu trong ví. Chưa có hash giao dịch.'
        : stage === 'submitted' ? 'Đã có hash; đang chờ receipt. Chưa xác nhận thành công.'
          : stage === 'receipt' ? `Receipt đã kiểm tra${receiptBlock ? ` tại block ${receiptBlock}` : ''}; ${approval ? 'tiếp theo cần ký đóng góp.' : 'chờ indexer ghi nhận đúng sự kiện.'}`
            : 'Đã xác nhận receipt và sự kiện trong dữ liệu indexer.'}</p>
    {hash && <p className="public-wallet-address">Hash: <code>{hash}</code></p>}
    {approval && <p className="muted">Cấp quyền token chưa chuyển tiền vào campaign. Chỉ giao dịch đóng góp tiếp theo mới cần indexer ghi nhận.</p>}
  </div>
}
