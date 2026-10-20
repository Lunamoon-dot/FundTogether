import { useQuery } from '@tanstack/react-query';
import type { PublicationJudgeCase } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { useTransaction } from '../transactions/useTransaction';

export function JudgePublicationPanel({
  campaignId,
  userId,
  status,
  onRefresh,
}: {
  campaignId: string;
  userId: string;
  status: string;
  onRefresh: () => void;
}) {
  const termsQuery = useQuery({
    queryKey: ['campaign-campaign-publication-terms', campaignId, userId],
    queryFn: () => campaignApi.terms(campaignId),
    enabled: ['FROZEN', 'UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW', 'APPROVED'].includes(status),
  });
  const terms = termsQuery.data;
  const transaction = useTransaction(onRefresh, { userId, campaignId });
  if (!terms && !termsQuery.error) return null;
  if (!terms) return <p className="text-sm text-[var(--ink-subtle)]">Chưa đọc được terms để mở Judge case.</p>;

  const publicationCase = terms.publicationCase;
  const createCase = () => void transaction.send(
    'createPublicationCase',
    [terms.commitmentHash, BigInt(terms.goal), BigInt(terms.price), BigInt(terms.fundingDuration)],
    { expectedWallet: terms.creatorWallet },
  );

  return (
    <section className="monograph-card space-y-3" aria-labelledby={`judge-publication-${campaignId}`}>
      <span className="monograph-card__kicker">RANDOMIZED JUDGE REVIEW</span>
      <h2 id={`judge-publication-${campaignId}`} className="monograph-card__title">Vòng xét duyệt publication</h2>
      <p className="monograph-card__desc">
        Commitment được gửi lên contract để chọn 3 Judge theo từng case. Không còn bước Resolver ký duyệt publication.
      </p>
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
      {transaction.notice && <p className="monograph-alert monograph-alert--info" role="status">{transaction.notice}</p>}
      {!publicationCase && (
        <button type="button" className="button button--primary" disabled={transaction.busy} onClick={createCase}>
          Gửi commitment vào vòng Judge
        </button>
      )}
      {publicationCase && <PublicationCaseSummary publicationCase={publicationCase} />}
    </section>
  );
}

export function PublicationCaseSummary({ publicationCase }: { publicationCase: PublicationJudgeCase }) {
  return (
    <div className="space-y-2" data-publication-case={publicationCase.caseId}>
      <p className="text-sm m-0"><strong>Case #{publicationCase.caseId}</strong> · {publicationCase.status}</p>
      <p className="text-sm m-0">Judge đã chọn: {publicationCase.judges.length}/3 · Phiếu thuận {publicationCase.approveVotes} · Phiếu chống {publicationCase.rejectVotes}</p>
      <p className="text-xs font-mono break-all m-0">Commitment: {publicationCase.commitmentHash}</p>
      {publicationCase.status === 'OPEN' && <p className="text-sm text-[var(--ink-subtle)] m-0">Đang chờ đủ quorum 2/3 Judge. Hạn vote: {new Date(Number(publicationCase.voteDeadline) * 1000).toLocaleString()}</p>}
      {publicationCase.status === 'APPROVED' && <p className="monograph-alert monograph-alert--success" role="status">Case đã APPROVED. Creator có thể tạo campaign canonical trên contract.</p>}
      {publicationCase.status === 'REJECTED' && <p className="monograph-alert monograph-alert--error" role="alert">Case bị REJECTED. Hãy sửa commitment và gửi case mới.</p>}
      {publicationCase.status === 'EXPIRED' && <p className="monograph-alert monograph-alert--warning" role="alert">Case đã hết hạn vote. Hãy tạo commitment mới rồi gửi lại.</p>}
    </div>
  );
}
