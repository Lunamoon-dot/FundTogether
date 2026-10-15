import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { createRewardCampaignDraft, freezeEditions, getEditionsSample, listEditionsSamples, listEditionsWallets, openEditionsCommunityReview, reviewEditions, submitEditionsReview, updateEditionsPreparation, uploadEditionsSample } from '../../lib/api/reward';
import type { EditionsSample, RewardCampaign } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import { buildEditionsDraft, validateEditionsDraft, type EditionsDraftErrors, type EditionsDraftFields, type EditionsDraftField } from './editions-draft';
import { getDefaultPayoutWalletLinkId, getEditionsPreparationFieldError, getEditionsPreparationRequiredFieldError, getPreparationAction, validateEditionsPreparation } from './editions-preparation-validation';

function resolverStatusLabel(status: string) {
  const labels: Record<string, string> = {
    UNDER_REVIEW_PRIVATE: 'Đang kiểm tra riêng',
    COMMUNITY_REVIEW: 'Chờ Resolver quyết định',
    APPROVED: 'Đã duyệt · chờ kích hoạt',
    CHANGES_REQUESTED: 'Cần Creator bổ sung',
    REJECTED: 'Đã từ chối',
    STOPPED: 'Đã dừng',
  };
  return labels[status] ?? status;
}

function SampleDownload({ campaignId, sample }: { campaignId: string; sample: EditionsSample }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      const file = await getEditionsSample(campaignId, sample.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sample-${sample.id}.${sample.mediaType === 'application/pdf' ? 'pdf' : sample.mediaType === 'image/png' ? 'png' : 'jpg'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" className="button button--secondary" disabled={busy} onClick={() => void download()}>Tải trang mẫu · {sample.mediaType} · {sample.sizeBytes} bytes</button>
    <p className="muted" style={{ overflowWrap: 'anywhere' }}>SHA-256: {sample.sha256}</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function EditionsFrozenTerms({ campaign }: { campaign: RewardCampaign }) {
  const snapshot = campaign.frozenSnapshot;
  if (!snapshot) return <p>Chưa có snapshot đã khóa.</p>;
  const tier = snapshot.config.tiers[0];
  return <div>
    <h4>Cam kết PDF đã khóa</h4>
    <p style={{ overflowWrap: 'anywhere' }}>SHA-256: {campaign.commitmentHash}</p>
    <p>{snapshot.config.title} · {formatUnits(BigInt(tier.price), 6)} MockUSDC / standard PDF</p>
    <p>{snapshot.config.pitch}</p><p>{snapshot.config.story}</p>
    <p>Gói {tier.title}: {tier.description}</p>
    <p>{tier.rewardItems[0].title}: {tier.rewardItems[0].description}</p>
    {tier.estimatedDeliveryAt && <p>Ngày dự kiến: {tier.estimatedDeliveryAt}</p>}
    <p>Mục tiêu: {formatUnits(BigInt(snapshot.config.goal), 6)} MockUSDC · Gây quỹ: {snapshot.config.fundingDuration / 86400} ngày</p>
    <p>Tác giả: {snapshot.creator.displayName} · Cam kết quyền IP: {snapshot.creator.ipDeclaration}</p>
    <p>Ví đã liên kết: {snapshot.payoutWallet.address} · chain {snapshot.payoutWallet.chainId}</p>
    <p>Đề cương: {snapshot.preparation.contentOutline}</p>
    <p>Ngân sách: {snapshot.preparation.budgetPlan}</p>
    <p>Bằng chứng dự kiến: {snapshot.preparation.evidencePlan}</p>
    <p>Hạn cam kết phát hành PDF (UTC): {snapshot.preparation.releaseWindow.end}</p>
    {snapshot.samples.map(sample => <SampleDownload key={sample.id} campaignId={campaign.id} sample={sample} />)}
    <p className="muted">Review nội dung chưa cho phép nhận pledge hay giải ngân.</p>
  </div>;
}

export function EditionsPreparationPanel({ campaign, onChange, initialStep }: { campaign: RewardCampaign; onChange: () => void | Promise<unknown>; initialStep?: 0 | 1 | 2 }) {
  const defaultStep: 0 | 1 | 2 = initialStep !== undefined
    ? initialStep
    : (campaign.status === 'CHANGES_REQUESTED' ? 2 : 0);
  const [open, setOpen] = useState(campaign.status === 'DRAFT' || campaign.status === 'CHANGES_REQUESTED');
  return <div>
    <button type="button" className="button button--secondary" onClick={() => setOpen(value => !value)}>{open ? 'Đóng hồ sơ' : 'Hồ sơ thẩm định PDF'}</button>
    {open && campaign.draftConfig && <PreparationForm key={campaign.id} campaign={campaign} onChange={onChange} initialStep={defaultStep} />}
  </div>;
}

function PreparationForm({ campaign, onChange, initialStep }: { campaign: RewardCampaign; onChange: () => void | Promise<unknown>; initialStep: 0 | 1 | 2 }) {
  const draft = campaign.draftConfig!;
  const tier = draft.tiers?.[0] ?? {};
  const reward = tier.rewardItems?.[0] ?? {};
  const preparation = campaign.reviewPreparation;
  const editable = campaign.status === 'DRAFT';
  const queryClient = useQueryClient();
  const sampleQueryKey = ['reward-editions-samples', campaign.id, campaign.creatorUserId] as const;
  const { data: wallets, error: walletError } = useQuery({ queryKey: ['reward-editions-wallets', campaign.creatorUserId], queryFn: ({ signal }) => listEditionsWallets(signal), enabled: editable });
  const { data: samples, error: sampleError, refetch: refetchSamples } = useQuery({ queryKey: sampleQueryKey, queryFn: ({ signal }) => listEditionsSamples(campaign.id, signal), enabled: editable });
  const [fields, setFields] = useState(() => ({ title: draft.title ?? '', pitch: draft.pitch ?? '', story: draft.story ?? '',
    goal: formatUnits(BigInt(draft.goal ?? campaign.goal ?? '0'), 6), durationDays: Number(draft.fundingDuration ?? 2592000) / 86400,
    price: formatUnits(BigInt(tier.price ?? campaign.goal ?? '0'), 6), rewardTitle: reward.title ?? 'Final PDF', rewardDescription: reward.description ?? '',
    payoutWalletLinkId: preparation?.payoutWalletLinkId ?? '', contentOutline: preparation?.contentOutline ?? '', budgetPlan: preparation?.budgetPlan ?? '', evidencePlan: preparation?.evidencePlan ?? '',
    estimatedDeliveryAt: tier.estimatedDeliveryAt?.slice(0, 10) ?? '', end: preparation?.releaseWindow.end.slice(0, 10) ?? '' }));
  const payoutWalletLinkId = getDefaultPayoutWalletLinkId(fields.payoutWalletLinkId, wallets ?? []);
  const [selected, setSelected] = useState(preparation?.sampleIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadingSample, setUploadingSample] = useState('');
  const [dirty, setDirty] = useState(false);
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<number>(initialStep);
  const stepTitles = ['Thông tin ấn phẩm', 'Mục tiêu gây quỹ', 'Kế hoạch hoàn thiện và phát hành'];
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
      setError('Chọn ít nhất một tài liệu mẫu riêng tư để Resolver thẩm định.');
      return;
    }
    const requiredFieldError = getEditionsPreparationRequiredFieldError(payoutWalletLinkId, fields.end);
    if (requiredFieldError) {
      setError(requiredFieldError);
      return;
    }
    const textErrors = validateEditionsPreparation(fields);
    const firstTextError = Object.values(textErrors)[0];
    if (firstTextError) {
      setError(firstTextError);
      return;
    }
    if (await run(() => {
      const config = buildEditionsDraft({ ...fields, estimatedDeliveryAt: fields.estimatedDeliveryAt ? `${fields.estimatedDeliveryAt}T00:00:00.000Z` : undefined });
      config.tiers[0] = { ...draft.tiers[0], price: config.tiers[0].price, rewardItems: config.tiers[0].rewardItems, estimatedDeliveryAt: config.tiers[0].estimatedDeliveryAt };
      return updateEditionsPreparation(campaign.id, { revision: campaign.revision ?? 0,
      config, preparation: { payoutWalletLinkId, sampleIds: selected,
        contentOutline: fields.contentOutline, budgetPlan: fields.budgetPlan, evidencePlan: fields.evidencePlan,
        releaseWindow: { start: new Date(fields.end).toISOString(), end: new Date(fields.end).toISOString() } } });
    }, 'Đã lưu hồ sơ. Kiểm tra lại rồi khóa cam kết.')) setDirty(false);
  }
  async function uploadSample(file: File) {
    setUploadingSample(file.name);
    try {
      await run(async () => {
        const uploaded = await uploadEditionsSample(campaign.id, file);
        setSelected(old => [...old, uploaded.id]);
        setDirty(true);
        queryClient.setQueryData<EditionsSample[]>(sampleQueryKey, old => [...(old ?? []), uploaded]);
        await refetchSamples();
      }, 'Đã lưu tài liệu mẫu riêng tư; lưu hồ sơ để gắn vào cam kết.');
    } finally {
      setUploadingSample('');
    }
  }
  function textField(name: Exclude<keyof typeof fields, 'durationDays' | 'payoutWalletLinkId'>, label: string, multiline = false, type = 'text', required = true, minLength?: number, maxLength?: number) {
    const preparationField = name === 'contentOutline' || name === 'budgetPlan' || name === 'evidencePlan' ? name : undefined;
    const fieldError = preparationField && blurred[name] ? getEditionsPreparationFieldError(preparationField, String(fields[name])) : undefined;
    const inputId = `editions-preparation-${name}`;
    const errorId = `${inputId}-error`;
    const props = { id: inputId, value: fields[name], required, minLength, maxLength, 'aria-invalid': fieldError ? true : undefined,
      'aria-describedby': fieldError ? errorId : undefined,
      onBlur: () => { if (minLength) setBlurred(old => ({ ...old, [name]: true })); },
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setFields(old => ({ ...old, [name]: e.target.value })); setDirty(true); } };
    return <label className="field" key={name}>{label}{multiline ? <textarea {...props} /> : <input {...props} type={type} />}{fieldError && <span id={errorId} className="field-error" role="alert">{fieldError}</span>}</label>;
  }
  return <div className="editions-preparation" style={{ marginTop: 16 }}>
    {error && <p role="alert" className="toast toast--error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {(walletError || sampleError) && <p role="alert">{getErrorMessage(walletError || sampleError)}</p>}
    {campaign.reviews?.map(review => <p key={review.id}>Review {review.outcome}: {review.decisionReason}</p>)}
    {editable ? <form onSubmit={save}>
      <div className="editions-preparation-intro">
        <div>
          <span className="editions-preparation-kicker">Hồ sơ Editions</span>
          <h3>Hoàn thiện bản thảo trước khi gửi Resolver</h3>
          <p className="muted">Điền theo 3 nhóm dưới đây, dùng mũi tên để quay lại hoặc đi tiếp. Ở bước 3 mới lưu bản nháp hoặc khóa cam kết; chưa có pledge và chưa có giao dịch tiền.</p>
        </div>
        <ol className="editions-preparation-steps" aria-label="Các bước hoàn thiện hồ sơ">
          <li className={step === 0 ? 'is-current' : step > 0 ? 'is-complete' : ''}><span>1</span>Thông tin ấn phẩm</li>
          <li className={step === 1 ? 'is-current' : step > 1 ? 'is-complete' : ''}><span>2</span>Mục tiêu gây quỹ</li>
          <li className={step === 2 ? 'is-current' : ''}><span>3</span>Kế hoạch phát hành</li>
        </ol>
      </div>
      <p className="editions-preparation-step-caption" aria-live="polite">Bước {step + 1} trên 3 · {stepTitles[step]}</p>
      <fieldset disabled={busy} className="editions-preparation-form">
        <legend>Hồ sơ Editions · revision {campaign.revision ?? 0}</legend>
        {step === 0 && <section className="editions-preparation-section">
          <div className="editions-preparation-section-heading">
            <span className="editions-preparation-section-number">1</span>
            <div><h4>Thông tin ấn phẩm</h4><p>Giúp Resolver hiểu bạn đang tạo ấn phẩm gì và người ủng hộ sẽ nhận PDF nào.</p></div>
          </div>
          {textField('title', 'Tên ấn phẩm')}{textField('pitch', 'Giới thiệu ngắn')}{textField('story', 'Câu chuyện và kế hoạch sản xuất', true)}
          {textField('rewardTitle', 'Tên file PDF')}{textField('rewardDescription', 'PDF sẽ bao gồm nội dung gì?', true)}
        </section>}

        {step === 1 && <section className="editions-preparation-section">
          <div className="editions-preparation-section-heading">
            <span className="editions-preparation-section-number">2</span>
            <div><h4>Mục tiêu gây quỹ</h4><p>Đây là thông tin tài chính của một gói Standard PDF duy nhất.</p></div>
          </div>
          {textField('goal', 'Mục tiêu gây quỹ (MockUSDC local)')}{textField('price', 'Giá gói PDF (MockUSDC local)')}
          <label className="field">Thời gian gây quỹ (ngày)<input type="number" min={1} max={60} value={fields.durationDays} onChange={e => { setFields(old => ({ ...old, durationDays: Number(e.target.value) })); setDirty(true); }} /></label>
          <label className="field">Ví nhận tiền đã xác minh (chain 31339)<select required value={payoutWalletLinkId} onChange={e => { setFields(old => ({ ...old, payoutWalletLinkId: e.target.value })); setDirty(true); }}>
            <option value="">Chọn ví đã xác minh bằng chữ ký</option>{wallets?.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.address}</option>)}
          </select></label>
          {wallets?.length === 0 && <p className="editions-preparation-help">Liên kết ví trong phần tài khoản trước khi khóa hồ sơ.</p>}
        </section>}

        {step === 2 && <section className="editions-preparation-section">
          <div className="editions-preparation-section-heading">
            <span className="editions-preparation-section-number">3</span>
            <div><h4>Kế hoạch hoàn thiện và phát hành</h4><p>Nói rõ bạn sẽ hoàn thiện tác phẩm, chứng minh tiến độ và phát hành PDF như thế nào.</p></div>
          </div>
          <div className="editions-input-group">
            <h5>Nội dung và kế hoạch sản xuất</h5>
            <p className="editions-preparation-help">Các thông tin này giúp Resolver hiểu sản phẩm, ngân sách và cách kiểm tra tiến độ.</p>
            {textField('contentOutline', 'Nội dung PDF sẽ hoàn thiện là gì? · tối thiểu 20 ký tự', true, 'text', true, 20, 10000)}
            {textField('budgetPlan', 'Ngân sách sẽ dùng cho những hạng mục nào? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}
            {textField('evidencePlan', 'Bằng chứng nào sẽ chứng minh tiến độ? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}
          </div>
          <div className="editions-input-group">
            <h5>Mốc phát hành</h5>
            <p className="editions-preparation-help">Chọn ngày theo lịch. Hệ thống lưu mốc ngày tại 00:00 UTC.</p>
            <div className="editions-delivery-fields">
              {textField('estimatedDeliveryAt', 'Ngày dự kiến phát hành PDF · tùy chọn', false, 'date', false)}
              <p className="editions-preparation-help">Ngày tham khảo cho backer; có thể thay đổi theo tiến độ và không tự mở hoàn tiền.</p>
              {textField('end', 'Hạn cam kết phát hành PDF · bắt buộc', false, 'date')}
              <p className="editions-preparation-help">Mốc policy dùng để xác định bước tiếp theo nếu PDF chưa được Resolver duyệt.</p>
            </div>
          </div>
          <div className="editions-input-group">
            <h5>Tài liệu mẫu thẩm định</h5>
            <p className="editions-preparation-help">Bắt buộc chọn ít nhất một file PDF, PNG hoặc JPEG. File chỉ dành cho Resolver, không công khai.</p>
            <label className="field">Tài liệu mẫu riêng tư · tối đa 10 MiB/file
              <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => {
                const file = e.target.files?.[0]; e.target.value = '';
                if (file) void uploadSample(file);
              }} />
            </label>
            {uploadingSample && <p className="editions-preparation-help" role="status">Đang tải tài liệu mẫu lên: {uploadingSample}… Danh sách sẽ cập nhật ngay sau khi máy chủ xác nhận.</p>}
            {samples?.map(sample => <div key={sample.id}><label><input type="checkbox" checked={selected.includes(sample.id)} onChange={e => { setSelected(old => e.target.checked ? [...old, sample.id] : old.filter(id => id !== sample.id)); setDirty(true); }} /> Gắn tài liệu này vào hồ sơ</label><SampleDownload campaignId={campaign.id} sample={sample} /></div>)}
          </div>
        </section>}

        <div className="editions-preparation-navigation">
          {step > 0 && <button className="button button--secondary" type="button" onClick={() => setStep(value => value - 1)}>← Quay lại</button>}
          {step < 2 && <button className="button button--primary" type="button" onClick={() => setStep(value => value + 1)}>Tiếp tục →</button>}
          {step === 2 && <div className="editions-preparation-actions">
            {error && <p className="toast toast--error editions-preparation-action-error" role="alert">{error}</p>}
            {preparationAction === 'SAVE' && <div><button className="button button--primary" type="submit">Lưu bản thảo để tiếp tục</button><p>Lưu bản nháp thành công rồi mới có thể khóa cam kết.</p></div>}
            {preparationAction === 'LOCK' && <div><button className="button button--secondary" type="button" disabled={busy} onClick={() => void run(() => freezeEditions(campaign.id, campaign.revision ?? 0), 'Đã khóa cam kết PDF.')}>Khóa cam kết để gửi Resolver</button><p>Bản nháp đã lưu. Khóa sẽ tạo snapshot bất biến để gửi Resolver.</p></div>}
          </div>}
        </div>
      </fieldset>
    </form> : <EditionsFrozenTerms campaign={campaign} />}
    {campaign.status === 'FROZEN' && <><p>Gửi hồ sơ riêng cho Resolver. Hồ sơ chưa xuất hiện với backer; chỉ Resolver mới có thể mở community review sau khi kiểm tra bước đầu.</p><button className="button button--primary" disabled={busy} onClick={() => void run(() => submitEditionsReview(campaign.id, campaign.revision ?? 0), 'Đã gửi hồ sơ riêng cho Resolver.')}>Gửi Resolver thẩm định</button></>}
    {campaign.status === 'UNDER_REVIEW_PRIVATE' && <p>Hồ sơ đã gửi riêng cho Resolver. Campaign chưa xuất hiện với backer và chưa nhận phản hồi cộng đồng.</p>}
    {campaign.status === 'APPROVED' && <p>Hồ sơ đã được duyệt. Publish và nhận pledge chưa mở.</p>}
  </div>;
}

type NewEditionsPreparationFields = EditionsDraftFields & {
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
  end: string;
  payoutWalletLinkId: string;
};

export function NewEditionsPreparationPanel({ onCreated }: { onCreated: (campaign: RewardCampaign) => void | Promise<unknown> }) {
  const { data: wallets, error: walletError } = useQuery({
    queryKey: ['reward-editions-wallets', 'new-draft'],
    queryFn: ({ signal }) => listEditionsWallets(signal),
  });
  const [fields, setFields] = useState<NewEditionsPreparationFields>({
    title: '', pitch: '', story: '', goal: '1000', durationDays: 30, price: '10',
    rewardTitle: 'Ấn phẩm PDF', rewardDescription: 'Một file PDF hoàn chỉnh của truyện tranh hoặc artbook.',
    estimatedDeliveryAt: '', contentOutline: '', budgetPlan: '', evidencePlan: '', end: '', payoutWalletLinkId: '',
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [step, setStep] = useState(0);
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const draftErrors: EditionsDraftErrors = validateEditionsDraft(fields);
  const payoutWalletLinkId = getDefaultPayoutWalletLinkId(fields.payoutWalletLinkId, wallets ?? []);
  const stepTitles = ['Thông tin ấn phẩm', 'Mục tiêu gây quỹ', 'Kế hoạch hoàn thiện và phát hành'];

  function setField(name: keyof NewEditionsPreparationFields, value: string | number) {
    setFields(old => ({ ...old, [name]: value }));
  }

  function textField(name: keyof NewEditionsPreparationFields, label: string, multiline = false, type = 'text', required = true, minLength?: number, maxLength?: number) {
    const value = String(fields[name]);
    const draftField = name as EditionsDraftField;
    const draftError = draftField in draftErrors && blurred[name] ? draftErrors[draftField] : undefined;
    const preparationField = name === 'contentOutline' || name === 'budgetPlan' || name === 'evidencePlan' ? name : undefined;
    const preparationError = preparationField && blurred[name] ? getEditionsPreparationFieldError(preparationField, value) : undefined;
    const fieldError = draftError || preparationError;
    const inputId = `new-editions-${String(name)}`;
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
    const requiredError = getEditionsPreparationRequiredFieldError(payoutWalletLinkId, fields.end);
    if (requiredError) {
      setBlurred(old => ({ ...old, end: true }));
      setError(requiredError);
      return;
    }
    const preparationError = Object.values(validateEditionsPreparation(fields))[0];
    if (preparationError) {
      setBlurred(old => ({ ...old, contentOutline: true, budgetPlan: true, evidencePlan: true }));
      setError(preparationError);
      return;
    }
    if (selectedFiles.length === 0) {
      setError('Chọn ít nhất một tài liệu mẫu riêng tư để Resolver thẩm định.');
      return;
    }

    setBusy(true);
    try {
      const config = buildEditionsDraft({
        ...fields,
        estimatedDeliveryAt: fields.estimatedDeliveryAt ? `${fields.estimatedDeliveryAt}T00:00:00.000Z` : undefined,
      });
      const campaign = await createRewardCampaignDraft(config);
      const samples = [];
      for (const file of selectedFiles) samples.push(await uploadEditionsSample(campaign.id, file));
      const savedCampaign = await updateEditionsPreparation(campaign.id, {
        revision: campaign.revision ?? 0,
        config,
        preparation: {
          payoutWalletLinkId,
          sampleIds: samples.map(sample => sample.id),
          contentOutline: fields.contentOutline,
          budgetPlan: fields.budgetPlan,
          evidencePlan: fields.evidencePlan,
          releaseWindow: { start: `${fields.end}T00:00:00.000Z`, end: `${fields.end}T00:00:00.000Z` },
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

  return <div className="editions-preparation" style={{ marginTop: 16 }}>
    {error && <p role="alert" className="toast toast--error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {walletError && <p role="alert">{getErrorMessage(walletError)}</p>}
    <form onSubmit={save}>
      <div className="editions-preparation-intro">
        <div>
          <span className="editions-preparation-kicker">FundTogether Editions</span>
          <h3>Tạo campaign trong một hồ sơ duy nhất</h3>
          <p className="muted">COMICS_ARTBOOK · Truyện tranh / Artbook · một Standard PDF tải xuống.</p>
          <p className="muted">Điền 3 nhóm thông tin, lưu một lần ở bước cuối. Sau đó hồ sơ sẽ xuất hiện trong Studio để bạn kiểm tra và khóa gửi Resolver.</p>
        </div>
        <ol className="editions-preparation-steps" aria-label="Các bước tạo hồ sơ">
          <li className={step === 0 ? 'is-current' : step > 0 ? 'is-complete' : ''}><span>1</span>Thông tin ấn phẩm</li>
          <li className={step === 1 ? 'is-current' : step > 1 ? 'is-complete' : ''}><span>2</span>Mục tiêu gây quỹ</li>
          <li className={step === 2 ? 'is-current' : ''}><span>3</span>Kế hoạch phát hành</li>
        </ol>
      </div>
      <p className="editions-preparation-step-caption" aria-live="polite">Bước {step + 1} trên 3 · {stepTitles[step]}</p>
      <fieldset disabled={busy} className="editions-preparation-form">
        <legend>Hồ sơ campaign mới</legend>
        {step === 0 && <section className="editions-preparation-section">
          <div className="editions-preparation-section-heading"><span className="editions-preparation-section-number">1</span><div><h4>Thông tin ấn phẩm</h4><p>Resolver và backer sẽ biết bạn tạo ấn phẩm gì và họ nhận PDF nào.</p></div></div>
          {textField('title', 'Tên ấn phẩm', false, 'text', true, 5, 200)}
          {textField('pitch', 'Giới thiệu ngắn', false, 'text', true, 10, 500)}
          {textField('story', 'Cốt truyện & Kế hoạch sản xuất: tối thiểu 20 ký tự', true, 'text', true, 20, 20000)}
          {textField('rewardTitle', 'Tên file PDF', false, 'text', true, 3, 150)}
          {textField('rewardDescription', 'PDF sẽ bao gồm nội dung gì?', true, 'text', true, 5, 1000)}
        </section>}
        {step === 1 && <section className="editions-preparation-section">
          <div className="editions-preparation-section-heading"><span className="editions-preparation-section-number">2</span><div><h4>Mục tiêu gây quỹ</h4><p>Đây là thông tin tài chính của một gói Standard PDF duy nhất.</p></div></div>
          {textField('goal', 'Mục tiêu gây quỹ (MockUSDC local)')}
          {textField('price', 'Giá gói PDF (MockUSDC local)')}
          <label className="field">Thời gian gây quỹ (ngày)<input type="number" min={1} max={60} required value={fields.durationDays} onChange={event => setField('durationDays', Number(event.target.value))} /></label>
          <label className="field">Ví nhận tiền đã xác minh (chain 31339)<select required value={payoutWalletLinkId} onChange={event => setField('payoutWalletLinkId', event.target.value)}><option value="">Chọn ví đã xác minh bằng chữ ký</option>{wallets?.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.address}</option>)}</select></label>
          {wallets?.length === 0 && <p className="editions-preparation-help">Liên kết ví trong phần tài khoản trước khi lưu hồ sơ.</p>}
        </section>}
        {step === 2 && <section className="editions-preparation-section">
          <div className="editions-preparation-section-heading"><span className="editions-preparation-section-number">3</span><div><h4>Kế hoạch hoàn thiện và phát hành</h4><p>Nói rõ bạn sẽ hoàn thiện tác phẩm, chứng minh tiến độ và phát hành PDF như thế nào.</p></div></div>
          <div className="editions-input-group"><h5>Nội dung và kế hoạch sản xuất</h5><p className="editions-preparation-help">Các thông tin này giúp Resolver hiểu sản phẩm, ngân sách và cách kiểm tra tiến độ.</p>{textField('contentOutline', 'Nội dung PDF sẽ hoàn thiện là gì? · tối thiểu 20 ký tự', true, 'text', true, 20, 10000)}{textField('budgetPlan', 'Ngân sách sẽ dùng cho những hạng mục nào? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}{textField('evidencePlan', 'Bằng chứng nào sẽ chứng minh tiến độ? · tối thiểu 20 ký tự', true, 'text', true, 20, 5000)}</div>
          <div className="editions-input-group"><h5>Mốc phát hành</h5><p className="editions-preparation-help">Ngày dự kiến chỉ là mốc tham khảo; hạn cam kết là mốc policy.</p><div className="editions-delivery-fields">{textField('estimatedDeliveryAt', 'Ngày dự kiến phát hành PDF · tùy chọn', false, 'date', false)}{textField('end', 'Hạn cam kết phát hành PDF · bắt buộc', false, 'date')}</div></div>
          <div className="editions-input-group"><h5>Tài liệu mẫu thẩm định</h5><p className="editions-preparation-help">Bắt buộc chọn ít nhất một file PDF, PNG hoặc JPEG. File chỉ dành cho Resolver, không công khai.</p><p className="editions-preparation-help">File được giữ trong bản nháp này; sẽ được tải lên khi lưu bản nháp.</p><label className="field">Tài liệu mẫu riêng tư · tối đa 10 MiB/file<input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={event => { setSelectedFiles(old => [...old, ...Array.from(event.target.files ?? [])]); event.currentTarget.value = ''; }} /></label>{selectedFiles.map(file => <p className="editions-preparation-help" key={`${file.name}:${file.size}`}>✓ {file.name}</p>)}</div>
        </section>}
        <div className="editions-preparation-navigation">
          {step > 0 && <button className="button button--secondary" type="button" onClick={() => setStep(value => value - 1)}>← Quay lại</button>}
          {step < 2 && <button className="button button--primary" type="button" onClick={() => setStep(value => value + 1)}>Tiếp tục →</button>}
          {step === 2 && <button className="button button--primary" type="submit">{busy ? 'Đang lưu…' : 'Lưu bản nháp để tiếp tục'}</button>}
        </div>
      </fieldset>
    </form>
  </div>;
}

export function EditionsResolverReview({ campaign, onChange }: { campaign: RewardCampaign; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openCommunityReview() {
    setBusy(true); setError('');
    try { await openEditionsCommunityReview(campaign.id); onChange(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  async function decide(outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') {
    if (!campaign.commitmentHash) return;
    setBusy(true); setError('');
    try { await reviewEditions(campaign.id, { outcome, decisionReason: reason, commitmentHash: campaign.commitmentHash }); onChange(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className="resolver-review-card" aria-labelledby={`resolver-review-${campaign.id}`}>
    <header className="resolver-review-card__header">
      <div>
        <span className="resolver-section-kicker">Hồ sơ cần xử lý</span>
        <h3 id={`resolver-review-${campaign.id}`}>{campaign.title}</h3>
      </div>
      <span className="resolver-status-pill">{resolverStatusLabel(campaign.status)}</span>
    </header>
    <div className="resolver-review-card__terms"><EditionsFrozenTerms campaign={campaign} /></div>
    {campaign.reviews?.length ? <details className="resolver-history"><summary>Lịch sử thẩm định ({campaign.reviews.length})</summary>{campaign.reviews.map(review => <p key={review.id}><strong>{review.outcome}</strong> · {review.decisionReason}</p>)}</details> : <p className="muted">Chưa có quyết định nào cho bản cam kết hiện tại.</p>}
    {error && <p role="alert" className="resolver-inline-error">{error}</p>}
    {campaign.status === 'UNDER_REVIEW_PRIVATE' && <div className="resolver-next-action"><p>Hồ sơ đã được kiểm tra riêng. Mở community review khi cam kết này sẵn sàng nhận góp ý.</p><button className="button button--primary" disabled={busy} onClick={() => void openCommunityReview()}>Mở community review</button></div>}
    {campaign.status === 'COMMUNITY_REVIEW' && <fieldset className="resolver-decision-panel" disabled={busy}>
      <legend>Quyết định Resolver</legend>
      <p className="resolver-decision-panel__intro">Phản hồi cộng đồng chỉ mang tính tham khảo. Quyết định dưới đây là hành động chính của Resolver.</p>
      <label className="field">Nhận xét thẩm định (10–2000 ký tự)<textarea minLength={10} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="resolver-decision-actions">
        <button className="button button--primary" disabled={reason.trim().length < 10} onClick={() => void decide('APPROVED')}>Duyệt hồ sơ PDF</button>
        <button className="button button--secondary" disabled={reason.trim().length < 10} onClick={() => void decide('CHANGES_REQUESTED')}>Yêu cầu Creator bổ sung</button>
        <button className="button button--secondary" disabled={reason.trim().length < 10} onClick={() => void decide('REJECTED')}>Từ chối hồ sơ</button>
      </div>
    </fieldset>}
  </section>;
}
