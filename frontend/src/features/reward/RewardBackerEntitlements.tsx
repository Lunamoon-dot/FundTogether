import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import {
  listMyRewardEntitlements,
  updateRewardShipping,
  confirmRewardDelivery,
  openRewardDispute,
  claimRewardRefund,
} from '../../lib/api/reward';
import type { RewardEntitlement } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import {
  rewardAbi,
  rewardContractAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

export function RewardBackerEntitlements() {
  const { data: entitlements, isPending, error, refetch } = useQuery({
    queryKey: ['my-reward-entitlements'],
    queryFn: ({ signal }) => listMyRewardEntitlements(signal),
    refetchInterval: 10_000,
  });

  const [activeTab, setActiveTab] = useState<'ALL' | 'DIGITAL' | 'PHYSICAL'>('ALL');
  const [editingShippingId, setEditingShippingId] = useState<string | null>(null);
  const [disputeModalId, setDisputeModalId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [err, setErr] = useState<string>('');

  if (isPending) {
    return (
      <div className="reward-container">
        <p role="status" className="muted">Đang tải danh sách phần thưởng của bạn…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reward-container">
        <section className="panel">
          <p role="alert" className="toast toast--error">{getErrorMessage(error)}</p>
          <button className="button button--secondary" onClick={() => void refetch()}>Thử lại</button>
        </section>
      </div>
    );
  }

  const items = entitlements || [];
  const filtered = items.filter(e => {
    if (activeTab === 'DIGITAL') return e.tier?.isDigital;
    if (activeTab === 'PHYSICAL') return !e.tier?.isDigital;
    return true;
  });

  return (
    <div className="reward-container">
      <header className="reward-hero">
        <span className="reward-badge-category">Tủ quà của bạn · My Rewards</span>
        <h1 className="reward-hero-title">Phần Thưởng & Ấn Phẩm Của Tôi</h1>
        <p className="reward-hero-pitch">
          Theo dõi tiến độ sản xuất, cập nhật địa chỉ nhận ấn phẩm vật lý, mở khóa mã đọc truyện tranh số, quản lý giao nhận và rút hoàn tiền Escrow.
        </p>
      </header>

      {err && <p className="toast toast--error" role="alert">{err}</p>}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className={`button ${activeTab === 'ALL' ? 'button--primary' : 'button--secondary'}`}
          onClick={() => setActiveTab('ALL')}
        >
          Tất cả ({items.length})
        </button>
        <button
          className={`button ${activeTab === 'DIGITAL' ? 'button--primary' : 'button--secondary'}`}
          onClick={() => setActiveTab('DIGITAL')}
        >
          Ấn phẩm số (Digital)
        </button>
        <button
          className={`button ${activeTab === 'PHYSICAL' ? 'button--primary' : 'button--secondary'}`}
          onClick={() => setActiveTab('PHYSICAL')}
        >
          Quà vật lý (Physical)
        </button>
      </div>

      {filtered.length === 0 ? (
        <section className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>Bạn chưa có phần thưởng nào trong danh mục này</h2>
          <p className="muted">Khám phá các dự án truyện tranh và sách ảnh đang gây quỹ để ủng hộ tác giả yêu thích!</p>
          <a className="button button--primary" href="#/reward" style={{ marginTop: '12px' }}>
            Khám phá dự án ngay
          </a>
        </section>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.map(entitlement => (
            <EntitlementItem
              key={entitlement.id}
              entitlement={entitlement}
              isEditingShipping={editingShippingId === entitlement.id}
              onToggleEditShipping={() =>
                setEditingShippingId(editingShippingId === entitlement.id ? null : entitlement.id)
              }
              isDisputing={disputeModalId === entitlement.id}
              onToggleDispute={() =>
                setDisputeModalId(disputeModalId === entitlement.id ? null : entitlement.id)
              }
              onUpdated={(msg, isErr) => {
                if (isErr) {
                  setErr(msg);
                } else {
                  setNotice(msg);
                  setEditingShippingId(null);
                  setDisputeModalId(null);
                  void refetch();
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntitlementItem({
  entitlement,
  isEditingShipping,
  onToggleEditShipping,
  isDisputing,
  onToggleDispute,
  onUpdated,
}: {
  entitlement: RewardEntitlement;
  isEditingShipping: boolean;
  onToggleEditShipping: () => void;
  isDisputing: boolean;
  onToggleDispute: () => void;
  onUpdated: (msg: string, isErr?: boolean) => void;
}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });

  const [fullName, setFullName] = useState(entitlement.shippingFullName || '');
  const [address, setAddress] = useState(entitlement.shippingAddress || '');
  const [phone, setPhone] = useState(entitlement.shippingPhone || '');
  const [disputeReason, setDisputeReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSaveShipping(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateRewardShipping(entitlement.id, { fullName, address, phone });
      onUpdated('Cập nhật địa chỉ nhận quà thành công!');
    } catch (cause) {
      onUpdated(getErrorMessage(cause), true);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDelivery() {
    setBusy(true);
    try {
      await confirmRewardDelivery(entitlement.id);
      onUpdated('Đã xác nhận nhận quà thành công! Cảm ơn bạn đã ủng hộ tác giả.');
    } catch (cause) {
      onUpdated(getErrorMessage(cause), true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendDispute(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await openRewardDispute(entitlement.id, { reason: disputeReason });
      onUpdated('Đã gửi khiếu nại giao nhận tới ban quản trị và tác giả.');
    } catch (cause) {
      onUpdated(getErrorMessage(cause), true);
    } finally {
      setBusy(false);
    }
  }

  async function handleClaimRefund() {
    if (!entitlement.onchainCampaignId || !account.address || !client || !wallet) {
      onUpdated('Vui lòng kết nối ví Web3 đã dùng ủng hộ để rút hoàn tiền từ Escrow.', true);
      return;
    }
    setBusy(true);
    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'claimRefund',
        args: [BigInt(entitlement.onchainCampaignId)],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') {
        throw new Error('Giao dịch claimRefund bị revert.');
      }

      await claimRewardRefund({ txHash: hash });
      onUpdated('Đã rút hoàn tiền từ hợp đồng Escrow về ví và đồng bộ trạng thái REFUNDED!');
    } catch (cause) {
      onUpdated(getErrorMessage(cause), true);
    } finally {
      setBusy(false);
    }
  }

  const isDigital = entitlement.tier?.isDigital;
  const isDelivered = entitlement.status === 'DELIVERED';
  const isConfirmed = entitlement.status === 'CONFIRMED';
  const isDisputed = entitlement.status === 'DISPUTED';
  const isRefundEligible = entitlement.status === 'REFUND_ELIGIBLE';
  const isRefunded = entitlement.status === 'REFUNDED';

  return (
    <article className="reward-entitlement-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Chiến dịch:</span>
          <h3 style={{ margin: '2px 0 6px 0', fontSize: '18px' }}>{entitlement.campaignTitle}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 700, color: '#047857' }}>
              {entitlement.tier?.title || 'Gói quà tặng'} x {entitlement.quantity}
            </span>
            <span className={isDigital ? 'reward-pill-digital' : 'reward-pill-physical'}>
              {isDigital ? 'Nội dung số' : 'Vật phẩm thực tế'}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className={`reward-status-pill status-${entitlement.status.toLowerCase()}`}>
            {entitlement.status}
          </span>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Đã thanh toán: {(Number(entitlement.amountPaid) / 1e6).toLocaleString()} USDC
          </div>
        </div>
      </div>

      {/* Refund Claim Banner when REFUND_ELIGIBLE or REFUNDED */}
      {(isRefundEligible || isRefunded) && (
        <div style={{ background: isRefunded ? '#ecfdf5' : '#fffbeb', border: `1px solid ${isRefunded ? '#34d399' : '#f59e0b'}`, padding: '12px', borderRadius: '6px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: isRefunded ? '#065f46' : '#92400e' }}>
              {isRefunded ? '✓ Đã hoàn tiền về ví Web3 (REFUNDED)' : '⚠️ Đủ điều kiện rút tiền hoàn trả từ Escrow (REFUND_ELIGIBLE)'}
            </strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#475569' }}>
              {isRefunded
                ? 'Khoản hoàn trả theo tỷ lệ từ BasePool/SupplementPool đã được chuyển về ví của bạn.'
                : 'Chiến dịch đã dừng (Wind-down) hoặc khiếu nại được chấp thuận. Bạn có thể rút tiền hoàn trả trực tiếp từ hợp đồng thông minh.'}
            </p>
          </div>
          {isRefundEligible && entitlement.onchainCampaignId && (
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => void handleClaimRefund()}
            >
              {busy ? 'Đang rút từ hợp đồng…' : 'Rút Hoàn Tiền On-chain'}
            </button>
          )}
        </div>
      )}

      {/* Digital Rewards Section */}
      {isDigital && (
        <div className="reward-digital-box">
          <div>
            <strong>Mã kích hoạt & Đọc truyện trực tuyến:</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#475569' }}>
              {entitlement.digitalAccessCode
                ? 'Mã đọc đã được cấp phát tự động sau khi nghiệm thu in ấn.'
                : 'Mã sẽ tự động xuất hiện sau khi Resolver nghiệm thu chất lượng xuất bản.'}
            </p>
          </div>
          {entitlement.digitalAccessCode ? (
            <span className="reward-digital-code">{entitlement.digitalAccessCode}</span>
          ) : (
            <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 600 }}>🔒 Chờ nghiệm thu xuất bản</span>
          )}
        </div>
      )}

      {/* Physical Rewards Section */}
      {!isDigital && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>
              Địa chỉ nhận hàng: {entitlement.shippingAddress ? `${entitlement.shippingFullName} - ${entitlement.shippingAddress} (${entitlement.shippingPhone})` : 'Chưa có thông tin'}
            </span>
            <button
              type="button"
              className="button button--secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={onToggleEditShipping}
            >
              {isEditingShipping ? 'Đóng' : entitlement.shippingAddress ? 'Sửa địa chỉ' : 'Nhập địa chỉ'}
            </button>
          </div>

          {entitlement.carrierTrackingCode && (
            <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', marginTop: '6px' }}>
              📦 Mã vận đơn: <strong>{entitlement.carrierTrackingCode}</strong>
            </div>
          )}

          {isEditingShipping && (
            <form onSubmit={handleSaveShipping} className="reward-shipping-form" style={{ marginTop: '10px' }}>
              <label>
                Họ và tên người nhận:
                <input required value={fullName} onChange={e => setFullName(e.target.value)} />
              </label>
              <label>
                Số điện thoại liên hệ:
                <input required value={phone} onChange={e => setPhone(e.target.value)} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Địa chỉ chi tiết (Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP):
                <input required value={address} onChange={e => setAddress(e.target.value)} />
              </label>
              <button type="submit" className="button button--primary" disabled={busy} style={{ gridColumn: '1 / -1' }}>
                {busy ? 'Đang lưu…' : 'Lưu địa chỉ bảo mật'}
              </button>
            </form>
          )}

          {/* Delivery Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            {isDelivered && !isConfirmed && (
              <button
                className="button button--primary"
                style={{ fontSize: '13px' }}
                disabled={busy}
                onClick={() => void handleConfirmDelivery()}
              >
                ✓ Xác nhận đã nhận hàng
              </button>
            )}
            {!isConfirmed && !isDisputed && !isRefunded && (
              <button
                className="button button--secondary"
                style={{ fontSize: '13px', color: '#dc2626' }}
                onClick={onToggleDispute}
              >
                Khiếu nại quà tặng
              </button>
            )}
          </div>

          {isDisputing && (
            <form onSubmit={handleSendDispute} style={{ marginTop: '10px', background: '#fef2f2', padding: '12px', borderRadius: '6px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
                Lý do khiếu nại (Quà hỏng, thiếu hàng, sai quy cách, thất lạc):
                <textarea
                  required
                  rows={3}
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  placeholder="Mô tả cụ thể vấn đề bạn gặp phải với gói quà..."
                />
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="submit" className="button button--primary" style={{ background: '#dc2626', borderColor: '#b91c1c' }} disabled={busy}>
                  {busy ? 'Đang gửi…' : 'Gửi khiếu nại'}
                </button>
                <button type="button" className="button button--secondary" onClick={onToggleDispute}>
                  Hủy
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

