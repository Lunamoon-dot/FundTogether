export interface CommitmentCardItem {
  commitmentHash: string;
  creatorDisplayName?: string;
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
  releaseWindow: { start: string; end: string };
  config: {
    title: string;
    story: string;
    goal: string;
    fundingDuration: number;
    tiers: Array<{
      price: string;
      estimatedDeliveryAt?: string;
      rewardItems: Array<{
        title?: string;
        description: string;
      }>;
    }>;
  };
  decisions: Array<{
    outcome: string;
    reviewedAt: string;
    decisionReason?: string;
  }>;
}

interface EditionsCommitmentCardProps {
  item: CommitmentCardItem;
  amount: (val: string) => string;
  className?: string;
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

export function EditionsCommitmentCard({
  item,
  amount,
  className = '',
}: EditionsCommitmentCardProps) {
  const primaryTier = item.config.tiers[0];
  const primaryItem = primaryTier?.rewardItems[0];
  const latestDecision = item.decisions[0];

  return (
    <section className={`bg-white border border-neutral-200 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs ${className}`}>
      {/* 1. Header */}
      <div className="border-b border-neutral-100 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-900">
            Cam kết tác phẩm & Kế hoạch sản xuất
          </h2>
          {latestDecision && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
              Resolver: {latestDecision.outcome}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          Hồ sơ điều khoản kỹ thuật số đã được đóng băng và thẩm định trước khi mở gây quỹ.
        </p>
      </div>

      {/* 2. Story / Narrative */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          Cốt truyện & Tác phẩm
        </h3>
        <div className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 rounded-lg p-3.5 border border-neutral-100 whitespace-pre-wrap">
          {item.config.story}
        </div>
      </div>

      {/* 3. Deliverable Standard Tier */}
      {primaryItem && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-neutral-900">
              Ấn phẩm số tiêu chuẩn (Standard PDF)
            </h4>
            <span className="text-xs text-neutral-500">
              Digital Download
            </span>
          </div>
          <p className="text-sm text-neutral-600">
            {primaryItem.description}
          </p>
        </div>
      )}

      {/* 4. Three Review Pillars Grid */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          Hồ sơ thẩm định sản xuất
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-neutral-200 p-3.5 bg-neutral-50/30 flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Đề cương</span>
            <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap break-words m-0">
              {item.contentOutline}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 p-3.5 bg-neutral-50/30 flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Kế hoạch ngân sách</span>
            <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap break-words m-0">
              {item.budgetPlan}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 p-3.5 bg-neutral-50/30 flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Kế hoạch bằng chứng</span>
            <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap break-words m-0">
              {item.evidencePlan}
            </p>
          </div>
        </div>
      </div>

      {/* 5. Metrics & Release Deadlines Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 p-3.5 bg-white">
          <span className="block text-xs font-medium uppercase text-neutral-500 mb-1">
            Mục tiêu & Thời gian
          </span>
          <strong className="block text-base font-bold text-neutral-900">
            Mục tiêu: {amount(item.config.goal)}
          </strong>
          <span className="block text-xs text-neutral-500 mt-1">
            Thời hạn: {item.config.fundingDuration / 86400} ngày gây quỹ
          </span>
        </div>

        <div className="rounded-lg border border-neutral-200 p-3.5 bg-white">
          <span className="block text-xs font-medium uppercase text-neutral-500 mb-1">
            Hạn cam kết phát hành
          </span>
          <strong className="block text-base font-bold text-neutral-900">
            {formatDate(item.releaseWindow.end)}
          </strong>
          <span className="block text-xs text-neutral-500 mt-1 font-mono break-all" title={item.releaseWindow.end}>
            Hạn cam kết phát hành PDF (UTC): {item.releaseWindow.end}
          </span>
        </div>

        {primaryTier?.estimatedDeliveryAt && (
          <div className="rounded-lg border border-neutral-200 p-3.5 bg-white sm:col-span-2 lg:col-span-1">
            <span className="block text-xs font-medium uppercase text-neutral-500 mb-1">
              Dự kiến ban đầu
            </span>
            <strong className="block text-base font-bold text-neutral-900">
              {formatDate(primaryTier.estimatedDeliveryAt)}
            </strong>
            <span className="block text-xs text-neutral-500 mt-1 font-mono break-all" title={primaryTier.estimatedDeliveryAt}>
              Ngày dự kiến phát hành PDF (UTC): {primaryTier.estimatedDeliveryAt}
            </span>
          </div>
        )}
      </div>

      {/* 6. Hash & Resolver Decisions Footer */}
      <div className="border-t border-neutral-100 pt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-neutral-500">Mã cam kết:</span>
          <code className="font-mono text-xs bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded border border-neutral-200 break-all select-all">
            {item.commitmentHash}
          </code>
        </div>

        {item.decisions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {item.decisions.map((decision, index) => (
              <div key={index} className="inline-flex items-center gap-1.5 text-xs bg-neutral-100 text-neutral-700 px-2.5 py-1 rounded border border-neutral-200">
                <span className="font-semibold">Resolver: {decision.outcome}</span>
                <span className="text-neutral-500">· {decision.reviewedAt}</span>
                {decision.decisionReason && (
                  <span className="text-neutral-600">— {decision.decisionReason}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
