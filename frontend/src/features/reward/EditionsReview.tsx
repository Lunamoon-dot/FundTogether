import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { freezeEditions, getEditionsSample, listEditionsSamples, listEditionsWallets, reviewEditions, submitEditionsReview, updateEditionsPreparation, uploadEditionsSample } from '../../lib/api/reward';
import type { EditionsSample, RewardCampaign } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import { buildEditionsDraft } from './editions-draft';

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
    <p>Dự kiến phát hành (UTC): {snapshot.preparation.releaseWindow.start} – {snapshot.preparation.releaseWindow.end}</p>
    {snapshot.samples.map(sample => <SampleDownload key={sample.id} campaignId={campaign.id} sample={sample} />)}
    <p className="muted">Review nội dung chưa cho phép nhận pledge hay giải ngân.</p>
  </div>;
}

export function EditionsPreparationPanel({ campaign, onChange }: { campaign: RewardCampaign; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return <div>
    <button type="button" className="button button--secondary" onClick={() => setOpen(value => !value)}>{open ? 'Đóng hồ sơ' : 'Hồ sơ thẩm định PDF'}</button>
    {open && campaign.draftConfig && <PreparationForm key={`${campaign.id}:${campaign.revision}`} campaign={campaign} onChange={onChange} />}
  </div>;
}

function PreparationForm({ campaign, onChange }: { campaign: RewardCampaign; onChange: () => void }) {
  const draft = campaign.draftConfig!;
  const preparation = campaign.reviewPreparation;
  const editable = campaign.status === 'DRAFT';
  const { data: wallets, error: walletError } = useQuery({ queryKey: ['reward-editions-wallets', campaign.creatorUserId], queryFn: ({ signal }) => listEditionsWallets(signal), enabled: editable });
  const { data: samples, error: sampleError, refetch: refetchSamples } = useQuery({ queryKey: ['reward-editions-samples', campaign.id, campaign.creatorUserId], queryFn: ({ signal }) => listEditionsSamples(campaign.id, signal), enabled: editable });
  const [fields, setFields] = useState(() => ({ title: draft.title, pitch: draft.pitch, story: draft.story,
    goal: formatUnits(BigInt(draft.goal), 6), durationDays: draft.fundingDuration / 86400,
    price: formatUnits(BigInt(draft.tiers[0].price), 6), rewardTitle: draft.tiers[0].rewardItems[0].title, rewardDescription: draft.tiers[0].rewardItems[0].description,
    payoutWalletLinkId: preparation?.payoutWalletLinkId ?? '', contentOutline: preparation?.contentOutline ?? '', budgetPlan: preparation?.budgetPlan ?? '', evidencePlan: preparation?.evidencePlan ?? '',
    start: preparation?.releaseWindow.start.slice(0, 10) ?? '', end: preparation?.releaseWindow.end.slice(0, 10) ?? '' }));
  const [selected, setSelected] = useState(preparation?.sampleIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); onChange(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await run(() => {
      const config = buildEditionsDraft(fields);
      config.tiers[0] = { ...draft.tiers[0], price: config.tiers[0].price, rewardItems: config.tiers[0].rewardItems };
      return updateEditionsPreparation(campaign.id, { revision: campaign.revision ?? 0,
      config, preparation: { payoutWalletLinkId: fields.payoutWalletLinkId, sampleIds: selected,
        contentOutline: fields.contentOutline, budgetPlan: fields.budgetPlan, evidencePlan: fields.evidencePlan,
        releaseWindow: { start: new Date(fields.start).toISOString(), end: new Date(fields.end).toISOString() } } });
    }, 'Đã lưu hồ sơ. Kiểm tra lại rồi khóa cam kết.');
  }
  function textField(name: Exclude<keyof typeof fields, 'durationDays' | 'payoutWalletLinkId'>, label: string, multiline = false, type = 'text') {
    const props = { value: fields[name], required: true, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setFields(old => ({ ...old, [name]: e.target.value })); setDirty(true); } };
    return <label className="field" key={name}>{label}{multiline ? <textarea {...props} /> : <input {...props} type={type} />}</label>;
  }
  return <div style={{ marginTop: 16 }}>
    {error && <p role="alert" className="toast toast--error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {(walletError || sampleError) && <p role="alert">{getErrorMessage(walletError || sampleError)}</p>}
    {campaign.reviews?.map(review => <p key={review.id}>Review {review.outcome}: {review.decisionReason}</p>)}
    {editable ? <form onSubmit={save}>
      <fieldset disabled={busy} style={{ display: 'grid', gap: 12 }}>
        <legend>Hồ sơ Editions · revision {campaign.revision ?? 0}</legend>
        {textField('title', 'Tên ấn phẩm')}{textField('pitch', 'Giới thiệu')}{textField('story', 'Nội dung campaign', true)}
        {textField('goal', 'Mục tiêu (MockUSDC)')}{textField('price', 'Giá standard PDF (MockUSDC)')}
        <label className="field">Thời gian gây quỹ (ngày)<input type="number" min={1} max={60} value={fields.durationDays} onChange={e => { setFields(old => ({ ...old, durationDays: Number(e.target.value) })); setDirty(true); }} /></label>
        {textField('rewardTitle', 'Tên PDF')}{textField('rewardDescription', 'Mô tả PDF', true)}
        <label className="field">Ví nhận tiền đã liên kết (chain 31339)<select required value={fields.payoutWalletLinkId} onChange={e => { setFields(old => ({ ...old, payoutWalletLinkId: e.target.value })); setDirty(true); }}>
          <option value="">Chọn ví đã xác minh bằng chữ ký</option>{wallets?.map(wallet => <option value={wallet.id} key={wallet.id}>{wallet.address}</option>)}
        </select></label>
        {wallets?.length === 0 && <p>Liên kết ví trong phần tài khoản trước khi khóa hồ sơ.</p>}
        {textField('contentOutline', 'Đề cương tác phẩm', true)}{textField('budgetPlan', 'Kế hoạch ngân sách', true)}{textField('evidencePlan', 'Kế hoạch nộp bằng chứng', true)}
        {textField('start', 'Bắt đầu cửa sổ phát hành (UTC)', false, 'date')}{textField('end', 'Kết thúc cửa sổ phát hành (UTC)', false, 'date')}
        <label className="field">Trang mẫu riêng tư (PDF, PNG, JPEG; tối đa 10 MiB/file)
          <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (file) void run(async () => { const uploaded = await uploadEditionsSample(campaign.id, file); setSelected(old => [...old, uploaded.id]); setDirty(true); await refetchSamples(); }, 'Đã lưu file mẫu riêng tư; lưu hồ sơ để gắn vào cam kết.');
          }} />
        </label>
        {samples?.map(sample => <div key={sample.id}><label><input type="checkbox" checked={selected.includes(sample.id)} onChange={e => { setSelected(old => e.target.checked ? [...old, sample.id] : old.filter(id => id !== sample.id)); setDirty(true); }} /> Gắn trang mẫu vào hồ sơ</label><SampleDownload campaignId={campaign.id} sample={sample} /></div>)}
        <button className="button button--primary" type="submit">Lưu hồ sơ thẩm định</button>
        <button className="button button--secondary" type="button" disabled={!preparation || dirty} onClick={() => void run(() => freezeEditions(campaign.id, campaign.revision ?? 0), 'Đã khóa cam kết PDF.')}>Khóa cam kết PDF đã lưu</button>
      </fieldset>
    </form> : <EditionsFrozenTerms campaign={campaign} />}
    {campaign.status === 'FROZEN' && <><p>Khi gửi thẩm định, nội dung campaign, ngân sách, kế hoạch bằng chứng và các hash được công khai để community kiểm tra. File mẫu và hồ sơ danh tính vẫn riêng tư.</p><button className="button button--primary" disabled={busy} onClick={() => void run(() => submitEditionsReview(campaign.id, campaign.revision ?? 0), 'Đã gửi Resolver thẩm định.')}>Gửi Resolver thẩm định</button></>}
    {campaign.status === 'APPROVED' && <p>Hồ sơ đã được duyệt. Publish và nhận pledge chưa mở.</p>}
  </div>;
}

export function EditionsResolverReview({ campaign, onChange }: { campaign: RewardCampaign; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') {
    if (!campaign.commitmentHash) return;
    setBusy(true); setError('');
    try { await reviewEditions(campaign.id, { outcome, decisionReason: reason, commitmentHash: campaign.commitmentHash }); onChange(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <h3>{campaign.title} · {campaign.status}</h3>
    <EditionsFrozenTerms campaign={campaign} />
    {campaign.reviews?.map(review => <p key={review.id}>{review.outcome}: {review.decisionReason}</p>)}
    {error && <p role="alert">{error}</p>}
    {campaign.status === 'UNDER_REVIEW' && <fieldset disabled={busy}>
      <legend>Quyết định trên bản cam kết này</legend>
      <label className="field">Nhận xét thẩm định (10–2000 ký tự)<textarea minLength={10} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="button button--primary" disabled={reason.trim().length < 10} onClick={() => void decide('APPROVED')}>Duyệt hồ sơ PDF</button>
      <button className="button button--secondary" disabled={reason.trim().length < 10} onClick={() => void decide('CHANGES_REQUESTED')}>Yêu cầu sửa</button>
      <button className="button button--secondary" disabled={reason.trim().length < 10} onClick={() => void decide('REJECTED')}>Từ chối</button>
    </fieldset>}
  </section>;
}
