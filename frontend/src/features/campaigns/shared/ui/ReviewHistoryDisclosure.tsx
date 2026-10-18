export interface ReviewHistory {
  outcome: string;
  decisionReason?: string;
  reason?: string;
  reviewedAt?: string;
  commitmentHash?: string;
}

interface ReviewHistoryDisclosureProps {
  reviews: ReviewHistory[];
  className?: string;
}

export function ReviewHistoryDisclosure({ reviews = [], className = '' }: ReviewHistoryDisclosureProps) {
  if (reviews.length === 0) return null;

  return (
    <details className={`review-history-disclosure ${className}`.trim()}>
      <summary>Lịch sử thẩm định ({reviews.length})</summary>
      <ul className="review-history-disclosure__list">
        {reviews.map((r, idx) => {
          const reason = r.decisionReason || r.reason;
          return (
            <li key={idx} className="review-history-disclosure__item">
              <div className="review-history-disclosure__item-header">
                <span className="review-history-disclosure__outcome">{r.outcome}</span>
                {r.reviewedAt && (
                  <span className="review-history-disclosure__time">
                    {new Date(r.reviewedAt).toLocaleString('vi-VN')}
                  </span>
                )}
              </div>
              {reason && (
                <p className="review-history-disclosure__reason">{reason}</p>
              )}
              {r.commitmentHash && (
                <p className="review-history-disclosure__hash">
                  Commitment: <code>{r.commitmentHash.slice(0, 18)}…</code>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
