import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEventLogs, toHex } from 'viem';
import {
  listMyRewardCampaigns,
  createRewardCampaignDraft,
  freezeRewardCampaign,
  registerRewardOnchain,
  createFulfillmentBatch,
  listEntitlementsToFulfill,
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

  const { data: campaigns, isPending, error, refetch } = useQuery({
    queryKey: ['my-reward-campaigns'],
    queryFn: ({ signal }) => listMyRewardCampaigns(signal),
    refetchInterval: 10_000,
  });

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
        goal: (Number(goal) * 1e6).toString(),
        fundingDuration: duration,
        policyHash: '0x' + '0'.repeat(64),
        tiers: formattedTiers,
      };

      await createRewardCampaignDraft(payload);
      setSuccessNotice('Tạo bản thảo chiến dịch thành công! Bạn có thể xem và đóng băng cam kết ở danh sách bên dưới.');
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
      setSuccessNotice('Đã đóng băng cam kết phần thưởng thành công! Giờ đây bạn có thể phát hành On-chain.');
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
      const durationSeconds = BigInt(c.fundingDuration * 86400);

      const tierInputs = (c.tiers || []).map(t => ({
        price: BigInt(t.price),
        maxQuantity: BigInt(t.maxQuantity),
        pledgedQuantity: 0n,
        isDigital: Boolean(t.isDigital),
      }));

      // Call createCampaign on FundTogetherReward
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
        eventName: 'RewardCampaignCreated',
        strict: false,
      });

      const onchainId = (logs[0]?.args as any)?.campaignId?.toString() || '0';
      await registerRewardOnchain(c.id, onchainId);

      setSuccessNotice(`Phát hành On-chain thành công với Campaign ID #${onchainId}!`);
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
          Thiết lập cấu trúc gói quà tặng (Tiers), đóng băng cam kết, phát hành hợp đồng thông minh và quản lý giao nhận với độc giả.
        </p>
      </header>

      {formError && <p className="toast toast--error" role="alert">{formError}</p>}
      {successNotice && <p className="toast toast--success" role="status">{successNotice}</p>}

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
              Thời hạn gây quỹ (Số ngày):
              <input required type="number" min="7" max="90" value={duration} onChange={e => setDuration(Number(e.target.value))} />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>{c.title}</h3>
                    <span className="reward-status-pill status-active" style={{ fontSize: '11px' }}>{c.status}</span>
                    <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '10px' }}>
                      Mục tiêu: {(Number(c.goal) / 1e6).toLocaleString()} USDC · {c.tiers?.length ?? 0} gói quà
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {c.status === 'DRAFT' && (
                      <button className="button button--secondary" disabled={busy} onClick={() => void handleFreeze(c.id)}>
                        1. Đóng băng cam kết
                      </button>
                    )}
                    {c.status === 'FROZEN' && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handlePublishOnchain(c)}>
                        2. Phát hành On-chain
                      </button>
                    )}
                    <a className="button button--secondary" href={`#/reward/campaigns/${c.id}`}>
                      Xem công khai
                    </a>
                    {(c.status === 'PUBLISHED' || c.status === 'ACTIVE' || c.status === 'PRODUCTION_VERIFIED') && (
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
  return toHex(`manifest-${campaignId}-${count}`);
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

  const physicalEntitlements = (entitlements || []).filter(e => !e.tier.isDigital);

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMsg('');

    try {
      const manifestHash = generateManifestHash(campaignId, physicalEntitlements.length);
      await createFulfillmentBatch(campaignId, {
        batchNumber: 1,
        title: batchTitle,
        carrier,
        manifestHash,
        shippedItemCount: physicalEntitlements.length,
        trackingCodes: trackingMap,
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

  return (
    <div style={{ marginTop: '16px', background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
      <h4 style={{ margin: '0 0 10px 0' }}>Tạo Lô Giao Hàng Vật Lý ({physicalEntitlements.length} người ủng hộ)</h4>
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

          <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#fff', padding: '8px', border: '1px solid #e2e8f0' }}>
            {physicalEntitlements.map(e => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1.5fr', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px' }}>{e.shippingFullName || e.backerWallet.slice(0, 10) + '...'}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{e.shippingAddress || 'Chưa nhập địa chỉ'}</span>
                <input
                  placeholder="Mã vận đơn (Tracking)"
                  style={{ fontSize: '12px', padding: '4px 6px' }}
                  value={trackingMap[e.id] || ''}
                  onChange={evt => setTrackingMap({ ...trackingMap, [e.id]: evt.target.value })}
                />
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
