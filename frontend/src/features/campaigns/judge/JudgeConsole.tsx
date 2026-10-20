import { useQuery } from '@tanstack/react-query';
import { campaignApi, type OperationSummary, type PublicationJudgeCase } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useTransaction } from '../transactions/useTransaction';
import { PublicationCaseSummary } from './JudgePublicationPanel';
import '../shared/styles.css';

function JudgeCaseCard({ userId, operation, onRefresh }: { userId: string; operation: OperationSummary; onRefresh: () => void }) {
  const transaction = useTransaction(onRefresh, { userId, campaignId: operation.campaignId });
  const publicationCase = operation.publicationCase as PublicationJudgeCase | null;
  const address = transaction.address?.toLowerCase();
  const assigned = Boolean(address && publicationCase?.judges.some(judge => judge.toLowerCase() === address));
  const voted = Boolean(address && publicationCase?.votes.some(vote => vote.judge.toLowerCase() === address));
  const expired = Boolean(publicationCase && BigInt(Math.floor(Date.now() / 1000)) >= BigInt(publicationCase.voteDeadline));

  return (
    <article className="monograph-card space-y-3">
      <div>
        <span className="monograph-card__kicker">ASSIGNED PUBLICATION CASE</span>
        <h2 className="monograph-card__title">{operation.title}</h2>
      </div>
      {!publicationCase ? <p className="text-sm text-[var(--ink-subtle)]">Case chưa được index từ canonical event.</p> : <>
        <PublicationCaseSummary publicationCase={publicationCase} />
        {publicationCase.status === 'OPEN' && assigned && !voted && !expired && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button--primary" disabled={transaction.busy} onClick={() => void transaction.send('votePublicationCase', [BigInt(publicationCase.caseId), true])}>Approve publication</button>
            <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('votePublicationCase', [BigInt(publicationCase.caseId), false])}>Reject publication</button>
          </div>
        )}
        {publicationCase.status === 'OPEN' && assigned && voted && <p className="text-sm text-[var(--ink-subtle)]">Ví hiện tại đã vote cho case này.</p>}
        {publicationCase.status === 'OPEN' && expired && <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void transaction.send('expirePublicationCase', [BigInt(publicationCase.caseId)])}>Đóng case đã hết hạn</button>}
        {!assigned && <p className="text-sm text-[var(--ink-subtle)]">Ví hiện tại không nằm trong 3 ghế Judge của case.</p>}
      </>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
      {transaction.notice && <p className="monograph-alert monograph-alert--info" role="status">{transaction.notice}</p>}
    </article>
  );
}

export function JudgeConsole({ userId }: { userId: string }) {
  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'judge', userId],
    queryFn: ({ signal }) => campaignApi.operations('judge', signal),
    refetchInterval: 10_000,
    retry: false,
  });

  if (operations.isPending) return <p role="status" className="muted">Đang tải các Judge case được giao…</p>;
  if (operations.error) return <p role="alert" className="toast toast--error">{getErrorMessage(operations.error)}</p>;

  const items = operations.data ?? [];
  return (
    <div className="campaign-container">
      <h1 className="public-sr-only">Judge workspace</h1>
      <section className="panel space-y-3" aria-labelledby="judge-console-title">
        <span className="campaign-eyebrow">COMMUNITY JUDGING</span>
        <h2 id="judge-console-title">Các publication case được giao</h2>
        <p className="muted">Mỗi case có 3 Judge được chọn ngẫu nhiên. Một case cần 2 phiếu cùng chiều để chốt.</p>
      </section>
      {items.length === 0 ? <p className="muted" role="status">Hiện chưa có case nào được giao cho các ví đã liên kết.</p> : <div className="space-y-4">{items.map(item => <JudgeCaseCard key={item.campaignId} userId={userId} operation={item} onRefresh={() => void operations.refetch()} />)}</div>}
    </div>
  );
}
