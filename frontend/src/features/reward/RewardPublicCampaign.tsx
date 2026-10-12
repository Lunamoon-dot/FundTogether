import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEventLogs } from 'viem';
import { getRewardPublicCampaign, createRewardPledge } from '../../lib/api/reward';
import type { RewardTier } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import {
  rewardAbi,
  tokenAbi,
  rewardContractAddress,
  rewardTokenAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

interface RewardPublicCampaignProps {
  campaignId: string;
}

export function RewardPublicCampaign({ campaignId }: RewardPublicCampaignProps) {
  const { data: campaign, isPending, isError, error, refetch } = useQuery({
    queryKey: ['reward-public-campaign', campaignId],
    queryFn: ({ signal }) => getRewardPublicCampaign(campaignId, signal),
    refetchInterval: 10_000,
  });

  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });

  const [selectedTier, setSelectedTier] = useState<RewardTier | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [busy, setBusy] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  if (isPending) {
    return (
      <div className="reward-container">
        <p role="status" className="muted">Đang tải thông tin chiến dịch…</p>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="reward-container">
        <section className="panel">
          <p role="alert" className="toast toast--error">{getErrorMessage(error || 'Không tìm thấy chiến dịch')}</p>
          <a className="button button--secondary" href="#/reward">Quay lại danh sách</a>
        </section>
      </div>
    );
  }

  const goalNum = Number(campaign.goal) / 1e6;
  const pledgedTotal = (campaign.tiers || []).reduce((acc, t) => {
    return acc + (Number(t.price) * t.pledgedQuantity) / 1e6;
  }, 0);
  const pct = goalNum > 0 ? Math.min(100, Math.round((pledgedTotal / goalNum) * 100)) : 0;

  async function handlePledge() {
    if (!selectedTier || busy) return;
    setActionError('');
    setSuccessMsg('');
    setBusy(true);

    try {
      if (!account.address) {
        throw new Error('Vui lòng kết nối ví Web3 để tiếp tục.');
      }
      if (account.chainId !== activeChain.id) {
        throw new Error(`Vui lòng chuyển mạng ví sang ${activeChain.name} (Chain ID: ${activeChain.id}).`);
      }

      const totalAmount = BigInt(selectedTier.price) * BigInt(quantity);
      let txHash = '0x' + '1'.repeat(64);

      // On-chain interaction if campaign has onchainCampaignId and client/wallet available
      if (campaign?.onchainCampaignId && client && wallet) {
        // 1. Approve USDC
        const approveCall = await client.simulateContract({
          account: account.address,
          address: rewardTokenAddress,
          abi: tokenAbi,
          functionName: 'approve',
          args: [rewardContractAddress, totalAmount],
        });
        const appHash = await wallet.writeContract(approveCall.request);
        const appReceipt = await client.waitForTransactionReceipt({ hash: appHash, confirmations: 1 });
        if (appReceipt.status !== 'success') {
          throw new Error('Giao dịch cấp quyền MockUSDC bị từ chối/revert.');
        }

        // 2. Pledge to Reward Escrow
        const pledgeCall = await client.simulateContract({
          account: account.address,
          address: rewardContractAddress,
          abi: rewardAbi,
          functionName: 'pledge',
          args: [BigInt(campaign.onchainCampaignId), BigInt(selectedTier.tierIndex), BigInt(quantity)],
        });
        const pledgeHash = await wallet.writeContract(pledgeCall.request);
        const pledgeReceipt = await client.waitForTransactionReceipt({ hash: pledgeHash, confirmations: 1 });
        if (pledgeReceipt.status !== 'success') {
          throw new Error('Giao dịch ủng hộ (pledge) trên hợp đồng bị revert.');
        }

        const pledgeEvent = parseEventLogs({
          abi: rewardAbi,
          logs: pledgeReceipt.logs,
          eventName: 'RewardPledged',
          strict: false,
        });
        if (!pledgeEvent.length) {
          throw new Error('Không tìm thấy sự kiện RewardPledged trong receipt.');
        }
        txHash = pledgeHash;
      }

      // 3. Record backer entitlement in backend database
      await createRewardPledge({
        tierId: selectedTier.id,
        quantity,
        txHash,
        backerWallet: account.address,
      });

      setSuccessMsg(`Ủng hộ thành công gói "${selectedTier.title}"! Bạn có thể xem phần thưởng trong trang Phần thưởng của tôi.`);
      setSelectedTier(null);
      void refetch();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClaimRefund() {
    if (!campaign?.onchainCampaignId || !account.address || !client || !wallet || busy) return;
    setActionError('');
    setSuccessMsg('');
    setBusy(true);

    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'claimRefund',
        args: [BigInt(campaign.onchainCampaignId)],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Yêu cầu rút tiền hoàn trả bị revert.');

      setSuccessMsg('Đã rút tiền hoàn trả từ Escrow về ví thành công!');
      void refetch();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reward-container">
      <a className="public-back" href="#/reward">← Quay lại danh mục truyện tranh & artbook</a>

      {actionError && <p className="toast toast--error" role="alert">{actionError}</p>}
      {successMsg && <p className="toast toast--success" role="status">{successMsg}</p>}

      {/* Main Campaign Hero */}
      <section className="reward-hero">
        <span className="reward-badge-category">
          {campaign.category === 'COMICS' ? 'Truyện tranh (Comics)' : campaign.category === 'ARTBOOK' ? 'Artbook / Sách ảnh' : 'Minh họa'}
        </span>
        <h1 className="reward-hero-title">{campaign.title}</h1>
        <p className="reward-hero-pitch">{campaign.pitch}</p>

        <div style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '16px', borderRadius: '8px', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700 }}>
              {pledgedTotal.toLocaleString()} USDC
              <span style={{ fontSize: '14px', fontWeight: 400, color: '#94a3b8' }}> / {goalNum.toLocaleString()} USDC</span>
            </span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>{pct}%</span>
          </div>
          <div className="reward-progress-bar" style={{ margin: '4px 0 10px 0' }}>
            <div className="reward-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#cbd5e1' }}>
            <span>Trạng thái: <strong>{campaign.status}</strong></span>
            <span>Thời hạn gây quỹ: <strong>{campaign.fundingDuration} ngày</strong></span>
            {campaign.onchainCampaignId && <span>Hợp đồng Escrow ID: <strong>#{campaign.onchainCampaignId}</strong></span>}
          </div>
        </div>
      </section>

      {/* Dual-Exposure Guard Status Banner */}
      <section className="reward-security-banner">
        <strong>Kiểm soát Rủi ro kép & Bảo vệ Quỹ Escrow (Dual-Exposure Guard):</strong>
        <div className="reward-security-grid">
          <div className="reward-security-item">
            <strong>Trần cọc in ấn: Tối đa 50% Goal</strong>
            <p>Tác giả chỉ được nhận tối đa {(goalNum * 0.5).toLocaleString()} USDC để đặt cọc nhà in. Tiền còn lại giữ an toàn trong Escrow.</p>
          </div>
          <div className="reward-security-item">
            <strong>Khóa nghiệm thu xuất bản:</strong>
            <p>
              {campaign.status === 'PRODUCTION_VERIFIED'
                ? 'Đã nghiệm thu mẫu in thành công. Mã đọc số & quà tặng đã được mở khóa!'
                : 'Mã đọc số & quà tặng vật lý đang khóa an toàn chờ Resolver duyệt mẫu in thực tế.'}
            </p>
          </div>
          <div className="reward-security-item">
            <strong>Bảo vệ hoàn tiền:</strong>
            <p>
              {campaign.status === 'STOPPED'
                ? 'Dự án đã dừng sớm. Backer có thể rút hoàn tiền theo tỷ lệ còn lại trong Escrow.'
                : 'Nếu chiến dịch không đạt goal, 100% tiền góp được hoàn trả tự động trên hợp đồng.'}
            </p>
            {campaign.status === 'STOPPED' && (
              <button
                className="button button--secondary"
                style={{ marginTop: '8px', fontSize: '12px' }}
                disabled={busy}
                onClick={() => void handleClaimRefund()}
              >
                Rút hoàn tiền còn lại
              </button>
            )}
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: '24px' }}>
        {/* Left Column: Story & Details */}
        <section className="panel">
          <h2>Giới thiệu tác phẩm</h2>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#334155' }}>
            {campaign.story || campaign.pitch}
          </div>

          <h3 style={{ marginTop: '24px' }}>Chính sách giao nhận & Cam kết</h3>
          <p className="muted" style={{ fontSize: '13.5px' }}>
            Toàn bộ thông tin địa chỉ giao hàng của người ủng hộ được bảo vệ nghiêm ngặt và chỉ chia sẻ riêng tư với tác giả khi chuẩn bị xuất xưởng.
          </p>
        </section>

        {/* Right Column: Reward Tiers */}
        <section className="reward-tiers-section">
          <h2>Chọn gói quà tặng ({campaign.tiers?.length ?? 0})</h2>

          {(campaign.tiers || []).map(tier => {
            const priceNum = Number(tier.price) / 1e6;
            const remaining = tier.maxQuantity > 0 ? tier.maxQuantity - tier.pledgedQuantity : 9999;
            const isSoldOut = tier.maxQuantity > 0 && remaining <= 0;
            const isSelected = selectedTier?.id === tier.id;

            return (
              <div
                key={tier.id}
                className={`reward-tier-card ${isSelected ? 'selected' : ''}`}
                onClick={() => !isSoldOut && setSelectedTier(tier)}
                style={{ cursor: isSoldOut ? 'not-allowed' : 'pointer', opacity: isSoldOut ? 0.6 : 1 }}
              >
                <div className="reward-tier-header">
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '17px' }}>{tier.title}</h3>
                    <span className={tier.isDigital ? 'reward-pill-digital' : 'reward-pill-physical'}>
                      {tier.isDigital ? 'Nội dung số (Digital)' : 'Vật phẩm thực tế (Physical)'}
                    </span>
                  </div>
                  <div className="reward-tier-price">{priceNum.toLocaleString()} USDC</div>
                </div>

                <p style={{ margin: 0, fontSize: '13.5px', color: '#475569' }}>{tier.description}</p>

                {tier.rewardItems && tier.rewardItems.length > 0 && (
                  <ul className="reward-item-list">
                    {tier.rewardItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span className="reward-supply-badge">
                    {tier.maxQuantity > 0 ? `Còn lại: ${remaining} / ${tier.maxQuantity}` : 'Số lượng không giới hạn'}
                  </span>
                  {tier.estimatedDeliveryAt && (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Giao dự kiến: {new Date(tier.estimatedDeliveryAt).toLocaleDateString('vi-VN')}
                    </span>
                  )}
                </div>

                {isSelected && (
                  <div className="reward-pledge-box" onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Số lượng muốn ủng hộ:</strong>
                      <div className="reward-quantity-input">
                        <button
                          type="button"
                          disabled={quantity <= 1 || busy}
                          onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 700, minWidth: '24px', textAlign: 'center' }}>{quantity}</span>
                        <button
                          type="button"
                          disabled={(tier.maxQuantity > 0 && quantity >= remaining) || busy}
                          onClick={() => setQuantity(q => q + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                      <span>Tổng số tiền:</span>
                      <strong style={{ color: '#047857', fontSize: '16px' }}>
                        {(priceNum * quantity).toLocaleString()} USDC
                      </strong>
                    </div>

                    <button
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void handlePledge()}
                    >
                      {busy ? 'Đang xử lý giao dịch Web3…' : `Xác nhận ủng hộ ${(priceNum * quantity).toLocaleString()} USDC`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
