import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignApi } from '../api/campaigns';
import type { Evidence, Feedback } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';

function feedbackKindLabel(kind: Feedback['kind']) {
  if (kind === 'ISSUE') return 'Báo sự cố';
  if (kind === 'FILE_UNAVAILABLE') return 'Không mở được file';
  return 'Nhận xét công khai';
}

function feedbackTargetLabel(targetHash: string, commitmentHash: string, evidence: Evidence[]) {
  if (targetHash === commitmentHash) return 'Cam kết campaign';
  const item = evidence.find(entry => entry.evidenceHash === targetHash);
  if (item?.purpose === 'FINAL_PDF') return 'Bản PDF cuối';
  if (item?.purpose === 'PRODUCTION_EVIDENCE') return 'Bằng chứng sản xuất';
  return 'Mốc thẩm định hiện tại';
}

function feedbackAuthorLabel(authorUserId: string, viewerUserId: string, reviewerView: boolean) {
  if (authorUserId === viewerUserId) return 'Bạn';
  if (!reviewerView) return 'Thành viên cộng đồng';
  if (authorUserId.length <= 16) return `Tài khoản ${authorUserId}`;
  return `Tài khoản ${authorUserId.slice(0, 8)}…${authorUserId.slice(-6)}`;
}

function feedbackDateLabel(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString('vi-VN');
}

type FeedbackComposerProps = { id: string; commitmentHash: string; evidence?: Evidence[]; onSubmitted?: () => void };

export function FeedbackComposerForm({ id, commitmentHash, evidence = [], onSubmitted }: FeedbackComposerProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(''); const [kind, setKind] = useState<'COMMENT' | 'ISSUE'>('COMMENT'); const [target, setTarget] = useState(commitmentHash);
  const mutation = useMutation({
    mutationFn: (data: { targetHash: string; kind: 'COMMENT' | 'ISSUE'; body: string }) => campaignApi.comment(id, data),
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['campaign-campaign-feedback', id] });
      onSubmitted?.();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const detail = body.trim();
    if (detail.length < 10) return;
    mutation.mutate({ targetHash: target, kind, body: detail });
  }

  return (
    <form className="campaign-feedback__form" onSubmit={submit}>
      <div className="campaign-feedback__scope">
        <label className="campaign-feedback__field">
          <span className="campaign-feedback__field-label">Góp ý cho</span>
          <select value={target} onChange={event => setTarget(event.target.value)}>
            <option value={commitmentHash}>Cam kết campaign</option>
            {evidence.map(item => <option key={item.id} value={item.evidenceHash}>{feedbackTargetLabel(item.evidenceHash, commitmentHash, evidence)}</option>)}
          </select>
        </label>
        <label className="campaign-feedback__field">
          <span className="campaign-feedback__field-label">Loại phản hồi</span>
          <select value={kind} onChange={event => setKind(event.target.value as 'COMMENT' | 'ISSUE')}>
            <option value="COMMENT">Nhận xét công khai</option>
            <option value="ISSUE">Góp ý riêng / Báo sự cố</option>
          </select>
        </label>
      </div>
      <label className="campaign-feedback__field campaign-feedback__field--details">
        <span className="campaign-feedback__field-label">Nội dung góp ý</span>
        <textarea required minLength={10} maxLength={3000} value={body} onChange={event => setBody(event.target.value)} placeholder="Ví dụ: Phần giới thiệu đang thiếu thông tin về…" />
      </label>
      {(mutation.error || (body.length > 0 && body.trim().length < 10)) && <p role="alert" className="campaign-feedback-modal__error">
        {mutation.error ? getErrorMessage(mutation.error) : 'Hãy viết ít nhất 10 ký tự.'}
      </p>}
      <div className="campaign-feedback__actions">
        <button disabled={mutation.isPending || body.trim().length < 10} className="button button--primary">Gửi góp ý</button>
      </div>
    </form>
  );
}

export function FeedbackComposerModal({ id, commitmentHash, evidence = [], onClose }: FeedbackComposerProps & { onClose: () => void }) {
  return (
    <aside className="campaign-feedback-modal" role="dialog" aria-modal="true" aria-labelledby={`campaign-feedback-modal-title-${id}`}>
      <div className="campaign-feedback-modal__dialog">
        <div className="campaign-feedback-modal__header">
          <div>
            <span className="campaign-feedback__eyebrow">COMMUNITY REVIEW</span>
            <h2 id={`campaign-feedback-modal-title-${id}`}>Gửi góp ý</h2>
          </div>
          <button type="button" className="campaign-feedback-modal__close" onClick={onClose} aria-label="Đóng form góp ý">×</button>
        </div>
        <FeedbackComposerForm id={id} commitmentHash={commitmentHash} evidence={evidence} onSubmitted={onClose} />
        <button type="button" className="button button--secondary" onClick={onClose}>Đóng</button>
      </div>
    </aside>
  );
}

export function CommunityPanel({ id, userId, viewerMode = 'community', commitmentHash, evidence = [], allowFeedbackSubmission = false }: { id: string; userId: string; viewerMode?: 'community' | 'creator' | 'resolver'; commitmentHash: string; evidence?: Evidence[]; allowFeedbackSubmission?: boolean }) {
  const query = useQuery({ queryKey: ['campaign-campaign-feedback', id, userId], queryFn: ({ signal }) => campaignApi.feedback(id, signal) });
  const queryClient = useQueryClient();
  const [responseBody, setResponseBody] = useState(''); const [relatedFeedbackIds, setRelatedFeedbackIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const creatorResponseMutation = useMutation({
    mutationFn: (data: { responseBody: string; relatedFeedbackIds: string[] }) => campaignApi.creatorResponse(id, data),
    onSuccess: async () => {
      setResponseBody(''); setRelatedFeedbackIds([]);
      await queryClient.invalidateQueries({ queryKey: ['campaign-campaign-feedback', id] });
    },
  });
  const creatorView = viewerMode === 'creator';
  const reviewerView = viewerMode !== 'community';
  const canSubmit = allowFeedbackSubmission && !creatorView && query.data?.canSubmit === true;
  const feedbackItems = query.data?.items ?? [];
  const creatorResponses = query.data?.responses ?? [];
  const canRespond = creatorView && query.data?.canRespond === true;
  const currentCreatorResponse = creatorResponses.find(response => response.commitmentHash === commitmentHash);
  const displayedFeedbackCount = reviewerView ? feedbackItems.length : feedbackItems.filter(item => item.kind === 'COMMENT').length;

  async function submitCreatorResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = responseBody.trim();
    if (response.length < 10) {
      setError('Hãy viết phản hồi chung tối thiểu 10 ký tự.');
      return;
    }
    setError(''); creatorResponseMutation.mutate({ responseBody: response, relatedFeedbackIds });
  }

  return (
    <section className={`panel campaign-feedback campaign-feedback--${viewerMode}`} aria-labelledby={`campaign-feedback-title-${id}`}>
      <div className="campaign-feedback__header">
        <div>
          <span className="campaign-feedback__eyebrow">{creatorView ? 'CREATOR · ĐỌC & PHẢN HỒI' : 'COMMUNITY REVIEW'}</span>
          <h2 id={`campaign-feedback-title-${id}`}>{creatorView ? 'Phản hồi cộng đồng' : 'Community kiểm tra cùng Resolver'}</h2>
          <p>{creatorView
            ? 'Các phản hồi dưới đây thuộc vòng thẩm định hiện tại. Creator có thể trả lời chung và gắn phản hồi với những góp ý cần làm rõ.'
            : viewerMode === 'resolver'
              ? 'Resolver xem toàn bộ nhận xét công khai và góp ý riêng để đưa ra quyết định thẩm định.'
              : 'Nhận xét công khai của cộng đồng hiển thị tại đây. Góp ý cần xử lý riêng chỉ hiển thị với người gửi, Creator và Resolver; nội dung không phải phiếu biểu quyết và không tự khóa hay chuyển tiền.'}</p>
        </div>
        <span className="campaign-feedback__count">{displayedFeedbackCount} {reviewerView ? 'phản hồi' : 'nhận xét công khai'}</span>
      </div>

      {query.isPending ? (
        <p role="status" className="muted">Đang tải phản hồi…</p>
      ) : canSubmit ? (
        <FeedbackComposerForm id={id} commitmentHash={commitmentHash} evidence={evidence} />
      ) : (
        <p className="campaign-feedback__read-only">{creatorView ? 'Creator không gửi góp ý cho chính campaign này. Hãy dùng khung “Phản hồi của Creator” để giải thích hoặc làm rõ các góp ý.' : 'Bạn có thể gửi góp ý bằng nút “Gửi góp ý” trên trang campaign.'}</p>
      )}
      {(error || query.error || creatorResponseMutation.error) && <p role="alert">{error || getErrorMessage(query.error || creatorResponseMutation.error)}</p>}

      {(canRespond || currentCreatorResponse || creatorResponses.length > 0) && <section className="campaign-creator-response" aria-labelledby={`campaign-creator-response-title-${id}`}>
        <div>
          <span className="campaign-creator-response__eyebrow">CREATOR RESPONSE</span>
          <h3 id={`campaign-creator-response-title-${id}`}>Phản hồi của Creator</h3>
          <p className="campaign-preparation-help">Creator có thể cảm ơn, giải thích chung và gắn phản hồi với một hoặc nhiều góp ý. Đây không phải là phiếu quyết định.</p>
        </div>
        {canRespond && <form className="campaign-feedback__form" onSubmit={submitCreatorResponse}>
          <label className="field">
            Nội dung phản hồi chung
            <textarea required minLength={10} maxLength={3000} value={responseBody} onChange={event => setResponseBody(event.target.value)} />
          </label>
          {feedbackItems.length > 0 && <fieldset className="campaign-creator-response__links">
            <legend>Gắn với góp ý cụ thể · tùy chọn</legend>
            {feedbackItems.map(item => <label key={item.id} className="campaign-creator-response__chip">
              <input type="checkbox" checked={relatedFeedbackIds.includes(item.id)} onChange={event => setRelatedFeedbackIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
              <span><strong>{feedbackKindLabel(item.kind)}</strong> · {item.body}</span>
            </label>)}
          </fieldset>}
          <button disabled={creatorResponseMutation.isPending} className="button button--primary">Gửi phản hồi Creator</button>
        </form>}
        {creatorView && !canRespond && currentCreatorResponse && <p className="campaign-feedback__read-only" role="status">Creator đã gửi phản hồi cho vòng thẩm định hiện tại. Các góp ý mới sau funding sẽ được trao đổi trong thread riêng.</p>}
        {creatorResponses.length > 0 && <div className="campaign-creator-response__history" aria-label="Lịch sử phản hồi Creator">
          <h4>Lịch sử phản hồi</h4>
          {creatorResponses.map(response => <article key={response.id} className="campaign-creator-response__entry">
            <div className="campaign-feedback-item__header">
              <strong>Creator</strong>
              <time dateTime={response.createdAt}>{feedbackDateLabel(response.createdAt)}</time>
            </div>
            <p>{response.responseBody}</p>
            <small>{response.relatedFeedbackIds.length > 0 ? `Gắn với ${response.relatedFeedbackIds.length} góp ý` : 'Phản hồi chung cho vòng thẩm định'}</small>
          </article>)}
        </div>}
      </section>}

      {feedbackItems.length === 0 ? (
        <div className="campaign-feedback__empty">
          <strong>Chưa có phản hồi cho vòng thẩm định này.</strong>
          <p>{creatorView ? 'Khi community gửi góp ý, nội dung sẽ xuất hiện tại đây để bạn theo dõi.' : 'Góp ý cần gắn với một cam kết hoặc bằng chứng cụ thể.'}</p>
        </div>
      ) : (
        <div className="campaign-feedback__list" aria-label="Danh sách phản hồi">
          {feedbackItems.map(item => (
            <article key={item.id} className="campaign-feedback-item">
              <div className="campaign-feedback-item__header">
                <div className="campaign-feedback-item__labels">
                  <span className={`campaign-feedback-item__kind campaign-feedback-item__kind--${item.kind.toLowerCase()}`}>
                    {feedbackKindLabel(item.kind)}
                  </span>
                  <span className="campaign-feedback-item__target">
                    {feedbackTargetLabel(item.targetHash, commitmentHash, evidence)}
                  </span>
                </div>
                <time dateTime={item.createdAt}>{feedbackDateLabel(item.createdAt)}</time>
              </div>
              <p className="campaign-feedback-item__body">{item.body}</p>
              <p className="campaign-feedback-item__author">{feedbackAuthorLabel(item.authorUserId, userId, reviewerView)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
