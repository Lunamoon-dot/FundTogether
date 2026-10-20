import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createCampaignDraft, listWallets, updatePreparation, uploadSample as uploadSampleFile } from '../api/campaigns';
import type { Campaign } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { buildDraft, validateDraft, type DraftErrors, type DraftFields, type DraftField } from './draft';
import { getDefaultPayoutWalletLinkId, getPreparationFieldError, getPreparationRequiredFieldError, validatePreparation } from './preparation-validation';
type NewPreparationFields = DraftFields & {
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
  payoutWalletLinkId: string;
};

export function NewPreparationPanel({ onCreated }: { onCreated: (campaign: Campaign) => void | Promise<unknown> }) {
  const { data: wallets, error: walletError } = useQuery({
    queryKey: ['campaign-campaign-wallets', 'new-draft'],
    queryFn: ({ signal }) => listWallets(signal),
  });
  const [fields, setFields] = useState<NewPreparationFields>({
    title: '', pitch: '', story: '', goal: '1000', durationDays: 30, price: '10',
    benefitTitle: 'Ấn phẩm PDF', benefitDescription: 'Một file PDF hoàn chỉnh của truyện tranh hoặc artbook.',
    contentOutline: '', budgetPlan: '', evidencePlan: '', payoutWalletLinkId: '',
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [step, setStep] = useState(0);
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const draftErrors: DraftErrors = validateDraft(fields);
  const payoutWalletLinkId = getDefaultPayoutWalletLinkId(fields.payoutWalletLinkId, wallets ?? []);
  const stepTitles = ['Thông tin ấn phẩm', 'Mục tiêu gây quỹ', 'Kế hoạch hoàn thiện'];

  function setField(name: keyof NewPreparationFields, value: string | number) {
    setFields(old => ({ ...old, [name]: value }));
  }

  function textField(name: keyof NewPreparationFields, label: string, multiline = false, type = 'text', required = true, minLength?: number, maxLength?: number) {
    const value = String(fields[name]);
    const draftField = name as DraftField;
    const draftError = draftField in draftErrors && blurred[name] ? draftErrors[draftField] : undefined;
    const preparationField = name === 'contentOutline' || name === 'budgetPlan' || name === 'evidencePlan' ? name : undefined;
    const preparationError = preparationField && blurred[name] ? getPreparationFieldError(preparationField, value) : undefined;
    const fieldError = draftError || preparationError;
    const inputId = `new-campaign-${String(name)}`;
    const errorId = `${inputId}-error`;
    const props = {
      id: inputId,
      value,
      required,
      minLength,
      maxLength,
      'aria-invalid': fieldError ? true : undefined,
      'aria-describedby': fieldError ? errorId : undefined,
      onBlur: () => { if (minLength) setBlurred(old => ({ ...old, [name]: true })); },
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(name, event.target.value),
    };
    return <label className="field" key={String(name)}>{label}{multiline ? <textarea {...props} /> : <input {...props} type={type} />}{fieldError && <span id={errorId} className="field-error" role="alert">{fieldError}</span>}</label>;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    const firstDraftError = Object.values(draftErrors)[0];
    if (firstDraftError) {
      setBlurred(old => ({ ...old, ...Object.fromEntries(Object.keys(draftErrors).map(name => [name, true])) }));
      setError(firstDraftError);
      return;
    }
    const requiredError = getPreparationRequiredFieldError(payoutWalletLinkId);
    if (requiredError) {
      setError(requiredError);
      return;
    }
    const preparationError = Object.values(validatePreparation(fields))[0];
    if (preparationError) {
      setBlurred(old => ({ ...old, contentOutline: true, budgetPlan: true, evidencePlan: true }));
      setError(preparationError);
      return;
    }
    if (selectedFiles.length === 0) {
      setError('Chọn ít nhất một tài liệu mẫu riêng tư để Judge committee thẩm định.');
      return;
    }

    setBusy(true);
    try {
      const config = buildDraft({
        ...fields,
      });
      const campaign = await createCampaignDraft(config);
      const samples = [];
      for (const file of selectedFiles) samples.push(await uploadSampleFile(campaign.id, file));
      const savedCampaign = await updatePreparation(campaign.id, {
        revision: campaign.revision ?? 0,
        config,
        preparation: {
          payoutWalletLinkId,
          sampleIds: samples.map(sample => sample.id),
          contentOutline: fields.contentOutline,
          budgetPlan: fields.budgetPlan,
          evidencePlan: fields.evidencePlan,
        },
      });
      setNotice('Đã lưu bản nháp và hồ sơ chuẩn bị.');
      await onCreated(savedCampaign);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return <div className="campaign-preparation" style={{ marginTop: 16 }}>
    {error && <p role="alert" className="toast toast--error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {walletError && <p role="alert">{getErrorMessage(walletError)}</p>}
    <form onSubmit={save}>
      <div className="campaign-preparation-intro">
        <div>
          <span className="campaign-preparation-kicker">FundTogether</span>
          <h3>Tạo campaign trong một hồ sơ duy nhất</h3>
          <p className="muted public-sr-only sr-only">COMICS_ARTBOOK · Truyện tranh / Artbook · một Standard PDF tải xuống.</p>
          <p className="muted public-sr-only sr-only">Điền 3 nhóm thông tin, lưu một lần ở bước cuối. Sau đó hồ sơ sẽ xuất hiện trong Studio để bạn kiểm tra và tạo Judge case.</p>
        </div>
        <ol className="campaign-preparation-steps" aria-label="Các bước tạo hồ sơ">
          <li className={step === 0 ? 'is-current' : step > 0 ? 'is-complete' : ''}><span>1</span>Thông tin ấn phẩm</li>
          <li className={step === 1 ? 'is-current' : step > 1 ? 'is-complete' : ''}><span>2</span>Mục tiêu gây quỹ</li>
          <li className={step === 2 ? 'is-current' : ''}><span>3</span>Kế hoạch hoàn thiện</li>
        </ol>
      </div>
      <p className="campaign-preparation-step-caption" aria-live="polite">Bước {step + 1} trên 3 · {stepTitles[step]}</p>
      <fieldset disabled={busy} className="campaign-preparation-form">
        <legend>Hồ sơ campaign mới</legend>
        {step === 0 && <section className="campaign-preparation-section">
          <div className="campaign-preparation-section-heading"><span className="campaign-preparation-section-number">1</span><div><h4>Thông tin ấn phẩm</h4><p>Judge committee và backer sẽ biết bạn tạo ấn phẩm gì và họ nhận PDF nào.</p></div></div>
          {textField('title', 'Tên ấn phẩm', false, 'text', true, 5, 200)}
          {textField('pitch', 'Giới thiệu ngắn', false, 'text', true, 10, 500)}
          {textField('story', 'Cốt truyện & Kế hoạch sản xuất: tối thiểu 20 ký tự', true, 'text', true, 20, 20000)}
          {textField('benefitTitle', 'Tên file PDF', false, 'text', true, 3, 150)}
          {textField('benefitDescription', 'PDF sẽ bao gồm nội dung gì?', true, 'text', true, 5, 1000)}
        </section>}
        {step === 1 && <section className="campaign-preparation-section">
          <div className="campaign-preparation-section-heading"><span className="campaign-preparation-section-number">2</span><div><h4>Mục tiêu gây quỹ</h4><p>Đây là thông tin tài chính của một gói Standard PDF duy nhất.</p></div></div>
          {textField('goal', 'Mục tiêu gây quỹ (MockUSDC local)')}
          {textField('price', 'Giá gói PDF (MockUSDC local)')}
          <label className="field">Thời gian gây quỹ (ngày)<input type="number" min={1} max={60} required value={fields.durationDays} onChange={event => setField('durationDays', Number(event.target.value))} /></label>
          <label className="field">Ví Creator nhận tiền (chain 31339)<select required value={payoutWalletLinkId} onChange={event => setField('payoutWalletLinkId', event.target.value)}><option value="">Chọn ví đã liên kết</option>{wallets?.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.address}</option>)}</select></label>
          {(!wallets || wallets.length === 0) && <p className="campaign-preparation-help">Hãy liên kết ít nhất một ví Creator trên chain 31339 trong phần Tài khoản.</p>}
        </section>}
        {step === 2 && <section className="campaign-preparation-section">
          <div className="campaign-preparation-section-heading"><span className="campaign-preparation-section-number">3</span><div><h4>Kế hoạch hoàn thiện</h4><p>Nói rõ bạn sẽ hoàn thiện tác phẩm và chứng minh tiến độ như thế nào.</p></div></div>
          <div className="campaign-input-group"><h5>Nội dung và kế hoạch sản xuất</h5><p className="campaign-preparation-help">Các thông tin này giúp Judge committee hiểu sản phẩm, ngân sách và cách kiểm tra tiến độ.</p>{textField('contentOutline', 'Nội dung PDF sẽ hoàn thiện là gì? · tối thiểu 20 ký tự', true, 'text', true, 20, 10000)}{textField('budgetPlan', 'Ngân sách sẽ dùng cho những hạng mục nào? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}{textField('evidencePlan', 'Bằng chứng nào sẽ chứng minh tiến độ? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}</div>
          <div className="campaign-input-group">
            <h5>Tài liệu mẫu thẩm định</h5>
            <p className="campaign-preparation-help">Bắt buộc chọn ít nhất một file PDF, PNG hoặc JPEG. File chỉ dành cho Judge được phân công, không công khai.</p>
            <p className="campaign-preparation-help">File được giữ trong bản nháp này; sẽ được tải lên khi lưu bản nháp.</p>
            <div className="campaign-uploader">
              <div className="campaign-uploader__action">
                <label htmlFor="new-draft-sample-file" className="campaign-uploader__btn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Chọn tài liệu mẫu
                </label>
                <span className="campaign-uploader__hint">PDF, PNG, JPEG · Tối đa 10 MiB mỗi tệp</span>
              </div>
              <input
                id="new-draft-sample-file"
                type="file"
                multiple
                accept="application/pdf,image/png,image/jpeg"
                style={{ display: 'none' }}
                onChange={event => {
                  const inputFiles = Array.from(event.target.files ?? []);
                  if (inputFiles.length > 0) {
                    const validFiles: File[] = [];
                    for (const f of inputFiles) {
                      if (f.size > 10 * 1024 * 1024) {
                        setError(`File "${f.name}" vượt quá kích thước tối đa 10 MiB.`);
                        continue;
                      }
                      validFiles.push(f);
                    }
                    if (validFiles.length > 0) {
                      setSelectedFiles(old => {
                        const existingKeys = new Set(old.map(f => `${f.name}:${f.size}`));
                        const uniqueNew = validFiles.filter(f => !existingKeys.has(`${f.name}:${f.size}`));
                        return [...old, ...uniqueNew];
                      });
                      setError('');
                    }
                  }
                  event.target.value = '';
                }}
              />

              {selectedFiles.length > 0 && (
                <div className="campaign-uploader__list">
                  {selectedFiles.map((file, idx) => {
                    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                    return (
                      <div key={`${file.name}:${file.size}`} className="campaign-uploader__file">
                        <div className="campaign-uploader__file-info">
                          <span className={`campaign-uploader__badge ${isPdf ? 'campaign-uploader__badge--pdf' : 'campaign-uploader__badge--img'}`}>
                            {isPdf ? 'PDF' : 'IMG'}
                          </span>
                          <span className="campaign-uploader__name">{file.name}</span>
                          <span className="campaign-uploader__size">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                        <button
                          type="button"
                          className="campaign-uploader__remove"
                          onClick={() => setSelectedFiles(old => old.filter((_, i) => i !== idx))}
                          title="Gỡ bỏ file này"
                          aria-label={`Gỡ bỏ ${file.name}`}
                        >
                          ✕ Gỡ
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>}
        <div className="campaign-preparation-navigation">
          {step > 0 && <button className="button button--secondary" type="button" onClick={() => setStep(value => value - 1)}>← Quay lại</button>}
          {step < 2 && <button className="button button--primary" type="button" onClick={() => setStep(value => value + 1)}>Tiếp tục →</button>}
          {step === 2 && <button className="button button--primary" type="submit">{busy ? 'Đang lưu…' : 'Lưu bản nháp để tiếp tục'}</button>}
        </div>
      </fieldset>
    </form>
  </div>;
}
