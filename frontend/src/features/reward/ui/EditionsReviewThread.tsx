import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { editionsApi, type EditionsReviewThread } from '../../../lib/api/editions';
import { getErrorMessage } from '../../../lib/api/error';

type ViewerMode = 'backer' | 'creator' | 'resolver';

function shortHash(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function messageAuthor(role: EditionsReviewThread['messages'][number]['authorRole']) {
  if (role === 'CREATOR') return 'Creator';
  if (role === 'RESOLVER') return 'Resolver';
  return 'Backer';
}

export function EditionsReviewThread({ campaignId, userId, viewerMode, targetHash }: {
  campaignId: string;
  userId: string;
  viewerMode: ViewerMode;
  targetHash: string;
}) {
  const query = useQuery({
    queryKey: ['reward-editions-review-threads', campaignId, userId],
    queryFn: ({ signal }) => editionsApi.reviewThreads(campaignId, signal),
    retry: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openingBody, setOpeningBody] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const threads = query.data ?? [];
  const selected = threads.find(thread => thread.id === selectedId) ?? threads[0];

  async function refresh() {
    await query.refetch();
    setError('');
  }

  async function openThread(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await editionsApi.openReviewThread(campaignId, { targetHash, body: openingBody.trim() }); setOpeningBody(''); await refresh(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError('');
    try { await editionsApi.messageReviewThread(selected.id, messageBody.trim()); setMessageBody(''); await refresh(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function escalate(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError('');
    try { await editionsApi.escalateReviewThread(selected.id, escalationReason.trim()); setEscalationReason(''); await refresh(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  return <section className="panel editions-review-thread" aria-labelledby={`editions-review-thread-title-${campaignId}`}>
    <div className="editions-review-thread__header">
      <div>
        <span className="editions-feedback__eyebrow">POST-FUNDING REVIEW</span>
        <h2 id={`editions-review-thread-title-${campaignId}`}>Trao đổi thẩm định sau funding</h2>
        <p>Backer và Creator trao đổi theo đúng campaign. Nếu chưa làm rõ được, Backer có thể gửi yêu cầu Resolver.</p>
      </div>
      <span className="editions-feedback__count">{threads.length} trao đổi</span>
    </div>

    {query.isPending && <p className="muted" role="status">Đang tải trao đổi thẩm định…</p>}
    {query.error && <p className="toast toast--error" role="alert">{getErrorMessage(query.error)}</p>}
    {error && <p className="toast toast--error" role="alert">{error}</p>}

    {threads.length > 1 && <div className="editions-review-thread__selector" aria-label="Các trao đổi của campaign">
      {threads.map(thread => <button type="button" key={thread.id} className={`button button--secondary ${selected?.id === thread.id ? 'is-active' : ''}`} onClick={() => setSelectedId(thread.id)}>
        {shortHash(thread.targetHash)} · {thread.status}
      </button>)}
    </div>}

    {!selected && viewerMode === 'backer' && <form className="editions-review-thread__composer" onSubmit={openThread}>
      <p className="editions-review-thread__target">Mốc trao đổi: <code>{shortHash(targetHash)}</code></p>
      <label className="field">Nội dung cần Creator làm rõ
        <textarea required minLength={10} maxLength={3000} value={openingBody} onChange={event => setOpeningBody(event.target.value)} />
      </label>
      <button type="submit" disabled={busy} className="button button--primary">Mở trao đổi với Creator</button>
    </form>}

    {!selected && viewerMode !== 'backer' && !query.isPending && <div className="editions-review-thread__empty"><strong>Chưa có trao đổi sau funding.</strong><p>Backer sẽ mở trao đổi khi có nội dung cần Creator làm rõ.</p></div>}

    {selected && <>
      <article className="editions-review-thread__card">
        <div className="editions-review-thread__meta"><span>Mốc: <code>{shortHash(selected.targetHash)}</code></span><span className={`editions-review-thread__status editions-review-thread__status--${selected.status.toLowerCase()}`}>{selected.status}</span></div>
        <div className="editions-review-thread__messages" aria-label="Nội dung trao đổi">
          {selected.messages.map(message => <div key={message.id} className={`editions-review-thread__message editions-review-thread__message--${message.authorRole.toLowerCase()}`}>
            <strong>{messageAuthor(message.authorRole)}</strong><p>{message.body}</p>
          </div>)}
        </div>
        {selected.escalation && <div className="editions-review-thread__escalation"><strong>Resolver case · {selected.escalation.status}</strong><p>{selected.escalation.reason}</p>{selected.escalation.note && <p>{selected.escalation.note}</p>}</div>}
      </article>

      {selected.permissions?.readOnlyReason && ['REFUNDED', 'ORPHANED'].includes(selected.permissions.readOnlyReason) && <p className="editions-review-thread__read-only" role="status">Trao đổi này chỉ còn xem vì quyền pledge đã bị hoàn lại hoặc không còn thuộc chain hiện tại.</p>}

      {((viewerMode === 'backer') || (viewerMode === 'creator')) && selected.permissions?.canMessage === true && <form className="editions-review-thread__composer" onSubmit={sendMessage}>
        <label className="field">Phản hồi trong trao đổi
          <textarea required minLength={10} maxLength={3000} value={messageBody} onChange={event => setMessageBody(event.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="button button--secondary">Gửi phản hồi</button>
      </form>}

      {viewerMode === 'backer' && !selected.escalation && selected.permissions?.canEscalate === true && <form className="editions-review-thread__composer editions-review-thread__composer--escalation" onSubmit={escalate}>
        <label className="field">Nếu chưa được làm rõ, gửi yêu cầu Resolver
          <textarea required minLength={10} maxLength={3000} value={escalationReason} onChange={event => setEscalationReason(event.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="button button--secondary">Gửi yêu cầu Resolver</button>
      </form>}
    </>}
  </section>;
}
