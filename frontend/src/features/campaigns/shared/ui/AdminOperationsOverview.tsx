import { LifecycleDistributionChart } from './LifecycleDistributionChart';
import { ExceptionList, type ExceptionItem } from './ExceptionList';

export interface AdminOperationsOverviewProps {
  lifecycleCounts: Record<string, number>;
  exceptionItems: ExceptionItem[];
  className?: string;
  id?: string;
}

export function AdminOperationsOverview({
  lifecycleCounts,
  exceptionItems,
  className = '',
  id,
}: AdminOperationsOverviewProps) {
  return (
    <section
      id={id}
      className={`panel admin-overview admin-operations-card ${className}`.trim()}
      aria-labelledby="admin-overview-title"
    >
      <h2 id="admin-overview-title" className="public-sr-only">Tổng quan Vận hành & Vòng đời</h2>

      {/* Operations Overview: 2-column Balanced Grid */}
      <div className="admin-overview__grid">
        <div className="admin-overview__chart-block">
          <h3>Phân bổ trạng thái vòng đời</h3>
          <LifecycleDistributionChart counts={lifecycleCounts} />
        </div>

        <div className="admin-overview__exceptions-block">
          <h3>Ngoại lệ & Hồ sơ cần xử lý ({exceptionItems.length})</h3>
          <ExceptionList items={exceptionItems} />
        </div>
      </div>
    </section>
  );
}
