import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { keccak256, parseEventLogs, toHex } from 'viem';
import {
  listMyRewardCampaigns,
  createRewardCampaignDraft,
  freezeRewardCampaign,
  submitCampaignReview,
  registerRewardOnchain,
  completeRewardCampaign,
  createFulfillmentBatch,
  listEntitlementsToFulfill,
  markRewardEntitlementDelivered,
  getCreatorProfile,
  applyCreatorVerification,
  syncRewardReceipt,
} from '../../lib/api/reward';
import type { RewardCampaign, CreateRewardCampaignInput } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import {
  rewardAbi,
  rewardContractAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

interface TierDraft {
  title: string;
  description: string;
  price: string;
  maxQuantity: number;
  isDigital: boolean;
  rewardItemsStr: string;
}

export function RewardCreatorStudio() {
  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['my-reward-creator-profile'],
    queryFn: ({ signal }) => getCreatorProfile(signal),
  });

  const { data: campaigns, isPending, error, refetch } = useQuery({
    queryKey: ['my-reward-campaigns'],
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
  const [category, setCategory] = useState<'COMICS' | 'ARTBOOK' | 'ILLUSTRATION' | 'OTHER'>('COMICS');
  const [goal, setGoal] = useState('1000'); // USDC
  const [duration, setDuration] = useState(30); // days
  const [tiers, setTiers] = useState<TierDraft[]>([
    {
      title: 'Ấn phẩm số Early Bird (Digital PDF)',
      description: 'Nhận file truyện tranh PDF độ phân giải cao kèm artbook số và postcard điện tử.',
      price: '10',
      maxQuantity: 100,
      isDigital: true,
      rewardItemsStr: 'File PDF độ phân giải cao, Artbook kỹ thuật số, Lời cảm ơn đặc biệt',
    },
    {
      title: 'Tập 1 Bản in Giấy Định Lượng Cao (Bìa Cứng)',
      description: 'Sách in offset bìa cứng mạ kim ép nhũ, kèm bộ 3 postcard và bookmark độc quyền.',
      price: '25',
      maxQuantity: 200,
      isDigital: false,
      rewardItemsStr: 'Sách in bìa cứng 180 trang, 3 postcard giới hạn, Bookmark ép kim, File PDF bản số',
    },
  ]);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [selectedCampaignForBatch, setSelectedCampaignForBatch] = useState<string | null>(null);

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

  function addTierRow() {
    setTiers(prev => [
      ...prev,
      {
        title: `Gói quà #${prev.length + 1}`,
        description: 'Mô tả chi tiết các phần quà đi kèm...',
        price: '30',
        maxQuantity: 50,
        isDigital: false,
        rewardItemsStr: 'Sách in, Quà tặng giới hạn',
      },
    ]);
  }

  function updateTierRow(idx: number, patch: Partial<TierDraft>) {
    setTiers(prev => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function removeTierRow(idx: number) {
    if (tiers.length <= 1) return;
    setTiers(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSuccessNotice('');
    setBusy(true);

    try {
      if (title.trim().length < 5) throw new Error('Tiêu đề dự án phải từ 5 ký tự trở lên.');
      if (pitch.trim().length < 10) throw new Error('Lời giới thiệu (Pitch) phải từ 10 ký tự trở lên.');
      if (Number(goal) <= 0) throw new Error('Mục tiêu gây quỹ phải lớn hơn 0 USDC.');

      const formattedTiers = tiers.map(t => {
        const p = Math.round(Number(t.price) * 1e6).toString();
        const items = t.rewardItemsStr.split(',').map(s => s.trim()).filter(Boolean);
        return {
          title: t.title,
          description: t.description,
          price: p,
          maxQuantity: Number(t.maxQuantity),
          isDigital: Boolean(t.isDigital),
          rewardItems: items,
        };
      });

      const payload: CreateRewardCampaignInput = {
        title,
        pitch,
        story,
        category,
        goal: Math.round(Number(goal) * 1e6).toString(),
        fundingDuration: duration * 86400,
        policyHash: '0x' + '1'.repeat(64),
        tiers: formattedTiers,
      };

      await createRewardCampaignDraft(payload);
      setSuccessNotice('Tạo bản thảo chiến dịch thành công! Bạn có thể đóng băng cam kết và gửi thẩm định ở danh sách bên dưới.');
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
        <span className="reward-badge-category">Studio Tác giả · Creator Studio</span>
        <h1 className="reward-hero-title">Quản lý Xuất bản & Cam kết Phần thưởng</h1>
        <p className="reward-hero-pitch">
          Xác minh bản quyền (V1), thiết lập gói quà tặng (Tiers), thẩm định cam kết (V2), phát hành hợp đồng thông minh và quản lý giao nhận (V4).
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
            ✓ Bút danh <strong>{profile.displayName}</strong> đã được Admin xác minh bản quyền (Flow V1). Bạn có toàn quyền khởi tạo chiến dịch mới.
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
        <h2>Khởi tạo Chiến dịch Truyện tranh / Sách ảnh Mới</h2>
        <form onSubmit={handleCreateDraft} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <label>
              Tên dự án:
              <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Truyện tranh Địa Đàng Ký - Tập 1" />
            </label>
            <label>
              Thể loại:
              <select value={category} onChange={e => setCategory(e.target.value as any)}>
                <option value="COMICS">Truyện tranh (Comics)</option>
                <option value="ARTBOOK">Artbook / Sách ảnh</option>
                <option value="ILLUSTRATION">Tranh minh họa</option>
                <option value="OTHER">Khác</option>
              </select>
            </label>
          </div>

          <label>
            Lời giới thiệu ngắn (Pitch):
            <input required value={pitch} onChange={e => setPitch(e.target.value)} placeholder="Tóm tắt nội dung và điểm đặc sắc trong 1-2 câu" />
          </label>

          <label>
            Cốt truyện & Kế hoạch sản xuất:
            <textarea rows={4} value={story} onChange={e => setStory(e.target.value)} placeholder="Giới thiệu chi tiết thế giới, nhân vật, số trang, chất liệu in ấn..." />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <label>
              Mục tiêu gây quỹ (USDC):
              <input required type="number" min="1" value={goal} onChange={e => setGoal(e.target.value)} />
            </label>
            <label>
              Thời hạn gây quỹ (Số ngày, 1 - 60):
              <input required type="number" min="1" max="60" value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </label>
          </div>

          {/* Dynamic Tier Builder */}
          <div className="reward-studio-tiers-builder">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Danh sách Gói quà tặng ({tiers.length})</strong>
              <button type="button" className="button button--secondary" onClick={addTierRow}>
                + Thêm gói quà mới
              </button>
            </div>

            {tiers.map((tier, idx) => (
              <div key={idx} className="reward-tier-builder-row">
                <label>
                  Tên gói:
                  <input value={tier.title} onChange={e => updateTierRow(idx, { title: e.target.value })} />
                </label>
                <label>
                  Giá (USDC):
                  <input type="number" min="1" value={tier.price} onChange={e => updateTierRow(idx, { price: e.target.value })} />
                </label>
                <label>
                  Số lượng tối đa:
                  <input type="number" min="1" value={tier.maxQuantity} onChange={e => updateTierRow(idx, { maxQuantity: Number(e.target.value) })} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '20px' }}>
                  <input type="checkbox" checked={tier.isDigital} onChange={e => updateTierRow(idx, { isDigital: e.target.checked })} />
                  <span>Nội dung số</span>
                </label>
                <label style={{ gridColumn: '1 / -2' }}>
                  Vật phẩm đi kèm (cách nhau bởi dấu phẩy):
                  <input value={tier.rewardItemsStr} onChange={e => updateTierRow(idx, { rewardItemsStr: e.target.value })} placeholder="Ví dụ: Sách bìa cứng, Bookmark, Postcard" />
                </label>
                {tiers.length > 1 && (
                  <button type="button" className="button button--secondary" style={{ color: '#ef4444', alignSelf: 'flex-end' }} onClick={() => removeTierRow(idx)}>
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="button button--primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
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
            {campaigns!.map(c => (
              <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>{c.title}</h3>
                    <span className="reward-status-pill status-active" style={{ fontSize: '11px' }}>{c.status}</span>
                    <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '10px' }}>
                      Mục tiêu: {(Number(c.goal) / 1e6).toLocaleString()} USDC · {c.tiers?.length ?? 0} gói quà
                      {c.onchainCampaignId ? ` · On-chain #${c.onchainCampaignId}` : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {c.status === 'DRAFT' && (
                      <button className="button button--secondary" disabled={busy} onClick={() => void handleFreeze(c.id)}>
                        1. Đóng băng cam kết
                      </button>
                    )}
                    {c.status === 'FROZEN' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handleSubmitReview(c.id)}>
                        2. Gửi Resolver thẩm định (V2)
                      </button>
                    )}
                    {c.status === 'APPROVED' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handlePublishOnchain(c)}>
                        3. Phát hành On-chain
                      </button>
                    )}
                    {c.status === 'ACTIVE' && (
                      <button className="button button--secondary" disabled={busy} onClick={() => void handleRequestProductionDeposit(c)}>
                        Yêu cầu cọc in ấn (≤50% Goal)
                      </button>
                    )}
                    {c.status === 'FULFILLMENT_COMPLETE' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handleCompleteCampaignOnchain(c)}>
                        Hoàn tất Chiến dịch On-chain (completeCampaign)
                      </button>
                    )}
                    <a className="button button--secondary" href={`#/reward/campaigns/${c.id}`}>
                      Xem công khai
                    </a>
                    {(c.status === 'PUBLISHED' || c.status === 'ACTIVE' || c.status === 'PRODUCTION_VERIFIED' || c.status === 'FULFILLMENT_COMPLETE') && (
                      <button
                        className="button button--secondary"
                        onClick={() => setSelectedCampaignForBatch(selectedCampaignForBatch === c.id ? null : c.id)}
                      >
                        Quản lý Giao hàng (Fulfillment)
                      </button>
                    )}
                  </div>
                </div>

                {/* Fulfillment Batch Management Sub-panel */}
                {selectedCampaignForBatch === c.id && (
                  <BatchFulfillmentManager campaignId={c.id} onComplete={() => void refetch()} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function generateManifestHash(campaignId: string, count: number): `0x${string}` {
  return keccak256(toHex(`manifest-${campaignId}-${count}-${Date.now()}`));
}

function BatchFulfillmentManager({ campaignId, onComplete }: { campaignId: string; onComplete: () => void }) {
  const { data: entitlements, isPending, refetch } = useQuery({
    queryKey: ['entitlements-to-fulfill', campaignId],
    queryFn: ({ signal }) => listEntitlementsToFulfill(campaignId, signal),
  });

  const [batchTitle, setBatchTitle] = useState('Đợt giao hàng #1');
  const [carrier, setCarrier] = useState('VNPost');
  const [trackingMap, setTrackingMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (isPending) return <p className="muted" style={{ marginTop: '12px' }}>Đang tải danh sách backer cần giao...</p>;

  const physicalEntitlements = (entitlements || []).filter(e => !e.tier?.isDigital);

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMsg('');

    try {
      const pendingItems = physicalEntitlements.filter(x => x.status === 'ACTIVE' || x.status === 'REDEEM_REQUESTED');
      if (pendingItems.length === 0) {
        throw new Error('Tất cả đơn vật lý đã được xuất lô giao hàng.');
      }
      const codesPayload: Record<string, string> = {};
      for (const item of pendingItems) {
        codesPayload[item.id] = trackingMap[item.id]?.trim() || `VNPOST-${item.id.slice(0, 8).toUpperCase()}`;
      }
      const manifestHash = generateManifestHash(campaignId, pendingItems.length);
      await createFulfillmentBatch(campaignId, {
        batchNumber: 1,
        title: batchTitle,
        carrier,
        manifestHash,
        shippedItemCount: pendingItems.length,
        trackingCodes: codesPayload,
      });

      setStatusMsg('Đã tạo đợt giao hàng và cập nhật mã vận đơn cho backer thành công!');
      void refetch();
      onComplete();
    } catch (err) {
      setStatusMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkDelivered(entitlementId: string) {
    setBusy(true);
    setStatusMsg('');
    try {
      await markRewardEntitlementDelivered(entitlementId);
      setStatusMsg('Đã đánh dấu bưu kiện DELIVERED thành công!');
      void refetch();
      onComplete();
    } catch (err) {
      setStatusMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: '16px', background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
      <h4 style={{ margin: '0 0 10px 0' }}>Quản lý Lô Giao Hàng Vật Lý ({physicalEntitlements.length} đơn)</h4>
      {statusMsg && <p className="toast toast--success">{statusMsg}</p>}

      {physicalEntitlements.length === 0 ? (
        <p className="muted" style={{ fontSize: '13px' }}>Chưa có người ủng hộ nào cần giao gói vật lý hoặc các đơn đều là gói nội dung số.</p>
      ) : (
        <form onSubmit={handleCreateBatch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label>
              Tên đợt gửi:
              <input value={batchTitle} onChange={e => setBatchTitle(e.target.value)} />
            </label>
            <label>
              Đơn vị vận chuyển:
              <select value={carrier} onChange={e => setCarrier(e.target.value)}>
                <option value="VNPost">VNPost</option>
                <option value="ViettelPost">Viettel Post</option>
                <option value="GHTK">Giao Hàng Tiết Kiệm</option>
                <option value="DHL">DHL Express</option>
              </select>
            </label>
          </div>

          <div style={{ maxHeight: '240px', overflowY: 'auto', background: '#fff', padding: '8px', border: '1px solid #e2e8f0' }}>
            {physicalEntitlements.map(e => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr auto', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px' }}>{e.backerWallet.slice(0, 10) + '...'}</span>
                <span style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>{e.status}</span>
                <input
                  placeholder="Mã vận đơn (Tracking)"
                  style={{ fontSize: '12px', padding: '4px 6px' }}
                  value={trackingMap[e.id] ?? e.carrierTrackingCode ?? ''}
                  onChange={evt => setTrackingMap({ ...trackingMap, [e.id]: evt.target.value })}
                />
                {e.status === 'FULFILLING' && (
                  <button
                    type="button"
                    className="button button--secondary"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    disabled={busy}
                    onClick={() => void handleMarkDelivered(e.id)}
                  >
                    Đánh dấu Đã giao (DELIVERED)
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="button button--primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Đang tạo lô...' : 'Xác nhận Đã Xuất Lô Giao Hàng'}
          </button>
        </form>
      )}
    </div>
  );
}

