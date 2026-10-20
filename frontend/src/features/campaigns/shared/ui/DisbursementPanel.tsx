import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, parseUnits, type Address } from 'viem';
import { campaignApi, type CampaignChain, type CampaignPayoutRequest } from '../../api/campaigns';
import { CAMPAIGN_CHAIN_STATE } from './campaignState';

interface DisbursementTransaction {
  send: (functionName: string, args: readonly unknown[], options?: { expectedWallet?: string }) => Promise<void>;
  address?: Address;
  busy: boolean;
}

interface Props {
  campaignId: string;
  userId?: string;
  mode: 'public' | 'creator' | 'resolver';
  chain: CampaignChain;
  transaction: DisbursementTransaction;
  onRefresh: () => void;
}

const money = (value?: string) => value == null ? '—' : `${formatUnits(BigInt(value), 6)} MockUSDC`;
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function DisbursementPanel({ campaignId, userId, mode, chain, transaction, onRefresh }: Props) {
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [breakdown, setBreakdown] = useState('');
  const [explanationFiles, setExplanationFiles] = useState<File[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionOutcome, setDecisionOutcome] = useState<'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT'>('APPROVE');
  const [message, setMessage] = useState('');
  const requests = useQuery({
    queryKey: ['campaign-payout-requests', campaignId, userId],
    queryFn: ({ signal }) => campaignApi.payoutRequests(campaignId, signal),
    enabled: Boolean(userId && chain.status === 'ON_CHAIN_CONFIRMED'),
    refetchInterval: 5000,
  });
  const snapshot = chain.snapshot;
  const activeId = chain.onchainCampaignId == null ? null : BigInt(chain.onchainCampaignId);
  if (!userId || !snapshot || chain.status !== 'ON_CHAIN_CONFIRMED') return null;

  // Older indexed rows can briefly arrive while the v6 snapshot is catching up.
  // Treat missing disbursement fields as zero instead of crashing the campaign page.
  const escrowed = snapshot.escrowed ?? '0';
  const creatorPaid = snapshot.creatorPaid ?? '0';
  const creatorWallet = snapshot.creator;
  const latest = requests.data?.[0];
  const draft = latest?.status === 'DRAFT' ? latest : undefined;
  const pending = latest && ['DRAFT', 'SUBMITTED_ON_CHAIN', 'UNDER_REVIEW'].includes(latest.status) ? latest : undefined;
  const revision = (latest?.revision ?? 0) + 1;
  const canCreate = mode === 'creator' && snapshot.state === CAMPAIGN_CHAIN_STATE.ACTIVE && !pending
    && BigInt(escrowed) > 0n && BigInt(creatorPaid) < BigInt(snapshot.goal);
  const reviewable = latest && ['SUBMITTED_ON_CHAIN', 'UNDER_REVIEW'].includes(latest.status) ? latest : undefined;
  const canDecide = mode === 'resolver' && Boolean(reviewable && transaction.address);

  function validateRequest() {
    const trimmedAmount = amount.trim();
    if (!/^[0-9]+(\.[0-9]{1,6})?$/.test(trimmedAmount)) return 'Hãy nhập số tiền giải ngân hợp lệ, tối đa 6 chữ số thập phân.';
    try {
      if (parseUnits(trimmedAmount, 6) <= 0n) return 'Số tiền giải ngân phải lớn hơn 0.';
    } catch {
      return 'Hãy nhập số tiền giải ngân hợp lệ, tối đa 6 chữ số thập phân.';
    }
    if (title.trim().length < 3) return 'Tiêu đề yêu cầu phải có ít nhất 3 ký tự.';
    if (summary.trim().length < 20) return 'Tóm tắt sử dụng tiền phải có ít nhất 20 ký tự.';
    if (reason.trim().length < 20) return 'Lý do giải ngân phải có ít nhất 20 ký tự.';
    if (breakdown.trim().length < 10) return 'Bảng phân bổ phải có ít nhất 10 ký tự.';
    if (explanationFiles.length === 0) return 'Hãy đính kèm tài liệu giải thích sử dụng tiền.';
    if (revision > 1 && evidenceFiles.length === 0) return 'Từ lần 2, hãy đính kèm bằng chứng sử dụng khoản trước.';
    return null;
  }

  async function signRequest(request: Pick<CampaignPayoutRequest, 'requestHash' | 'amount'>) {
    if (activeId === null) {
      setMessage('Campaign chưa có ID on-chain canonical để ký requestDisbursement.');
      return;
    }
    setMessage('Hãy ký requestDisbursement trong ví.');
    await transaction.send('requestDisbursement', [activeId, request.requestHash, BigInt(request.amount)], { expectedWallet: creatorWallet });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateRequest();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    if (activeId === null) {
      setMessage('Campaign chưa có ID on-chain canonical để ký requestDisbursement.');
      return;
    }
    try {
      const rawAmount = parseUnits(amount.trim(), 6).toString();
      setMessage('Đang lưu yêu cầu giải ngân…');
      const request = await campaignApi.createPayoutRequest(campaignId, { amount: rawAmount, title, summary, reason, breakdown, explanationFiles, evidenceFiles });
      await requests.refetch();
      await signRequest(request);
      setAmount(''); setTitle(''); setSummary(''); setReason(''); setBreakdown(''); setExplanationFiles([]); setEvidenceFiles([]);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo yêu cầu giải ngân.');
    }
  }

  async function retryDraft() {
    if (!draft) return;
    try {
      await signRequest(draft);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể ký lại yêu cầu giải ngân.');
    }
  }

  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!reviewable || activeId === null || !transaction.address || !decisionReason.trim()) return;
    try {
      setMessage('Đang ghi nhận quyết định Resolver…');
      const decision = await campaignApi.preparePayoutDecision(reviewable.id, { outcome: decisionOutcome, reason: decisionReason });
      await requests.refetch();
      const method = decisionOutcome === 'APPROVE' ? 'approveDisbursement' : 'rejectDisbursement';
      setMessage('Đã ghi decision hash. Hãy ký giao dịch trong ví Resolver.');
      await transaction.send(method, [activeId, reviewable.requestHash, decision.decisionHash], { expectedWallet: transaction.address });
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể chuẩn bị quyết định giải ngân.');
    }
  }

  async function download(request: CampaignPayoutRequest, fileId: string, originalName: string) {
    const blob = await campaignApi.payoutFile(campaignId, request.id, fileId);
    saveBlob(blob, originalName);
  }

  return (
    <section id="resolver-focus-disbursement" className="monograph-card space-y-4" aria-labelledby="disbursement-title">
      <span className="monograph-card__kicker">DISBURSEMENT REQUEST · PRIVATE REVIEW</span>
      <h2 id="disbursement-title" className="monograph-card__title">Yêu cầu giải ngân</h2>
      <p className="monograph-card__desc">Creator nêu mục đích, lý do, bảng phân bổ và số tiền cần dùng. Resolver quyết định; Backer và Resolver đều xem được hồ sơ.</p>
      {message && <p className="monograph-alert monograph-alert--info" role="status">{message}</p>}
      {requests.error && <p className="monograph-alert monograph-alert--error">Không đọc được yêu cầu giải ngân.</p>}

      <div className="text-sm space-y-1">
        <p>Escrow còn lại: <strong>{money(escrowed)}</strong></p>
        <p>Creator đã nhận: <strong>{money(creatorPaid)}</strong> / goal {money(snapshot.goal)}</p>
      </div>

      {latest && <article className="border border-[var(--border-hairline)] rounded p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>Lần #{latest.revision} · {latest.status}</strong><span>{money(latest.amount)}</span></div>
        <h3>{latest.title}</h3>
        <p className="whitespace-pre-wrap">{latest.summary}</p>
        <p><strong>Lý do:</strong> {latest.reason}</p>
        <p><strong>Phân bổ:</strong> {latest.breakdown}</p>
        <p className="text-xs font-mono break-all">requestHash: {latest.requestHash}</p>
        {latest.files.map(file => <button key={file.id} type="button" className="button button--quiet button--sm mr-2" onClick={() => void download(latest, file.id, file.originalName)}>{file.purpose === 'USE_EXPLANATION' ? 'Xem tài liệu giải thích' : 'Xem bằng chứng'} · {file.originalName}</button>)}
        {latest.decisions.map(decision => <p key={decision.id} className="text-sm border-t pt-2 mt-2"><strong>{decision.outcome}:</strong> {decision.reason}</p>)}
      </article>}

      {canCreate && <form noValidate className="space-y-3" onSubmit={event => void submit(event)}>
        <h3>Gửi yêu cầu giải ngân lần #{revision}</h3>
        <p className="text-sm text-[var(--ink-subtle)]">Mỗi lần đều cần tài liệu giải thích chi tiết khoản tiền sẽ dùng vào đâu. Từ lần 2, đính kèm thêm bằng chứng sử dụng khoản trước.</p>
        <input required inputMode="decimal" pattern="^[0-9]+(\.[0-9]{1,6})?$" placeholder="Số tiền MockUSDC" value={amount} onChange={event => setAmount(event.target.value)} />
        <input required minLength={3} maxLength={200} placeholder="Tiêu đề yêu cầu" value={title} onChange={event => setTitle(event.target.value)} />
        <textarea required minLength={20} maxLength={2000} placeholder="Tóm tắt dùng tiền vào việc gì" value={summary} onChange={event => setSummary(event.target.value)} />
        <textarea required minLength={20} maxLength={5000} placeholder="Lý do cần giải ngân" value={reason} onChange={event => setReason(event.target.value)} />
        <textarea required minLength={10} maxLength={3000} placeholder="Bảng phân bổ khoản tiền" value={breakdown} onChange={event => setBreakdown(event.target.value)} />
        <label className="text-sm block">1. Tài liệu giải thích sử dụng tiền · bắt buộc ở mọi lần<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setExplanationFiles(Array.from(event.target.files ?? []))} className="mt-1 block w-full text-xs" /></label>
        {revision > 1 && <label className="text-sm block">2. Bằng chứng sử dụng khoản trước · bắt buộc từ lần 2<input required type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={event => setEvidenceFiles(Array.from(event.target.files ?? []))} className="mt-1 block w-full text-xs" /></label>}
        <button disabled={transaction.busy} className="button button--primary" type="submit">Lưu yêu cầu và ký requestDisbursement</button>
      </form>}

      {mode === 'creator' && snapshot.state === CAMPAIGN_CHAIN_STATE.ACTIVE && draft && <div className="space-y-2">
        <p className="text-sm text-[var(--ink-subtle)]">Hồ sơ đã lưu nhưng chưa ký on-chain. Creator cần ký requestDisbursement trong ví để Resolver có thể xem xét.</p>
        <button type="button" className="button button--secondary" disabled={transaction.busy} onClick={() => void retryDraft()}>Ký lại requestDisbursement</button>
      </div>}
      {mode === 'creator' && snapshot.state === CAMPAIGN_CHAIN_STATE.ACTIVE && pending && !draft && <p className="text-sm text-[var(--ink-subtle)]">Đã ghi nhận yêu cầu giải ngân on-chain. Chờ Resolver xem và quyết định.</p>}
      {canDecide && <form className="space-y-3" onSubmit={event => void decide(event)}>
        <h3>Quyết định Resolver</h3>
        <select value={decisionOutcome} onChange={event => setDecisionOutcome(event.target.value as typeof decisionOutcome)}>
          <option value="APPROVE">Duyệt và chuyển tiền</option><option value="CHANGES_REQUESTED">Yêu cầu sửa hồ sơ</option><option value="REJECT">Từ chối</option>
        </select>
        <textarea required minLength={10} maxLength={3000} placeholder="Lý do quyết định" value={decisionReason} onChange={event => setDecisionReason(event.target.value)} />
        <button disabled={transaction.busy} className="button button--primary" type="submit">Ghi quyết định và ký on-chain</button>
      </form>}
    </section>
  );
}
