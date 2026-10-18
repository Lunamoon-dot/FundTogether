export type TransactionPhase = 'idle' | 'signing' | 'submitted' | 'confirmed' | 'indexed' | 'error';

interface TransactionLifecycleProps {
  phase: TransactionPhase;
  hash?: string;
  error?: string;
  className?: string;
}

export function TransactionLifecycle({
  phase,
  hash,
  error,
  className = '',
}: TransactionLifecycleProps) {
  if (phase === 'idle') return null;

  const steps = [
    { key: 'signing', label: 'Yêu cầu ký' },
    { key: 'submitted', label: 'Đã gửi' },
    { key: 'confirmed', label: 'Đã xác nhận' },
    { key: 'indexed', label: 'Đã đồng bộ' },
  ];

  function getStepTone(stepKey: string): 'done' | 'current' | 'pending' {
    if (phase === 'error') return 'pending';
    if (phase === 'signing') {
      if (stepKey === 'signing') return 'current';
      return 'pending';
    }
    if (phase === 'submitted') {
      if (stepKey === 'signing') return 'done';
      if (stepKey === 'submitted') return 'current';
      return 'pending';
    }
    if (phase === 'confirmed') {
      if (stepKey === 'signing' || stepKey === 'submitted') return 'done';
      if (stepKey === 'confirmed') return 'done';
      return 'current';
    }
    if (phase === 'indexed') {
      return 'done';
    }
    return 'pending';
  }

  return (
    <div className={`transaction-lifecycle ${className}`.trim()} role="status" aria-label="Tiến trình giao dịch">
      <div className="transaction-lifecycle__header">
        <span className="transaction-lifecycle__title">Trạng thái giao dịch</span>
        {hash && (
          <span className="transaction-lifecycle__hash">
            Tx: <code>{hash.slice(0, 10)}…{hash.slice(-8)}</code>
          </span>
        )}
      </div>

      <ol className="transaction-lifecycle__steps">
        {steps.map(step => {
          const tone = getStepTone(step.key);
          return (
            <li
              key={step.key}
              className={`transaction-lifecycle__step transaction-lifecycle__step--${tone}`}
            >
              <span className="transaction-lifecycle__step-dot" aria-hidden="true" />
              <span className="transaction-lifecycle__step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="toast toast--error transaction-lifecycle__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
