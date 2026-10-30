import type {
  VNextIndexerStatus,
  VNextMilestoneProjection,
  VNextReviewWithAssignments,
} from '../api/campaigns';

const MAX_COURTS_PER_REVIEW_CASE = 5;
const courtVerdicts = ['PENDING', 'PASS', 'FAIL', 'INVALID'];
const roundVerdicts = ['PENDING', 'PASS', 'FAIL', 'INVALID', 'TIED'];
const finalOutcomes = ['PENDING', 'FINAL_PASS', 'VERDICT_FAIL', 'PROTOCOL_FAIL'];
const milestoneStates = ['PENDING', 'SUBMITTED', 'REVIEW_ENROLLMENT', 'BASE_REVIEW', 'RETRY_PENDING', 'PROVISIONAL_RULING', 'APPEAL_WINDOW', 'FINAL_RULING', 'PAYABLE', 'CHALLENGE_WINDOW', 'PAID', 'CORRECTION', 'RESUBMIT', 'TERMINAL'];

function indexerBehind(indexer?: VNextIndexerStatus) {
  if (!indexer?.configured) return true;
  const lag = indexer.lagBlocks && /^[0-9]+$/.test(indexer.lagBlocks)
    ? BigInt(indexer.lagBlocks)
    : null;
  return indexer.status !== 'synced' || lag === null || lag > 0n;
}

export function VNextCourtDashboard({
  campaignId,
  milestone,
  review,
  indexer,
  onRefresh,
}: {
  campaignId: string;
  milestone: VNextMilestoneProjection;
  review?: VNextReviewWithAssignments;
  indexer?: VNextIndexerStatus;
  onRefresh: () => void;
}) {
  const courts = (review?.courts ?? []).slice(0, MAX_COURTS_PER_REVIEW_CASE);
  const lagging = indexerBehind(indexer);
  const roundOutcome = review?.roundOutcome ?? null;
  const finalOutcome = review?.finalOutcome ?? null;

  return (
    <section className="panel space-y-4" aria-labelledby={`court-dashboard-${milestone.milestoneId}`} data-vnext-court-dashboard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="campaign-eyebrow">MILESTONE COURT DASHBOARD</span>
          <h2 id={`court-dashboard-${milestone.milestoneId}`}>Milestone #{milestone.milestoneId}</h2>
          <p className="muted m-0">Court results là dữ liệu indexed từ event canonical; kết quả provisional không phải final outcome.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={onRefresh}>Refresh</button>
      </div>

      {lagging ? (
        <p role="status" className="monograph-alert" data-vnext-court-indexer-lag>
          Indexer chưa đồng bộ hoàn toàn. Dashboard có thể thiếu assignment hoặc verdict mới nhất · checkpoint {indexer?.lastBlock ?? 'chưa có'} / head {indexer?.headBlock ?? 'chưa có'}.
        </p>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="muted">Campaign ID</dt><dd>{campaignId}</dd></div>
        <div><dt className="muted">Milestone ID</dt><dd>{milestone.milestoneId}</dd></div>
        <div><dt className="muted">Evidence revision</dt><dd>{milestone.evidenceRevision}</dd></div>
        <div><dt className="muted">Round hiện tại</dt><dd>{review?.roundId ?? 'chưa indexed'}</dd></div>
        <div className="sm:col-span-2"><dt className="muted">Review Case ID</dt><dd className="font-mono break-all">{milestone.reviewCaseId ?? 'chưa có'}</dd></div>
        <div><dt className="muted">Judge đã enroll</dt><dd>{review?.enrolledCount ?? 'chưa indexed'}</dd></div>
        <div><dt className="muted">Court được tạo</dt><dd>{review?.courtCount ?? '0'} / {MAX_COURTS_PER_REVIEW_CASE} tối đa</dd></div>
        <div><dt className="muted">Court hoàn thành</dt><dd>{review?.finalizedCourtCount ?? '0'}</dd></div>
        <div><dt className="muted">Review status</dt><dd>{milestoneStates[milestone.state] ?? `STATE_${milestone.state}`}</dd></div>
      </dl>

      <div className="space-y-3">
        <h3>Court assignments</h3>
        {review && courts.length === 0 ? <p className="muted" role="status">Snapshot chưa tạo Court hoặc projection Court chưa được index.</p> : null}
        {!review ? <p className="muted" role="status">Review case đang chờ indexer materialize.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {courts.map(court => (
            <article key={court.courtId} className="monograph-card space-y-3" data-vnext-court-id={court.courtId}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="m-0">Court #{court.courtId}</h4>
                <strong>{court.finalized ? (courtVerdicts[court.verdict ?? 0] ?? 'INVALID') : 'PENDING'}</strong>
              </div>
              <p className="text-sm m-0">Assignment: {court.assignmentStatus}</p>
              <ol className="space-y-1 pl-5 text-xs font-mono">
                {Array.from({ length: 3 }, (_, slot) => (
                  <li key={slot} className="break-all">{court.judges[slot] ?? 'Chưa assignment'}</li>
                ))}
              </ol>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="muted">Phase</dt><dd>{court.phase}</dd></div>
                <div><dt className="muted">Finalization</dt><dd>{court.finalized ? 'FINALIZED' : 'PENDING'}</dd></div>
                <div><dt className="muted">Commit</dt><dd>{court.committedCount}/3</dd></div>
                <div><dt className="muted">Reveal hợp lệ</dt><dd>{court.revealedCount}/3</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <section className="monograph-card space-y-3" aria-labelledby={`court-results-${milestone.milestoneId}`}>
        <span className="monograph-card__kicker">COURT RESULTS</span>
        <h3 id={`court-results-${milestone.milestoneId}`} className="monograph-card__title">Tổng hợp kết quả</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="muted">PASS Courts</dt><dd>{review?.passCourts ?? '0'}</dd></div>
          <div><dt className="muted">FAIL Courts</dt><dd>{review?.failCourts ?? '0'}</dd></div>
          <div><dt className="muted">INVALID Courts</dt><dd>{review?.invalidCourts ?? '0'}</dd></div>
        </dl>
        <p className="m-0"><strong>Provisional round verdict:</strong> {roundVerdicts[roundOutcome ?? 0] ?? 'INVALID'}</p>
        <p className="m-0"><strong>Final protocol outcome:</strong> {finalOutcomes[finalOutcome ?? 0] ?? 'PROTOCOL_FAIL'}</p>
        {roundOutcome != null && finalOutcome == null ? (
          <p className="monograph-alert" data-vnext-provisional-warning>Round đã có verdict nhưng appeal window/finalization chưa kết thúc. Đây chưa phải kết quả cuối cùng.</p>
        ) : null}
      </section>

      <section className="monograph-card space-y-2" aria-labelledby={`disbursement-${milestone.milestoneId}`}>
        <span className="monograph-card__kicker">MILESTONE DISBURSEMENT</span>
        <h3 id={`disbursement-${milestone.milestoneId}`} className="monograph-card__title">{milestone.paid ? 'PAID' : 'NOT PAID'}</h3>
        <p className="text-sm m-0">
          {milestone.paid
            ? 'Canonical MilestonePaid event đã được index. Payout đã được xác nhận on-chain.'
            : 'Chưa có canonical MilestonePaid event. PASS không đồng nghĩa tiền đã được giải ngân.'}
        </p>
      </section>
    </section>
  );
}
