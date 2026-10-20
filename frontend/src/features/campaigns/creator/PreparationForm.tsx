import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { campaignApi, freezeCampaign, listSamples, listWallets, submitCampaignReview, updatePreparation, uploadSample as uploadSampleFile } from '../api/campaigns';
import type { Campaign, CampaignSample } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { buildDraft } from './draft';
import { getDefaultPayoutWalletLinkId, getPreparationFieldError, getPreparationRequiredFieldError, getPreparationAction, validatePreparation } from './preparation-validation';
import { FrozenTerms, SampleDownload } from '../shared/FrozenTerms';

export function PreparationPanel({ campaign, onChange, initialStep }: { campaign: Campaign; onChange: () => void | Promise<unknown>; initialStep?: 0 | 1 | 2 }) {
  const defaultStep: 0 | 1 | 2 = initialStep !== undefined
    ? initialStep
    : (campaign.status === 'CHANGES_REQUESTED' ? 2 : 0);
  const [open, setOpen] = useState(campaign.status === 'DRAFT' || campaign.status === 'CHANGES_REQUESTED' || campaign.status === 'FROZEN');
  return <div>
    <button type="button" className="button button--secondary" onClick={() => setOpen(value => !value)}>{open ? 'Đóng hồ sơ' : 'Hồ sơ thẩm định PDF'}</button>
    {open && campaign.draftConfig && <PreparationForm key={campaign.id} campaign={campaign} onChange={onChange} initialStep={defaultStep} />}
  </div>;
}

function PreparationForm({ campaign, onChange, initialStep }: { campaign: Campaign; onChange: () => void | Promise<unknown>; initialStep: 0 | 1 | 2 }) {
  const draft = campaign.draftConfig!;
  const tier = draft.tiers?.[0] ?? {};
  const benefit = tier.benefitItems?.[0] ?? {};
  const preparation = campaign.reviewPreparation;
  const editable = campaign.status === 'DRAFT';
  const queryClient = useQueryClient();
  const sampleQueryKey = ['campaign-campaign-samples', campaign.id, campaign.creatorUserId] as const;
  const { data: wallets, error: walletError } = useQuery({ queryKey: ['campaign-campaign-wallets', campaign.creatorUserId], queryFn: ({ signal }) => listWallets(signal), enabled: editable });
  const { data: samples, error: sampleError, refetch: refetchSamples } = useQuery({ queryKey: sampleQueryKey, queryFn: ({ signal }) => listSamples(campaign.id, signal), enabled: editable });
  const [fields, setFields] = useState(() => ({ title: draft.title ?? '', pitch: draft.pitch ?? '', story: draft.story ?? '',
    goal: formatUnits(BigInt(draft.goal ?? campaign.goal ?? '0'), 6), durationDays: Number(draft.fundingDuration ?? 2592000) / 86400,
    price: formatUnits(BigInt(tier.price ?? campaign.goal ?? '0'), 6), benefitTitle: benefit.title ?? 'Final PDF', benefitDescription: benefit.description ?? '',
    payoutWalletLinkId: preparation?.payoutWalletLinkId ?? '', contentOutline: preparation?.contentOutline ?? '', budgetPlan: preparation?.budgetPlan ?? '', evidencePlan: preparation?.evidencePlan ?? '' }));
  const payoutWalletLinkId = getDefaultPayoutWalletLinkId(fields.payoutWalletLinkId, wallets ?? []);
  const [selected, setSelected] = useState(preparation?.sampleIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const feedbackQuery = useQuery({
    queryKey: ['campaign-campaign-feedback', campaign.id, campaign.creatorUserId],
    queryFn: ({ signal }) => campaignApi.feedback(campaign.id, signal),
    enabled: campaign.status === 'FROZEN',
  });
  const feedbackHistory = feedbackQuery.data?.history ?? feedbackQuery.data?.items ?? [];
  const priorCorrection = campaign.reviews?.some(review => review.outcome === 'CHANGES_REQUESTED') === true;
  const needsCreatorResponse = campaign.status === 'FROZEN' && (feedbackHistory.length > 0 || priorCorrection);
  const [responseBody, setResponseBody] = useState('');
  const [relatedFeedbackIds, setRelatedFeedbackIds] = useState<string[]>([]);
  const [uploadingSample, setUploadingSample] = useState('');
  const [dirty, setDirty] = useState(false);
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<number>(initialStep);
  const stepTitles = ['Thông tin ấn phẩm', 'Mục tiêu gây quỹ', 'Kế hoạch hoàn thiện'];
  const preparationAction = getPreparationAction(Boolean(preparation), dirty);
  async function run(action: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await onChange(); setNotice(message); return true; }
    catch (err) { setError(getErrorMessage(err)); return false; }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (selected.length === 0) {
      setError('Chọn ít nhất một tài liệu mẫu riêng tư để Judge committee thẩm định.');
      return;
    }
    const requiredFieldError = getPreparationRequiredFieldError(payoutWalletLinkId);
    if (requiredFieldError) {
      setError(requiredFieldError);
      return;
    }
    const textErrors = validatePreparation(fields);
    const firstTextError = Object.values(textErrors)[0];
    if (firstTextError) {
      setError(firstTextError);
      return;
    }
    if (await run(() => {
      const config = buildDraft({
        ...fields,
      });
      return updatePreparation(campaign.id, { revision: campaign.revision ?? 0,
      config, preparation: { payoutWalletLinkId, sampleIds: selected,
        contentOutline: fields.contentOutline, budgetPlan: fields.budgetPlan, evidencePlan: fields.evidencePlan } });
    }, 'Đã lưu hồ sơ. Kiểm tra lại rồi khóa cam kết.')) setDirty(false);
  }
  async function uploadSample(file: File) {
    setUploadingSample(file.name);
    try {
      await run(async () => {
        const uploaded = await uploadSampleFile(campaign.id, file);
        setSelected(old => [...old, uploaded.id]);
        setDirty(true);
        queryClient.setQueryData<CampaignSample[]>(sampleQueryKey, old => [...(old ?? []), uploaded]);
        await refetchSamples();
      }, 'Đã lưu tài liệu mẫu riêng tư; lưu hồ sơ để gắn vào cam kết.');
    } finally {
      setUploadingSample('');
    }
  }
  function textField(name: Exclude<keyof typeof fields, 'durationDays' | 'payoutWalletLinkId'>, label: string, multiline = false, type = 'text', required = true, minLength?: number, maxLength?: number) {
    const preparationField = name === 'contentOutline' || name === 'budgetPlan' || name === 'evidencePlan' ? name : undefined;
    const fieldError = preparationField && blurred[name] ? getPreparationFieldError(preparationField, String(fields[name])) : undefined;
    const inputId = `campaign-preparation-${name}`;
    const errorId = `${inputId}-error`;
    const props = { id: inputId, value: fields[name], required, minLength, maxLength, 'aria-invalid': fieldError ? true : undefined,
      'aria-describedby': fieldError ? errorId : undefined,
      onBlur: () => { if (minLength) setBlurred(old => ({ ...old, [name]: true })); },
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setFields(old => ({ ...old, [name]: e.target.value })); setDirty(true); } };
    return <label className="field" key={name}>{label}{multiline ? <textarea {...props} /> : <input {...props} type={type} />}{fieldError && <span id={errorId} className="field-error" role="alert">{fieldError}</span>}</label>;
  }
  return <div className="campaign-preparation" style={{ marginTop: 16 }}>
    {error && <p role="alert" className="toast toast--error">{error}</p>}
    {notice && <p role="status" className="public-sr-only sr-only">{notice}</p>}
    {(walletError || sampleError) && <p role="alert">{getErrorMessage(walletError || sampleError)}</p>}
    {campaign.reviews?.map(review => <p key={review.id}>Review {review.outcome}: {review.decisionReason}</p>)}
    {editable ? <form onSubmit={save}>
      <div className="campaign-preparation-intro">
        <div>
          <span className="campaign-preparation-kicker">Hồ sơ campaign</span>
          <h3>Hoàn thiện bản thảo trước khi tạo Judge case</h3>
          <p className="muted">Điền theo 3 nhóm dưới đây, dùng mũi tên để quay lại hoặc đi tiếp. Ở bước 3 mới lưu bản nháp hoặc khóa cam kết; chưa có pledge và chưa có giao dịch tiền.</p>
        </div>
        <ol className="campaign-preparation-steps" aria-label="Các bước hoàn thiện hồ sơ">
          <li className={step === 0 ? 'is-current' : step > 0 ? 'is-complete' : ''}><span>1</span>Thông tin ấn phẩm</li>
          <li className={step === 1 ? 'is-current' : step > 1 ? 'is-complete' : ''}><span>2</span>Mục tiêu gây quỹ</li>
          <li className={step === 2 ? 'is-current' : ''}><span>3</span>Kế hoạch hoàn thiện</li>
        </ol>
      </div>
      <p className="campaign-preparation-step-caption" aria-live="polite">Bước {step + 1} trên 3 · {stepTitles[step]}</p>
      <fieldset disabled={busy} className="campaign-preparation-form">
        <legend>Hồ sơ campaign · revision {campaign.revision ?? 0}</legend>
        {step === 0 && <section className="campaign-preparation-section">
          <div className="campaign-preparation-section-heading">
            <span className="campaign-preparation-section-number">1</span>
            <div><h4>Thông tin ấn phẩm</h4><p>Giúp Judge committee hiểu bạn đang tạo ấn phẩm gì và người ủng hộ sẽ nhận PDF nào.</p></div>
          </div>
          {textField('title', 'Tên ấn phẩm')}{textField('pitch', 'Giới thiệu ngắn')}{textField('story', 'Câu chuyện và kế hoạch sản xuất', true)}
          {textField('benefitTitle', 'Tên file PDF')}{textField('benefitDescription', 'PDF sẽ bao gồm nội dung gì?', true)}
        </section>}

        {step === 1 && <section className="campaign-preparation-section">
          <div className="campaign-preparation-section-heading">
            <span className="campaign-preparation-section-number">2</span>
            <div><h4>Mục tiêu gây quỹ</h4><p>Đây là thông tin tài chính của một gói Standard PDF duy nhất.</p></div>
          </div>
          {textField('goal', 'Mục tiêu gây quỹ (MockUSDC local)')}{textField('price', 'Giá gói PDF (MockUSDC local)')}
          <label className="field">Thời gian gây quỹ (ngày)<input type="number" min={1} max={60} value={fields.durationDays} onChange={e => { setFields(old => ({ ...old, durationDays: Number(e.target.value) })); setDirty(true); }} /></label>
          <label className="field">Ví Creator nhận tiền (chain 31339)<select required value={payoutWalletLinkId} onChange={event => { setFields(old => ({ ...old, payoutWalletLinkId: event.target.value })); setDirty(true); }}>
            <option value="">Chọn ví đã liên kết</option>{wallets?.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.address}</option>)}
          </select></label>
          {(!wallets || wallets.length === 0) && <p className="campaign-preparation-help">Hãy liên kết ít nhất một ví Creator trên chain 31339 trong phần Tài khoản.</p>}
        </section>}

        {step === 2 && <section className="campaign-preparation-section">
          <div className="campaign-preparation-section-heading">
            <span className="campaign-preparation-section-number">3</span>
            <div><h4>Kế hoạch hoàn thiện</h4><p>Nói rõ bạn sẽ hoàn thiện tác phẩm và chứng minh tiến độ như thế nào.</p></div>
          </div>
          <div className="campaign-input-group">
            <h5>Nội dung và kế hoạch sản xuất</h5>
            <p className="campaign-preparation-help">Các thông tin này giúp Judge committee hiểu sản phẩm, ngân sách và cách kiểm tra tiến độ.</p>
            {textField('contentOutline', 'Nội dung PDF sẽ hoàn thiện là gì? · tối thiểu 20 ký tự', true, 'text', true, 20, 10000)}
            {textField('budgetPlan', 'Ngân sách sẽ dùng cho những hạng mục nào? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}
            {textField('evidencePlan', 'Bằng chứng nào sẽ chứng minh tiến độ? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}
          </div>
          <div className="campaign-input-group">
            <h5>Tài liệu mẫu thẩm định</h5>
            <p className="campaign-preparation-help">Bắt buộc chọn ít nhất một file PDF, PNG hoặc JPEG. File chỉ dành cho Judge được phân công, không công khai.</p>
            <div className="campaign-uploader">
              <div className="campaign-uploader__action">
                <label htmlFor="edit-draft-sample-file" className="campaign-uploader__btn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Tải thêm tài liệu mẫu
                </label>
                <span className="campaign-uploader__hint">PDF, PNG, JPEG · Tối đa 10 MiB mỗi tệp</span>
              </div>
              <input
                id="edit-draft-sample-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                      setError(`File "${file.name}" vượt quá kích thước tối đa 10 MiB.`);
                      return;
                    }
                    void uploadSample(file);
                  }
                }}
              />
            </div>
            {uploadingSample && <p className="campaign-preparation-help" role="status">Đang tải tài liệu mẫu lên: {uploadingSample}… Danh sách sẽ cập nhật ngay sau khi máy chủ xác nhận.</p>}
            {samples?.map(sample => (
              <SampleDownload
                key={sample.id}
                campaignId={campaign.id}
                sample={sample}
                selected={selected.includes(sample.id)}
                onToggle={checked => {
                  setSelected(old => checked ? [...old, sample.id] : old.filter(id => id !== sample.id));
                  setDirty(true);
                }}
              />
            ))}
          </div>
        </section>}

        <div className="campaign-preparation-navigation">
          {step > 0 && <button className="button button--secondary" type="button" onClick={() => setStep(value => value - 1)}>← Quay lại</button>}
          {step < 2 && <button className="button button--primary" type="button" onClick={() => setStep(value => value + 1)}>Tiếp tục →</button>}
          {step === 2 && <div className="campaign-preparation-actions">
            {error && <p className="toast toast--error campaign-preparation-action-error" role="alert">{error}</p>}
            {preparationAction === 'SAVE' && <div><button className="button button--primary" type="submit">Lưu bản thảo để tiếp tục</button><p>Lưu bản nháp thành công rồi mới có thể khóa cam kết.</p></div>}
            {preparationAction === 'LOCK' && <div><button className="button button--secondary" type="button" disabled={busy} onClick={() => void run(() => freezeCampaign(campaign.id, campaign.revision ?? 0), 'Đã khóa cam kết PDF.')}>Khóa cam kết để tạo Judge case</button><p>Bản nháp đã lưu. Khóa sẽ tạo snapshot bất biến cho Judge committee.</p></div>}
          </div>}
        </div>
      </fieldset>
    </form> : <FrozenTerms campaign={campaign} />}
    {campaign.status === 'FROZEN' && <div className="frozen-submit-box">
      <div className="frozen-submit-box__info">
        <div className="frozen-submit-box__desc">
          <strong>Hồ sơ sẵn sàng thẩm định</strong>
          <p>Gửi hồ sơ riêng để tạo Judge case. Hồ sơ chưa xuất hiện với backer; chỉ các Judge được chọn ngẫu nhiên mới có quyền bỏ phiếu.</p>
        </div>
      </div>
      {needsCreatorResponse && <section className="campaign-creator-response" aria-labelledby={`campaign-creator-response-title-${campaign.id}`}>
        <div>
          <span className="campaign-creator-response__eyebrow">REVISION RESPONSE</span>
          <h4 id={`campaign-creator-response-title-${campaign.id}`}>Phản hồi chung của Creator</h4>
          <p className="campaign-preparation-help">Cảm ơn và giải thích ngắn gọn bạn đã điều chỉnh hồ sơ ra sao. Không cần trả lời từng góp ý.</p>
        </div>
        <label className="field">Phản hồi chung
          <textarea value={responseBody} minLength={10} maxLength={3000} required onChange={event => setResponseBody(event.target.value)} />
        </label>
        {feedbackQuery.isPending ? <p className="campaign-preparation-help" role="status">Đang tải góp ý để gắn vào revision…</p> : feedbackHistory.length > 0 && <fieldset className="campaign-creator-response__links">
          <legend>Gắn với góp ý cụ thể · tùy chọn</legend>
          {feedbackHistory.map(item => <label key={item.id} className="campaign-creator-response__chip">
            <input type="checkbox" checked={relatedFeedbackIds.includes(item.id)} onChange={event => setRelatedFeedbackIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
            <span><strong>{item.kind === 'ISSUE' ? 'Báo sự cố' : 'Nhận xét'}</strong> · {item.body}</span>
          </label>)}
        </fieldset>}
        {(feedbackQuery.data?.responses?.length ?? 0) > 0 && <div className="campaign-creator-response__history" aria-label="Lịch sử phản hồi Creator">
          {feedbackQuery.data!.responses!.map(response => <p key={response.id}><strong>Revision {response.submissionRevision}:</strong> {response.responseBody}</p>)}
        </div>}
      </section>}
      <div className="frozen-submit-box__action">
        <button className="button button--primary" disabled={busy} onClick={() => {
          const response = responseBody.trim();
          if (needsCreatorResponse && response.length < 10) { setError('Hãy viết phản hồi chung tối thiểu 10 ký tự trước khi tạo lại Judge case.'); return; }
          void run(() => submitCampaignReview(campaign.id, campaign.revision ?? 0, {
            ...(response ? { responseBody: response } : {}),
            ...(relatedFeedbackIds.length ? { relatedFeedbackIds } : {}),
          }), 'Đã gửi hồ sơ riêng cho Judge committee.')
        }}>Tạo Judge case</button>
      </div>
    </div>}
    {campaign.status === 'UNDER_REVIEW_PRIVATE' && (
      <div className="preparation-status-banner preparation-status-banner--info">
        <div className="preparation-status-banner__main">
          <div className="preparation-status-banner__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="preparation-status-banner__content">
            <strong>Đang thẩm định hồ sơ</strong>
            <p>Hồ sơ đã gửi riêng cho Judge committee. Campaign chưa xuất hiện với backer và chưa nhận phản hồi cộng đồng.</p>
          </div>
        </div>
        <span className="preparation-status-banner__badge">
          ● Đang kiểm tra riêng
        </span>
      </div>
    )}
    {campaign.status === 'APPROVED' && (
      <div className="preparation-status-banner preparation-status-banner--success">
        <div className="preparation-status-banner__main">
          <div className="preparation-status-banner__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="preparation-status-banner__content">
            <strong>Hồ sơ đã được phê duyệt</strong>
            <p>Hồ sơ đã được duyệt. Publish và nhận pledge chưa mở.</p>
          </div>
        </div>
        <span className="preparation-status-banner__badge">
          ● Đã duyệt
        </span>
      </div>
    )}
  </div>;
}

