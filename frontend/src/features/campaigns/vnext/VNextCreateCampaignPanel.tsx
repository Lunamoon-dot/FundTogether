import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import type { VNextDeployment } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { useVNextTransaction } from './vnext-transaction';
import { vnextStageLabel } from './vnext-actions';
import { hashVNextEvidenceFile, sha256VNextEvidence, validateVNextEvidenceFile } from './vnext-evidence-wizard';
import { parseVNextContributionAmount } from './vnext-funding-flow';

function deadlineAfterDays(days: string, chainTimestamp?: bigint): bigint | null {
  if (!/^[0-9]+$/.test(days) || days === '0') return null;
  if (chainTimestamp === undefined) return null;
  try { return chainTimestamp + BigInt(days) * 86_400n; } catch { return null; }
}

export function VNextCreateCampaignPanel({ deployment }: { deployment: VNextDeployment }) {
  const transaction = useVNextTransaction();
  const account = useAccount();
  const { session, sessionLoading, sessionError } = useAccountSession();
  const client = usePublicClient({ chainId: 31339 });
  const chainClock = useQuery({
    queryKey: ['vnext-create-chain-clock', client?.chain?.id],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error('VNext chain clock is unavailable');
      return (await client.getBlock({ blockTag: 'latest' })).timestamp;
    },
    retry: false,
    staleTime: 5_000,
  });
  const [payoutWallet, setPayoutWallet] = useState('');
  const [goal, setGoal] = useState('');
  const [fundingDays, setFundingDays] = useState('7');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [acceptanceCriteriaHash, setAcceptanceCriteriaHash] = useState<string | null>(null);
  const [hashingCriteria, setHashingCriteria] = useState(false);
  const [criteriaHashError, setCriteriaHashError] = useState<string | null>(null);
  const [publicationFile, setPublicationFile] = useState<File | null>(null);
  const [publicationEvidenceHash, setPublicationEvidenceHash] = useState<string | null>(null);
  const [hashingPublication, setHashingPublication] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [createdTransactionHash, setCreatedTransactionHash] = useState<string | null>(null);
  const criteriaHashRequest = useRef(0);
  const publicationHashRequest = useRef(0);

  const createdCampaign = useQuery({
    queryKey: ['vnext-created-campaign', createdTransactionHash],
    enabled: Boolean(createdTransactionHash),
    queryFn: async ({ signal }) => {
      if (!createdTransactionHash) return null;
      const status = await campaignApi.vnextTransaction(createdTransactionHash, signal);
      const event = status.events.find(item => item.eventName === 'CampaignCreated');
      const campaignId = event?.args.campaignId;
      return typeof campaignId === 'string' && /^[0-9]+$/.test(campaignId) ? campaignId : null;
    },
    retry: false,
    refetchInterval: query => query.state.data ? false : 1_500,
  });

  const tokenDecimals = deployment.tokenDecimals;
  const goalResult = tokenDecimals === undefined
    ? { error: 'Deployment chưa xác nhận số chữ số thập phân của MockUSDC.' }
    : parseVNextContributionAmount(goal, tokenDecimals);
  const goalValue = 'amount' in goalResult ? goalResult.amount : undefined;
  const deadline = deadlineAfterDays(fundingDays, chainClock.data);
  const linkedWallet = Boolean(account.address && session?.wallets.some(wallet => (
    wallet.chainId === 31339 && wallet.address.toLowerCase() === account.address?.toLowerCase()
  )));
  const walletReady = Boolean(account.address && account.chainId === 31339 && linkedWallet);
  const ready = Boolean(
    deployment.campaignEscrow
      && /^0x[0-9a-fA-F]{40}$/.test(payoutWallet)
      && goalValue
      && deadline
      && acceptanceCriteriaHash
      && publicationEvidenceHash
      && !hashingCriteria
      && !hashingPublication
      && walletReady,
  );

  const selectPublicationFile = (file: File | null) => {
    const request = ++publicationHashRequest.current;
    setEvidenceError(null);
    setPublicationEvidenceHash(null);
    setHashingPublication(false);
    if (!file) {
      setPublicationFile(null);
      return;
    }
    const error = validateVNextEvidenceFile(file);
    if (error) {
      setPublicationFile(null);
      setEvidenceError(error);
      return;
    }
    setPublicationFile(file);
    setHashingPublication(true);
    void hashVNextEvidenceFile(file)
      .then(hash => { if (publicationHashRequest.current === request) setPublicationEvidenceHash(hash); })
      .catch(() => { if (publicationHashRequest.current === request) setEvidenceError('Không thể đọc file để tạo SHA-256.'); })
      .finally(() => { if (publicationHashRequest.current === request) setHashingPublication(false); });
  };

  const updateAcceptanceCriteria = (value: string) => {
    const request = ++criteriaHashRequest.current;
    setAcceptanceCriteria(value);
    setAcceptanceCriteriaHash(null);
    setCriteriaHashError(null);
    if (!value.trim()) {
      setHashingCriteria(false);
      return;
    }
    setHashingCriteria(true);
    void sha256VNextEvidence(new TextEncoder().encode(value))
      .then(hash => { if (criteriaHashRequest.current === request) setAcceptanceCriteriaHash(hash); })
      .catch(() => { if (criteriaHashRequest.current === request) setCriteriaHashError('Không thể tạo SHA-256 cho tiêu chí này.'); })
      .finally(() => { if (criteriaHashRequest.current === request) setHashingCriteria(false); });
  };

  const createCampaign = async () => {
    if (!ready || !goalValue || !deadline || !acceptanceCriteriaHash || !publicationEvidenceHash) return;
    setCreatedTransactionHash(null);
    const milestoneBudgets = [goalValue];
    const acceptanceCriteriaHashes = [acceptanceCriteriaHash as `0x${string}`];
    const txHash = await transaction.send('campaign', 'createCampaign', [
      payoutWallet as `0x${string}`,
      goalValue,
      deadline,
      milestoneBudgets,
      acceptanceCriteriaHashes,
      publicationEvidenceHash as `0x${string}`,
    ]);
    if (txHash) setCreatedTransactionHash(txHash);
  };

  const walletMessage = !account.address
    ? sessionLoading ? null : 'Kết nối ví để tạo giao dịch.'
    : sessionLoading ? null
      : sessionError ? 'Không kiểm tra được phiên đăng nhập. Thử mở lại phần tài khoản.'
        : account.chainId !== 31339
          ? 'Chuyển ví sang chain local 31339.'
          : !session
            ? 'Đăng nhập và liên kết ví bằng SIWE để gửi giao dịch.'
            : !linkedWallet
              ? 'Liên kết ví hiện tại bằng SIWE để gửi giao dịch.'
              : null;

  return (
    <section className="monograph-card space-y-4" aria-labelledby="vnext-create-title">
      <div>
        <span className="monograph-card__kicker">CREATOR · BƯỚC 1</span>
        <h2 id="vnext-create-title" className="monograph-card__title">Tạo Campaign</h2>
        <p className="text-sm text-[var(--ink-subtle)] m-0">
          Campaign được tạo trên chain và mở publication Judge case. Backer chỉ có thể đóng góp sau khi publication được chấp thuận và final outcome đã được xác nhận.
        </p>
      </div>

      {walletMessage && <p className="monograph-alert m-0" role="status">
        {walletMessage} {!session || !linkedWallet ? <a href="#/account">Mở phần tài khoản</a> : null}
      </p>}
      {sessionError && <p className="text-sm text-[var(--danger)] m-0" role="alert">{sessionError}</p>}

      <div>
        <label className="text-sm block" htmlFor="vnext-payout-wallet">Ví nhận tiền khi milestone được duyệt</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input id="vnext-payout-wallet" className="min-w-0 flex-1 font-mono" value={payoutWallet} onChange={event => setPayoutWallet(event.target.value)} placeholder="0x…" />
          <button type="button" className="button button--secondary" disabled={!account.address} onClick={() => setPayoutWallet(account.address ?? '')}>Dùng ví đang kết nối</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm grid gap-1" htmlFor="vnext-goal">
          Mục tiêu gây quỹ (MockUSDC)
          <input id="vnext-goal" inputMode="decimal" value={goal} onChange={event => setGoal(event.target.value)} placeholder="Ví dụ: 100 hoặc 25.5" aria-describedby="vnext-goal-help" />
          <span id="vnext-goal-help" className="text-xs text-[var(--ink-subtle)]">Nhập số tiền thông thường; hệ thống tự đổi sang token units chính xác.</span>
        </label>
        <label className="text-sm grid gap-1" htmlFor="vnext-funding-days">
          Thời gian nhận đóng góp (ngày)
          <input id="vnext-funding-days" type="number" inputMode="numeric" min="1" step="1" value={fundingDays} onChange={event => setFundingDays(event.target.value)} />
        </label>
      </div>
      {goal && 'error' in goalResult && <p className="text-sm text-[var(--danger)] m-0" role="status">{goalResult.error}</p>}

      <label className="text-sm grid gap-1" htmlFor="vnext-acceptance-criteria">
        Tiêu chí nghiệm thu milestone
        <textarea id="vnext-acceptance-criteria" rows={3} value={acceptanceCriteria} onChange={event => updateAcceptanceCriteria(event.target.value)} placeholder="Ví dụ: Bản artbook hoàn chỉnh, đủ 24 trang, đúng kích thước in A5." />
        <span className="text-xs text-[var(--ink-subtle)]">SHA-256 được tạo từ đúng nội dung bạn nhập, không cần tự tạo hay dán hash. Hash không chứa nội dung; hãy giữ lại tiêu chí để Judge đối chiếu.</span>
      </label>
      {criteriaHashError && <p className="text-sm text-[var(--danger)] m-0" role="alert">{criteriaHashError}</p>}

      <div className="space-y-1">
        <label className="text-sm block" htmlFor="vnext-publication-file">Tệp chứng minh ấn phẩm (PDF, PNG hoặc JPEG)</label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="button button--secondary relative inline-flex">
            <input id="vnext-publication-file" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => { selectPublicationFile(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} />
            <span aria-hidden="true">Chọn tệp</span>
          </label>
          <span className="text-sm" role="status">{publicationFile?.name ?? 'Chưa chọn tệp'}</span>
        </div>
        <p className="text-xs text-[var(--ink-subtle)] m-0">Tệp tối đa 10 MiB. Sau khi tạo campaign, mở campaign và tải lên đúng tệp này trong Judge case; hệ thống sẽ đối chiếu hash.</p>
        {publicationFile && <p className="text-sm m-0" role="status">{hashingPublication ? 'Đang tạo SHA-256…' : `Đã đọc: ${publicationFile.name}`}</p>}
        {evidenceError && <p className="text-sm text-[var(--danger)] m-0" role="alert">{evidenceError}</p>}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Xem hash sẽ ghi lên chain</summary>
        <dl className="mt-2 grid gap-2">
          <div><dt className="muted">Tiêu chí milestone · SHA-256</dt><dd className="font-mono break-all">{acceptanceCriteriaHash ?? 'Nhập tiêu chí để tạo hash.'}</dd></div>
          <div><dt className="muted">Tệp chứng minh · SHA-256</dt><dd className="font-mono break-all">{publicationEvidenceHash ?? 'Chọn tệp để tạo hash.'}</dd></div>
        </dl>
      </details>

      <p className="text-sm text-[var(--ink-subtle)] m-0">Bản demo dùng một milestone với ngân sách bằng mục tiêu gây quỹ. Tệp được tải riêng vào Judge case; hash không thay thế việc Judge đánh giá nội dung.</p>
      <button type="button" className="button button--primary" disabled={!ready || transaction.busy} onClick={() => void createCampaign()}>
        {transaction.busy ? 'Đang chờ xác nhận…' : 'Tạo campaign và mở Judge case'}
      </button>

      {transaction.stage !== 'idle' && <p className="text-sm m-0" role="status">{vnextStageLabel(transaction.stage)}{transaction.txHash ? ` · ${transaction.txHash}` : ''}</p>}
      {createdTransactionHash && !createdCampaign.data && <p className="text-sm m-0" role="status">Đang chờ indexer xác nhận CampaignCreated. Không gửi lại giao dịch này.</p>}
      {createdCampaign.data && <div className="monograph-alert monograph-alert--success space-y-2" role="status">
        <p className="m-0">Campaign #{createdCampaign.data} đã được xác nhận trong projection; publication Judge case đã mở.</p>
        <a className="button button--secondary" href={`#/campaigns/vnext/${createdCampaign.data}`}>Mở Campaign #{createdCampaign.data}</a>
      </div>}
      {transaction.error && <p className="monograph-alert monograph-alert--error" role="alert">{transaction.error}</p>}
    </section>
  );
}
