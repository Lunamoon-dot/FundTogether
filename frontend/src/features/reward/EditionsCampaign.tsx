import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, keccak256, toHex } from 'viem';
import type { AccountSession } from '../../lib/api/auth';
import { editionsApi } from '../../lib/api/editions';
import type { EditionsEvidence } from '../../lib/api/editions';
import { getErrorMessage } from '../../lib/api/error';
import { useEditionsTransaction } from './useEditionsTransaction';
import './reward.css';

const stages = ['Đang gây quỹ', 'Đang sản xuất', 'Chờ duyệt PDF', 'PDF đã được duyệt', 'Mở hoàn tiền', 'Đã trả Creator'];
const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;
const date = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString('vi-VN');
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EditionsFeed() {
  const query = useQuery({ queryKey: ['reward-editions-public'], queryFn: ({ signal }) => editionsApi.list(signal) });
  return <div className="reward-container">
    <header className="reward-hero"><span className="reward-badge-category">FundTogether Editions</span><h1>Truyện tranh & Artbook độc lập</h1>
      <p>Mỗi campaign là một PDF và một gói standard. Cùng kiểm tra cam kết tác phẩm trước khi ủng hộ.</p>
      <a className="button button--primary" href="#/reward/creator">Tạo bản thảo PDF</a></header>
    <section className="panel"><h2>Pilot local · MockUSDC</h2><p>Không ứng tiền. Creator chỉ nhận tiền sau PDF được Resolver duyệt, hết 7 ngày challenge và không còn tranh chấp mở. Community góp ý; Resolver ra quyết định.</p>
      <p>Không đạt mục tiêu, hủy trước payout hoặc hết thời hạn theo policy sẽ mở hoàn tiền. Sau payout không có hoàn tiền tự động. Không cam kết lưu trữ vĩnh viễn hay DRM.</p></section>
    {query.isPending && <p role="status">Đang tải Editions…</p>}{query.error && <p role="alert">{getErrorMessage(query.error)}</p>}
    {query.data?.length === 0 && <p>Chưa có hồ sơ Editions gửi thẩm định.</p>}
    {query.data?.map(item => <article className="panel" key={item.id}><h2><a href={`#/reward/editions/${item.id}`}>{item.config.title}</a></h2>
      <p>{item.config.pitch}</p><p>{item.creatorDisplayName} · {amount(item.config.tiers[0].price)} / PDF</p>
      <p>{item.status === 'UNDER_REVIEW' ? 'Đang nhận phản hồi và thẩm định; chưa nhận pledge.' : 'Hồ sơ đã duyệt; xem trạng thái hợp đồng trong chi tiết.'}</p>
      <p>{item.feedbackCount} phản hồi gửi tới Creator và Resolver</p></article>)}
    <a href="#/reward/history">Campaign Reward đã tồn tại</a>
  </div>;
}

export function EditionsCampaign({ id, session, mode = 'public' }: { id: string; session: AccountSession | null; mode?: 'public' | 'creator' | 'resolver' }) {
  const userId = session?.userId;
  const preview = useQuery({ queryKey: ['reward-editions-public', id], queryFn: ({ signal }) => editionsApi.preview(id, signal) });
  const approved = preview.data?.status === 'APPROVED';
  const chain = useQuery({ queryKey: ['reward-editions-chain', id], queryFn: ({ signal }) => editionsApi.chain(id, signal), enabled: approved, refetchInterval: 10000 });
  const privateView = Boolean(userId && mode !== 'public');
  const evidence = useQuery({ queryKey: ['reward-editions-evidence', id, privateView ? userId : 'public'], queryFn: ({ signal }) => editionsApi.evidence(id, privateView, signal), enabled: approved && (privateView || chain.data?.status === 'ON_CHAIN_CONFIRMED') });
  const entitlements = useQuery({ queryKey: ['reward-editions-entitlements', userId], queryFn: ({ signal }) => editionsApi.entitlements(signal), enabled: Boolean(userId) && approved });
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState(''); const [file, setFile] = useState<File | null>(null); const [reason, setReason] = useState('');
  const refresh = () => { void chain.refetch(); void evidence.refetch(); void entitlements.refetch(); };
  const tx = useEditionsTransaction(refresh);
  const busy = working || tx.busy;
  const state = chain.data?.snapshot;
  const own = entitlements.data?.find(item => item.campaignId === id && item.access !== 'ORPHANED');
  const onchainId = chain.data?.onchainCampaignId;
  const activeId = onchainId == null ? null : BigInt(onchainId);
  const resolverWallet = chain.data?.deployment.resolver;
  const backupWallet = chain.data?.deployment.backupResolver;
  const canReview = mode === 'resolver' && [resolverWallet, backupWallet].some(value => value && value.toLowerCase() === tx.address?.toLowerCase());
  const pendingProduction = state && !state.productionApproved && state.productionHash !== `0x${'0'.repeat(64)}`;
  const reviewEvidence = evidence.data?.find(item => item.evidenceHash === (state?.state === 2 ? state.releaseEvidenceHash : state?.productionHash));

  async function work(action: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); } finally { setWorking(false); }
  }
  async function publication() {
    await work(async () => {
      const terms = await editionsApi.terms(id);
      const values = [terms.commitmentHash, BigInt(terms.goal), BigInt(terms.price), BigInt(terms.fundingDuration), BigInt(terms.releaseDeadline)];
      await tx.send(mode === 'resolver' ? 'approveCampaign' : 'createCampaign', mode === 'resolver' ? [terms.creatorWallet, ...values] : values,
        { expectedWallet: mode === 'resolver' ? terms.deployment.resolver : terms.creatorWallet });
    });
  }
  async function upload() {
    await work(async () => {
      if (!file || !state) return;
      await editionsApi.upload(id, state.productionApproved ? 'FINAL_PDF' : 'PRODUCTION_EVIDENCE', summary, file);
      setNotice('Đã lưu file riêng tư. Kiểm tra file và hash, rồi gửi yêu cầu thẩm định trên hợp đồng.');
      setFile(null); setSummary(''); await evidence.refetch();
    });
  }
  async function download() {
    await work(async () => {
      if (!own) return;
      const access = await editionsApi.ticket(own.id);
      const blob = await editionsApi.download(access.url);
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = `0x${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
      if (sha256 !== access.sha256) throw new Error('File tải về không khớp hash đã duyệt; báo sự cố cho Resolver.');
      saveBlob(blob, 'edition.pdf'); setNotice('Đã nhận PDF đúng hash. Lượt tải không được xem là bạn đã chấp nhận tác phẩm.');
    });
  }

  if (preview.isPending) return <p role="status">Đang tải cam kết PDF…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;
  const item = preview.data;
  return <div className="reward-container">
    <header className="reward-hero"><span className="reward-badge-category">FundTogether Editions · COMICS_ARTBOOK</span><h1>{item.config.title}</h1><p>{item.config.pitch}</p><p>{item.creatorDisplayName} · Standard PDF · {amount(item.config.tiers[0].price)}</p></header>
    <section className="panel"><h2>Cam kết tác phẩm</h2><p>{item.config.story}</p><p>{item.config.tiers[0].rewardItems[0].description}</p>
      <h3>Đề cương</h3><p>{item.contentOutline}</p><h3>Ngân sách tự sản xuất</h3><p>{item.budgetPlan}</p><h3>Kế hoạch bằng chứng</h3><p>{item.evidencePlan}</p>
      <p>Phát hành dự kiến: {item.releaseWindow.start} – {item.releaseWindow.end}</p><p>Mục tiêu: {amount(item.config.goal)} · {item.config.fundingDuration / 86400} ngày gây quỹ</p>
      <p style={{ overflowWrap: 'anywhere' }}>Cam kết: {item.commitmentHash}</p>
      {item.decisions.map((decision, index) => <p key={index}>Resolver: {decision.outcome} · {decision.reviewedAt}</p>)}
    </section>
    {[error, tx.error, chain.error && getErrorMessage(chain.error), evidence.error && getErrorMessage(evidence.error), entitlements.error && getErrorMessage(entitlements.error)].filter(Boolean).map((message, index) => <p key={index} role="alert">{message}</p>)}
    {notice && <p role="status">{notice}</p>}
    {tx.notice && <p role="status">{tx.notice}</p>}
    {!userId && <p><a href="#/account">Đăng nhập</a> để góp ý, liên kết ví và ủng hộ bằng MockUSDC local.</p>}
    {!approved && <p>Hồ sơ đang thẩm định. Chưa mở pledge.</p>}
    {approved && chain.data && !state && <section className="panel"><h2>Chưa phát hành trên hợp đồng Editions</h2><p>Hồ sơ được duyệt và giao dịch phát hành là hai bước riêng. Primary Resolver ký đúng cam kết trước khi Creator tạo campaign.</p>
      {userId && mode !== 'public' && <button className="button button--primary" disabled={busy} onClick={() => void publication()}>{mode === 'resolver' ? 'Ký duyệt cam kết local' : 'Tạo campaign local từ cam kết'}</button>}</section>}
    {state && activeId !== null && <>
      <section className="panel"><h2>{stages[state.state]}</h2><p>ON_CHAIN_CONFIRMED · Campaign #{onchainId}</p><p>Đã pledge {amount(state.raised)} · Escrow {amount(state.escrowed)}</p>
        <p>Hết gây quỹ: {date(state.fundingDeadline)} · Hạn phát hành: {date(state.releaseDeadline)}</p>
        {state.state === 3 && <p>Challenge đến {date(state.challengeDeadline)} · {state.openDisputes} tranh chấp mở. Payout chỉ sau hạn và không còn tranh chấp.</p>}
        {userId && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.state === 0 && !own && <button disabled={busy} className="button button--primary" onClick={() => void tx.send('pledge', [activeId], { pledgePrice: state.price })}>Ủng hộ {amount(state.price)} · một PDF</button>}
          {state.state === 0 && <button disabled={busy} className="button button--secondary" onClick={() => void tx.send('finalizeFunding', [activeId])}>Chốt kết quả khi hết hạn gây quỹ</button>}
          {state.state === 3 && <button disabled={busy} className="button button--secondary" onClick={() => void tx.send('payout', [activeId])}>Trả Creator khi đủ điều kiện</button>}
          {![4, 5].includes(state.state) && <button disabled={busy} className="button button--secondary" onClick={() => void tx.send('startRefunds', [activeId])}>Mở hoàn tiền khi quá hạn policy</button>}
          {state.state === 4 && own?.access === 'REFUND_ELIGIBLE' && <button disabled={busy} className="button button--primary" onClick={() => void tx.send('claimRefund', [activeId], { expectedWallet: own.backerWallet })}>Nhận hoàn tiền vào ví đã pledge</button>}
          {mode === 'creator' && ![4, 5].includes(state.state) && <button disabled={busy} className="button button--secondary" onClick={() => void tx.send('cancelCampaign', [activeId], { expectedWallet: state.creator })}>Hủy campaign và mở hoàn tiền toàn bộ</button>}
          <button disabled={busy} className="button button--secondary" onClick={refresh}>Tải lại trạng thái canonical</button>
        </div>}
      </section>
      <section className="panel"><h2>Bằng chứng & bản PDF cuối</h2><p>{state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : 'Bằng chứng sản xuất chưa được duyệt.'} Việc duyệt sản xuất chưa mở quyền tải PDF.</p>
        {mode === 'creator' && userId && state.state === 1 && !pendingProduction && <form onSubmit={event => { event.preventDefault(); void upload(); }}>
          <label className="field">{state.productionApproved ? 'PDF cuối riêng tư' : 'Bằng chứng sản xuất riêng tư'} · tối đa 10 MiB<input type="file" accept={state.productionApproved ? 'application/pdf' : 'application/pdf,image/png,image/jpeg'} required onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
          <label className="field">Tóm tắt công khai, không ghi thông tin riêng tư<textarea required minLength={20} maxLength={5000} value={summary} onChange={event => setSummary(event.target.value)} /></label>
          <button disabled={busy || !file} className="button button--primary">Lưu file và hash</button></form>}
        {evidence.data?.map(proof => <div key={proof.id} style={{ marginTop: 16 }}><h3>{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</h3><p>{proof.summary}</p>
          <p style={{ overflowWrap: 'anywhere' }}>File: {proof.sha256}<br />Bằng chứng: {proof.evidenceHash}</p>
          {privateView && <button disabled={busy} className="button button--secondary" onClick={() => void work(async () => saveBlob(await editionsApi.evidenceFile(id, proof.id), proof.mediaType === 'application/pdf' ? 'review.pdf' : 'evidence.png'))}>Tải file để kiểm tra</button>}
          {mode === 'creator' && state.state === 1 && !pendingProduction && ((proof.purpose === 'FINAL_PDF' && state.productionApproved && proof.productionHash === state.productionHash) || (proof.purpose === 'PRODUCTION_EVIDENCE' && !state.productionApproved)) &&
            <button disabled={busy} className="button button--primary" onClick={() => void tx.send(proof.purpose === 'FINAL_PDF' ? 'submitRelease' : 'submitProduction', proof.purpose === 'FINAL_PDF' ? [activeId, proof.sha256, proof.evidenceHash] : [activeId, proof.evidenceHash], { expectedWallet: state.creator })}>Gửi đúng hash này để Resolver duyệt</button>}
        </div>)}
        {mode === 'resolver' && <p>Ký bằng ví Primary Resolver hoặc Backup sau 7 ngày chờ. Community chỉ gửi nhận xét; không có quyền duyệt tiền.</p>}
        {canReview && reviewEvidence && (state.state === 2 || pendingProduction) && <div><p>Kiểm tra file riêng tư và phản hồi community trước khi quyết định.</p>
          {[true, false].map(accepted => <button key={String(accepted)} disabled={busy} className="button button--secondary" onClick={() => void tx.send(state.state === 2 ? 'reviewRelease' : 'reviewProduction', state.state === 2 ? [activeId, state.pdfHash, state.releaseEvidenceHash, accepted] : [activeId, state.productionHash, accepted])}>{accepted ? 'Duyệt' : 'Từ chối'} {state.state === 2 ? 'PDF cuối' : 'bằng chứng sản xuất'}</button>)}</div>}
      </section>
      {own && <section className="panel"><h2>Quyền PDF của bạn</h2><p>{own.access} · {amount(own.amountPaid)}</p>
        {own.access === 'DOWNLOAD_ELIGIBLE' && <><button disabled={busy} className="button button--primary" onClick={() => void download()}>Kiểm tra và tải PDF riêng tư</button>
          <button disabled={busy || Boolean(own.confirmedAt)} className="button button--secondary" onClick={() => void work(async () => { await editionsApi.confirm(own.id); await entitlements.refetch(); })}>{own.confirmedAt ? 'BACKER_CONFIRMED' : 'Tôi đã kiểm tra và xác nhận PDF'}</button></>}
        <p>Lượt tải là nhật ký truy cập. Xác nhận của bạn là phản hồi riêng, không tự giải ngân.</p></section>}
      {userId && (state.state === 3 || chain.data!.challenges.length > 0) && <section className="panel"><h2>Challenge trước payout</h2>
        <label className="field">Lý do / bằng chứng chi tiết gửi Resolver<textarea minLength={10} maxLength={2500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {own && state.state === 3 && <button disabled={busy || reason.trim().length < 10} className="button button--secondary" onClick={() => void work(async () => {
          // Store the report before signing; only the backer's canonical transaction opens a dispute.
          await editionsApi.comment(id, { targetHash: state.releaseEvidenceHash, kind: 'ISSUE', body: reason });
          await tx.send('challengeRelease', [activeId, keccak256(toHex(JSON.stringify(['editions-challenge-v1', id, state.releaseEvidenceHash, reason])))], { expectedWallet: own.backerWallet });
        })}>Gửi báo cáo và challenge bằng ví đã pledge</button>}
        {chain.data!.challenges.map(challenge => <div key={challenge.backer}><p style={{ overflowWrap: 'anywhere' }}>{challenge.backer} · {challenge.resolved ? challenge.upheld ? 'Chấp nhận khiếu nại' : 'Bác khiếu nại' : 'Đang chờ Resolver'}<br />Bằng chứng: {challenge.evidenceHash}</p>
          {canReview && !challenge.resolved && state.state === 3 && [true, false].map(upheld => <button disabled={busy || reason.trim().length < 10} key={String(upheld)} className="button button--secondary" onClick={() => void work(async () => {
            const body = `${upheld ? 'UPHELD' : 'DISMISSED'}: ${reason}`;
            await editionsApi.comment(id, { targetHash: challenge.evidenceHash, kind: 'COMMENT', body });
            await tx.send('resolveChallenge', [activeId, challenge.backer, upheld, keccak256(toHex(body))]);
          })}>{upheld ? 'Chấp nhận: mở hoàn tiền toàn campaign' : 'Bác khiếu nại'}</button>)}</div>)}
        <p>Hết hạn challenge hoặc đã payout: báo sự cố qua phản hồi bên dưới; không có hoàn tiền hợp đồng tự động sau payout.</p>
      </section>}
    </>}
    {userId && <EditionsCommunity id={id} userId={userId} commitmentHash={item.commitmentHash} evidence={evidence.data ?? []} />}
  </div>;
}

export function EditionsCommunity({ id, userId, commitmentHash, evidence = [] }: { id: string; userId: string; commitmentHash: string; evidence?: EditionsEvidence[] }) {
  const query = useQuery({ queryKey: ['reward-editions-feedback', id, userId], queryFn: ({ signal }) => editionsApi.feedback(id, signal) });
  const [body, setBody] = useState(''); const [kind, setKind] = useState<'COMMENT' | 'ISSUE'>('COMMENT'); const [target, setTarget] = useState(commitmentHash);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <section className="panel"><h2>Community kiểm tra cùng Resolver</h2><p>Nội dung gửi tới Creator và Resolver; thành viên khác chỉ thấy số lượng phản hồi. Phản hồi không là phiếu biểu quyết và không tự khóa hay chuyển tiền.</p>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void editionsApi.comment(id, { targetHash: target, kind, body }).then(async () => { setBody(''); await query.refetch(); }).catch(err => setError(getErrorMessage(err))).finally(() => setBusy(false)); }}>
      <label className="field">Nội dung đang kiểm tra<select value={target} onChange={event => setTarget(event.target.value)}><option value={commitmentHash}>Cam kết campaign</option>{evidence.map(item => <option key={item.id} value={item.evidenceHash}>{item.purpose} · {item.evidenceHash.slice(0, 12)}</option>)}</select></label>
      <label className="field">Loại phản hồi<select value={kind} onChange={event => setKind(event.target.value as 'COMMENT' | 'ISSUE')}><option value="COMMENT">Nhận xét</option><option value="ISSUE">Báo sự cố</option></select></label>
      <label className="field">Chi tiết cần kiểm tra<textarea required minLength={10} maxLength={3000} value={body} onChange={event => setBody(event.target.value)} /></label><button disabled={busy} className="button button--primary">Gửi phản hồi có tài khoản</button>
    </form>{(error || query.error) && <p role="alert">{error || getErrorMessage(query.error)}</p>}
    {query.data?.map(item => <div key={item.id}><p>{item.kind} · {item.createdAt} · tài khoản {item.authorUserId}</p><p>{item.body}</p><p style={{ overflowWrap: 'anywhere' }}>Đối tượng: {item.targetHash}</p></div>)}
  </section>;
}

export function EditionsLibrary({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: ['reward-editions-entitlements', userId], queryFn: ({ signal }) => editionsApi.entitlements(signal) });
  return <section className="reward-container"><h1>Thư viện PDF Editions</h1>{query.isPending && <p role="status">Đang kiểm tra quyền canonical…</p>}{query.error && <p role="alert">{getErrorMessage(query.error)}</p>}
    {query.data?.length === 0 && <p>Bạn chưa có pledge Editions đã được indexer xác nhận.</p>}
    {query.data?.map(item => <article className="panel" key={item.id}><a href={`#/reward/editions/${item.campaignId}`}>Mở campaign và quyền PDF</a><p>{item.access} · {amount(item.amountPaid)}</p><p>{item.confirmedAt ? 'BACKER_CONFIRMED' : 'Chưa xác nhận PDF'}</p></article>)}
    <a href="#/reward/history/my-rewards">Quyền lợi Reward đã tồn tại</a></section>;
}
