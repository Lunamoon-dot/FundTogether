import { useState, type FormEvent } from 'react';
import { editionsApi, type EditionsResolverCase as EditionsResolverCaseData } from '../../../lib/api/editions';
import { getErrorMessage } from '../../../lib/api/error';

function messageAuthor(role: EditionsResolverCaseData['thread']['messages'][number]['authorRole']) {
  if (role === 'CREATOR') return 'Creator';
  if (role === 'RESOLVER') return 'Resolver';
  return 'Backer';
}

export function EditionsResolverCase({ caseItem, onChanged }: {
  userId: string;
  caseItem: EditionsResolverCaseData;
  onChanged: () => void | Promise<unknown>;
}) {
  const [requestBody, setRequestBody] = useState('');
  const [outcome, setOutcome] = useState<'RESOLVED' | 'DISMISSED' | 'FORMAL_DISPUTE'>('RESOLVED');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { escalation, thread } = caseItem;
  const canAct = !['RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE'].includes(escalation.status);

  async function requestCreatorResponse(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await editionsApi.requestCreatorResponse(escalation.id, requestBody.trim());
      setRequestBody('');
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resolveCase(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await editionsApi.resolveReviewEscalation(escalation.id, outcome, note.trim());
      setNote('');
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="resolver-case-card" aria-labelledby={`resolver-case-${caseItem.id}`}>
      <header className="resolver-case-card__header">
        <div>
          <span className="resolver-section-kicker">Resolver case · {escalation.status}</span>
          <h3 id={`resolver-case-${caseItem.id}`}>{caseItem.campaign.title}</h3>
          <p className="muted">Yêu cầu của Backer: {escalation.reason}</p>
        </div>
        <span className="resolver-status-pill">{thread.status}</span>
      </header>

      <div className="resolver-case-card__context">
        <div><strong>Campaign</strong><span>{caseItem.campaign.commitmentHash ?? 'Chưa có commitment hash'}</span></div>
        <div><strong>Chain</strong><span>{caseItem.chain.status} · state {caseItem.chain.snapshot?.state ?? '—'}</span></div>
        <div><strong>Entitlement</strong><span>{caseItem.entitlement?.canonical ? 'Canonical' : 'Chưa canonical'} · {caseItem.entitlement?.refunded ? 'Đã hoàn tất refund' : 'Chưa refund'}</span></div>
      </div>

      <div className="resolver-case-card__conversation">
        <h4>Trao đổi liên quan</h4>
        {caseItem.feedback.length > 0 && <div className="resolver-case-card__feedback">
          <strong>Feedback đã liên kết</strong>
          {caseItem.feedback.map(item => <p key={item.id}>{item.body}</p>)}
        </div>}
        {thread.messages.map(message => <div key={message.id} className="resolver-case-card__message">
          <strong>{messageAuthor(message.authorRole)}</strong>
          <p>{message.body}</p>
        </div>)}
      </div>

      {error && <p className="toast toast--error" role="alert">{error}</p>}

      {canAct && <div className="resolver-case-card__actions">
        <form onSubmit={requestCreatorResponse} className="resolver-case-card__form">
          <label className="field">Yêu cầu Creator làm rõ
            <textarea required minLength={10} maxLength={3000} value={requestBody} onChange={event => setRequestBody(event.target.value)} />
          </label>
          <button type="submit" className="button button--secondary" disabled={busy}>Yêu cầu Creator làm rõ</button>
        </form>

        <form onSubmit={resolveCase} className="resolver-case-card__form">
          <h4>Ghi outcome Resolver</h4>
          <label className="field">Kết quả
            <select value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>
              <option value="RESOLVED">Đã làm rõ</option>
              <option value="DISMISSED">Không đủ cơ sở</option>
              <option value="FORMAL_DISPUTE">Chuyển formal dispute</option>
            </select>
          </label>
          <label className="field">Ghi chú kết luận
            <textarea required minLength={10} maxLength={3000} value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <button type="submit" className="button button--primary" disabled={busy}>Ghi outcome Resolver</button>
        </form>
      </div>}
    </article>
  );
}
