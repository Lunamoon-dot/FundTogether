import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, keccak256, parseEventLogs, toHex } from 'viem';
import {
  listMyRewardCampaigns,
  createRewardCampaignDraft,
  freezeRewardCampaign,
  submitCampaignReview,
  registerRewardOnchain,
  completeRewardCampaign,
  getCreatorProfile,
  applyCreatorVerification,
  syncRewardReceipt,
} from '../../lib/api/reward';
import { buildEditionsDraft } from './editions-draft';
import { EditionsPreparationPanel } from './EditionsReview';
import type { RewardCampaign } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import {
  rewardAbi,
  rewardContractAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

export function RewardCreatorStudio({ userId }: { userId: string }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['my-reward-creator-profile', userId],
    queryFn: ({ signal }) => getCreatorProfile(signal),
  });

  const { data: campaigns, isPending, error, refetch } = useQuery({
    queryKey: ['my-reward-campaigns', userId],
    queryFn: ({ signal }) => listMyRewardCampaigns(signal),
    refetchInterval: 10_000,
  });

  // Flow V1 Creator Verification State
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [ipDeclaration, setIpDeclaration] = useState(
    'Tôi cam kết là tác giả/đồng tác giả hợp pháp sở hữu 100% bản quyền xuất bản tác phẩm này.'
  );

  // Draft Creation Form State
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [story, setStory] = useState('');
  const [goal, setGoal] = useState('1000'); // USDC
  const [duration, setDuration] = useState(30); // days
  const [price, setPrice] = useState('10');
  const [rewardTitle, setRewardTitle] = useState('Ấn phẩm PDF');
  const [rewardDescription, setRewardDescription] = useState('Một file PDF hoàn chỉnh của truyện tranh hoặc artbook.');

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  async function handleApplyProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    setSuccessNotice('');
    try {
      await applyCreatorVerification({ displayName, bio, ipDeclaration });
      setSuccessNotice('Đã gửi hồ sơ xác minh Tác giả (Flow V1). Vui lòng chờ Admin phê duyệt.');
      void refetchProfile();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSuccessNotice('');
    setBusy(true);

    try {
      if (title.trim().length < 5) throw new Error('Tiêu đề dự án phải từ 5 ký tự trở lên.');
      if (pitch.trim().length < 10) throw new Error('Lời giới thiệu (Pitch) phải từ 10 ký tự trở lên.');
      const payload = buildEditionsDraft({
        title, pitch, story, goal, durationDays: duration, price, rewardTitle, rewardDescription,
      });

      await createRewardCampaignDraft(payload);
      setSuccessNotice('Đã lưu bản thảo Editions. Mở hồ sơ để bổ sung trang mẫu, khóa cam kết và gửi thẩm định.');
      setTitle('');
      setPitch('');
      setStory('');
      void refetch();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFreeze(campaignId: string) {
    setBusy(true);
    setFormError('');
    try {
      await freezeRewardCampaign(campaignId);
      setSuccessNotice('Đã đóng băng cam kết phần thưởng thành công! Tiếp theo hãy gửi Resolver thẩm định (Flow V2).');
      void refetch();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitReview(campaignId: string) {
    setBusy(true);
    setFormError('');
    try {
      await submitCampaignReview(campaignId);
      setSuccessNotice('Đã gửi chiến dịch sang trạng thái UNDER_REVIEW để Resolver thẩm định (Flow V2).');
      void refetch();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishOnchain(c: RewardCampaign) {
    if (c.draftConfig != null || c.category === 'COMICS_ARTBOOK') {
      setFormError('Editions hiện chỉ hỗ trợ bản thảo, chưa mở phát hành on-chain.');
      return;
    }
    if (!account.address || !client || !wallet || busy) {
      setFormError('Vui lòng kết nối ví để phát hành hợp đồng on-chain.');
      return;
    }
    setBusy(true);
    setFormError('');
    setSuccessNotice('');

    try {
      const commitment = (c.commitmentHash || ('0x' + '1'.repeat(64))) as `0x${string}`;
      const goalUnits = BigInt(c.goal);
      const durationSeconds = BigInt(c.fundingDuration >= 86400 ? c.fundingDuration : c.fundingDuration * 86400);

      const tierInputs = (c.tiers || []).map(t => ({
        price: BigInt(t.price),
        maxQuantity: BigInt(t.maxQuantity),
        pledgedQuantity: 0n,
        isDigital: Boolean(t.isDigital),
      }));

      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'createCampaign',
        args: [commitment, goalUnits, durationSeconds, tierInputs],
      });

      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch phát hành hợp đồng bị revert.');

      const logs = parseEventLogs({
        abi: rewardAbi,
        logs: receipt.logs,
        eventName: 'CampaignCreated',
        strict: false,
      });

      const onchainId = (logs[0]?.args as any)?.campaignId?.toString();
      if (onchainId === undefined) {
        throw new Error('Không tìm thấy sự kiện CampaignCreated từ hợp đồng Reward.');
      }
      await registerRewardOnchain(c.id, onchainId, hash);

      setSuccessNotice(`Phát hành On-chain & đồng bộ Indexer thành công với Campaign ID #${onchainId}!`);
      void refetch();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestProductionDeposit(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet || busy) {
      setFormError('Vui lòng kết nối ví tác giả để gửi yêu cầu tạm ứng cọc in ấn.');
      return;
    }
    setBusy(true);
    setFormError('');
    setSuccessNotice('');
    try {
      const depositAmount = BigInt(c.goal) / 2n;
      const reqHash = keccak256(toHex(`deposit-request-${c.id}-${Date.now()}`));
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'submitDisbursementRequest',
        args: [BigInt(c.onchainCampaignId), reqHash, account.address, depositAmount],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch submitDisbursementRequest bị revert.');

      await syncRewardReceipt(hash);
      setSuccessNotice('Đã gửi yêu cầu tạm ứng cọc in ấn (50% Goal) trên chuỗi và đồng bộ Indexer!');
      void refetch();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteCampaignOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet || busy) {
      setFormError('Vui lòng kết nối ví để xác nhận hoàn tất chiến dịch trên chuỗi.');
      return;
    }
    setBusy(true);
    setFormError('');
    setSuccessNotice('');
    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'completeCampaign',
        args: [BigInt(c.onchainCampaignId)],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch completeCampaign bị revert.');

      await completeRewardCampaign(c.id, hash);
      setSuccessNotice('Chiến dịch đã được đóng hoàn tất (COMPLETED) trên hợp đồng và đồng bộ DB!');
      void refetch();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reward-container">
      <header className="reward-hero">
        <span className="reward-badge-category">FundTogether Editions · Creator Studio</span>
        <h1 className="reward-hero-title">Truyện tranh & Artbook PDF</h1>
        <p className="reward-hero-pitch">
          Chuẩn bị một ấn phẩm PDF với một gói Standard. Hiện tại chỉ lưu bản thảo; chưa mở nhận tiền hoặc tải PDF.
        </p>
      </header>

      {formError && <p className="toast toast--error" role="alert">{formError}</p>}
      {successNotice && <p className="toast toast--success" role="status">{successNotice}</p>}

      {/* Flow V1: Creator Verification Section */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Bước 0 (Flow V1): Hồ sơ Xác minh Tác giả & Bản quyền IP</h2>
          <span className="reward-status-pill status-active">
            {profile?.status || 'CHƯA ĐĂNG KÝ'}
          </span>
        </div>
        {profile?.status === 'VERIFIED' ? (
          <p className="muted" style={{ marginTop: '8px' }}>
            ✓ Bút danh <strong>{profile.displayName}</strong> đã được Admin xác minh bản quyền (Flow V1). Bạn có thể khởi tạo bản thảo Editions.
          </p>
        ) : (
          <form onSubmit={handleApplyProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <label>
              Bút danh / Tên Studio xuất bản:
              <input required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ví dụ: Studio Truyện Tranh Việt" />
            </label>
            <label>
              Tiểu sử & Kinh nghiệm sáng tác:
              <textarea required rows={2} value={bio} onChange={e => setBio(e.target.value)} placeholder="Giới thiệu tác giả, các tác phẩm đã xuất bản..." />
            </label>
            <label>
              Cam kết Bản quyền Sở hữu Trí tuệ (IP Declaration):
              <textarea required rows={2} value={ipDeclaration} onChange={e => setIpDeclaration(e.target.value)} />
            </label>
            <button type="submit" className="button button--primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
              {profile ? 'Cập nhật & Gửi lại Hồ sơ V1' : 'Gửi Hồ sơ Xác minh Tác giả (V1)'}
            </button>
          </form>
        )}
      </section>

      {/* Form Section */}
      <section className="panel">
        <h2>Tạo bản thảo FundTogether Editions</h2>
        <form onSubmit={handleCreateDraft} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <label>
              Tên dự án:
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Truyện tranh Địa Đàng Ký - Tập 1" />
            </label>
            <label>
              Thể loại:
              <input value="COMICS_ARTBOOK · Truyện tranh / Artbook" readOnly />
            </label>
          </div>

          <label>
            Lời giới thiệu ngắn (Pitch):
            <input required value={pitch} onChange={e => setPitch(e.target.value)} placeholder="Tóm tắt nội dung và điểm đặc sắc trong 1-2 câu" />
          </label>

          <label>
            Cốt truyện & Kế hoạch sản xuất:
            <textarea rows={4} value={story} onChange={e => setStory(e.target.value)} placeholder="Giới thiệu nội dung, số trang dự kiến và kế hoạch hoàn thiện PDF..." />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <label>
              Mục tiêu dự kiến (MockUSDC local):
              <input required type="text" inputMode="decimal" value={goal} onChange={e => setGoal(e.target.value)} />
            </label>
            <label>
              Thời hạn gây quỹ (Số ngày, 1 - 60):
              <input required type="number" min="1" max="60" value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </label>
          </div>

          <div className="reward-studio-tiers-builder">
            <strong>Standard · Một PDF tải xuống</strong>
            <p className="muted">Một truyện tranh hoặc artbook hoàn chỉnh. PDF cuối cùng được nộp ở bước phát hành sau này.</p>
            <div className="reward-tier-builder-row">
              <label>
                Tên ấn phẩm PDF:
                <input required minLength={3} maxLength={150} value={rewardTitle} onChange={e => setRewardTitle(e.target.value)} />
              </label>
              <label>
                Giá gói dự kiến (MockUSDC local):
                <input required inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
              </label>
              <label>
                Nội dung PDF được hứa hẹn:
                <textarea required minLength={5} maxLength={1000} value={rewardDescription} onChange={e => setRewardDescription(e.target.value)} />
              </label>
            </div>
          </div>

          <button type="submit" className="button button--primary" disabled={busy || profile?.status !== 'VERIFIED'} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Đang lưu…' : 'Lưu Bản thảo Chiến dịch'}
          </button>
        </form>
      </section>

      {/* Creator Campaigns List */}
      <section className="panel">
        <h2>Dự án của bạn ({campaigns?.length ?? 0})</h2>
        {isPending ? (
          <p className="muted">Đang tải danh sách…</p>
        ) : error ? (
          <p className="toast toast--error">{getErrorMessage(error)}</p>
        ) : (campaigns || []).length === 0 ? (
          <p className="muted">Bạn chưa tạo chiến dịch truyện tranh nào.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            {campaigns!.map(c => {
              const editions = c.draftConfig != null || c.category === 'COMICS_ARTBOOK';
              const standardTier = c.draftConfig?.tiers[0];
              const pdf = standardTier?.rewardItems[0];
              return (
              <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>{c.title}</h3>
                    <span className="reward-status-pill status-active" style={{ fontSize: '11px' }}>{c.status}</span>
                    <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '10px' }}>
                      Mục tiêu: {editions ? formatUnits(BigInt(c.goal), 6) : (Number(c.goal) / 1e6).toLocaleString()} MockUSDC · {c.draftConfig?.tiers.length ?? c.tiers?.length ?? 0} gói
                      {c.onchainCampaignId ? ` · On-chain #${c.onchainCampaignId}` : ''}
                    </span>
                    {standardTier && pdf && (
                      <div>
                        <p><strong>{pdf.title}</strong> · Standard PDF · {formatUnits(BigInt(standardTier.price), 6)} MockUSDC</p>
                        <p className="muted">{pdf.description}</p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {editions && <p className="muted">Standard PDF · Hoàn thiện hồ sơ và gửi thẩm định; bản thảo chưa nhận pledge.</p>}
                    {editions && c.frozenSnapshot && ['UNDER_REVIEW', 'APPROVED'].includes(c.status) && <a className="button button--secondary" href={`#/reward/editions/${c.id}/creator`}>Mở community & phát hành PDF local</a>}
                    {!editions && c.status === 'DRAFT' && (
                      <button className="button button--secondary" disabled={busy} onClick={() => void handleFreeze(c.id)}>
                        1. Đóng băng cam kết
                      </button>
                    )}
                    {!editions && c.status === 'FROZEN' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handleSubmitReview(c.id)}>
                        2. Gửi Resolver thẩm định (V2)
                      </button>
                    )}
                    {!editions && c.status === 'APPROVED' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handlePublishOnchain(c)}>
                        3. Phát hành On-chain
                      </button>
                    )}
                    {!editions && c.status === 'ACTIVE' && (
                      <button className="button button--secondary" disabled={busy} onClick={() => void handleRequestProductionDeposit(c)}>
                        Yêu cầu cọc in ấn (≤50% Goal)
                      </button>
                    )}
                    {!editions && c.status === 'FULFILLMENT_COMPLETE' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handleCompleteCampaignOnchain(c)}>
                        Hoàn tất Chiến dịch On-chain (completeCampaign)
                      </button>
                    )}
                    {!editions && <a className="button button--secondary" href={`#/reward/campaigns/${c.id}`}>
                      Xem công khai
                    </a>}

                  </div>
                </div>

                {editions && <EditionsPreparationPanel campaign={c} onChange={() => void refetch()} />}

              </div>
            ); })}
          </div>
        )}
      </section>
    </div>
  );
}

