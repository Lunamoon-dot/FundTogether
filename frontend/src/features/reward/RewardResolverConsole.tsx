import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { keccak256, toHex } from 'viem';
import {
  listResolverRewardCampaigns,
  reviewResolverRewardCampaign,
  activateResolverRewardCampaign,
  verifyResolverRewardProduction,
  listResolverRewardDisputes,
  resolveResolverRewardDispute,
  syncRewardReceipt,
} from '../../lib/api/reward';
import type { RewardCampaign, RewardDispute } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import { EditionsResolverReview } from './EditionsReview';
import { EditionsCommunity } from './EditionsCampaign';
import {
  rewardAbi,
  rewardContractAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

export function RewardResolverConsole({ userId }: { userId: string }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });

  const { data: campaigns, refetch: refetchCampaigns } = useQuery({
    queryKey: ['reward-resolver-campaigns', userId],
    queryFn: ({ signal }) => listResolverRewardCampaigns(signal),
    retry: false,
  });

  const { data: disputes, refetch: refetchDisputes } = useQuery({
    queryKey: ['reward-resolver-disputes', userId],
    queryFn: ({ signal }) => listResolverRewardDisputes(signal),
    retry: false,
  });

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleReviewCampaign(
    c: RewardCampaign,
    outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED',
  ) {
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      await reviewResolverRewardCampaign(c.id, {
        outcome,
        decisionReason:
          outcome === 'APPROVED'
            ? 'Dự toán in ấn, cam kết gói quà và tiến độ xuất bản hợp lệ (Flow V2).'
            : 'Cần bổ sung chi tiết định lượng giấy in và dự toán vận chuyển.',
      });
      setNotice(`Đã thẩm định chiến dịch "${c.title}" với kết quả: ${outcome}.`);
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleActivateOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet) {
      setErrorMsg('Vui lòng kết nối ví Resolver để kích hoạt chiến dịch trên hợp đồng.');
      return;
    }
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      const eligibilityHash = keccak256(toHex(`eligibility-approved-${c.id}-${Date.now()}`));
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'activateCampaign',
        args: [BigInt(c.onchainCampaignId), eligibilityHash],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch activateCampaign bị revert.');

      await activateResolverRewardCampaign(c.id, hash);
      setNotice(`Đã kích hoạt chiến dịch #${c.onchainCampaignId} trên chuỗi và đồng bộ trạng thái ACTIVE!`);
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveDepositOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet) {
      setErrorMsg('Vui lòng kết nối ví Resolver để giải ngân tiền cọc in ấn.');
      return;
    }
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      const reqData: any = await client.readContract({
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'request',
        args: [BigInt(c.onchainCampaignId), 0n],
      });
      const expectedRequestHash = (reqData.requestHash ?? reqData[0]) as `0x${string}`;

      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'approveAndDisburse',
        args: [BigInt(c.onchainCampaignId), 0n, expectedRequestHash],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch approveAndDisburse bị revert.');

      await syncRewardReceipt(hash);
      setNotice(`Đã giải ngân cọc in ấn cho chiến dịch #${c.onchainCampaignId} và đồng bộ Indexer!`);
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCandidateExpenditureOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet) {
      setErrorMsg('Vui lòng kết nối ví Resolver để xác nhận chứng từ chi tiêu nhà in.');
      return;
    }
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      const reqData: any = await client.readContract({
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'request',
        args: [BigInt(c.onchainCampaignId), 0n],
      });
      const approvedAmount = BigInt(reqData.approvedAmount ?? reqData[2] ?? 0);
      const reportHash = keccak256(toHex(`expenditure-receipt-${c.id}-${Date.now()}`));

      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'candidateExpenditure',
        args: [BigInt(c.onchainCampaignId), 0n, approvedAmount, reportHash],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch candidateExpenditure bị revert.');

      await syncRewardReceipt(hash);
      setNotice('Đã ghi nhận chứng từ chi tiêu (ExpenditureCandidate) trên chuỗi và đồng bộ Indexer!');
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalizeExpenditureOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet) {
      setErrorMsg('Vui lòng kết nối ví để tất toán đợt chi tiêu (finalizeExpenditure).');
      return;
    }
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'finalizeExpenditure',
        args: [BigInt(c.onchainCampaignId), 0n],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch finalizeExpenditure bị revert.');

      await syncRewardReceipt(hash);
      setNotice('Đã tất toán đợt chi tiêu (FINANCIALLY_SETTLED) trên chuỗi và đồng bộ Indexer!');
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyProductionOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet) {
      setErrorMsg('Vui lòng kết nối ví Resolver để nghiệm thu mẫu in (Flow V3).');
      return;
    }
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      const reportHash = keccak256(toHex(`production-verified-${c.id}-${Date.now()}`));
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'recordProductionVerified',
        args: [BigInt(c.onchainCampaignId), reportHash],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch recordProductionVerified bị revert.');

      const res = await verifyResolverRewardProduction(c.id, {
        txHash: hash,
        productionReportHash: reportHash,
      });
      setNotice(
        `Đã nghiệm thu sản xuất (PRODUCTION_VERIFIED) trên chuỗi! Đã tự động cấp phát ${res.digitalKeysIssued ?? 0} mã đọc kỹ thuật số.`,
      );
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartWindDownOnchain(c: RewardCampaign) {
    if (!c.onchainCampaignId || !account.address || !client || !wallet) {
      setErrorMsg('Vui lòng kết nối ví để kích hoạt Wind-down hoàn tiền.');
      return;
    }
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'startWindDown',
        args: [BigInt(c.onchainCampaignId)],
      });
      const hash = await wallet.writeContract(call.request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch startWindDown bị revert.');

      await syncRewardReceipt(hash);
      setNotice('Đã kích hoạt Wind-down dừng dự án (STOPPED) và mở khóa REFUND_ELIGIBLE cho toàn bộ backer!');
      void refetchCampaigns();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveDispute(
    d: RewardDispute,
    outcome: 'RESOLVED_BACKER' | 'RESOLVED_CREATOR' | 'DISMISSED',
  ) {
    setBusy(true);
    setNotice('');
    setErrorMsg('');
    try {
      await resolveResolverRewardDispute(d.id, {
        outcome,
        resolutionNote:
          outcome === 'RESOLVED_BACKER'
            ? 'Xác nhận ấn phẩm bị thất lạc/hư hỏng, mở khóa quyền hoàn tiền cho độc giả.'
            : 'Đã đối chiếu vận đơn giao hàng hợp lệ.',
      });
      setNotice(`Đã phân xử khiếu nại #${d.id.slice(0, 8)} với kết quả: ${outcome}.`);
      void refetchDisputes();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reward-container">
      <header className="reward-hero">
        <span className="reward-badge-category">⚖️ Thẩm quyền Hợp đồng · Resolver Console</span>
        <h1 className="reward-hero-title">Trung Tâm Thẩm Định & Nghiệm Thu On-Chain (V2 – V4)</h1>
        <p className="reward-hero-pitch">
          Thẩm định cam kết ấn phẩm Editions, ký kích hoạt chiến dịch và nghiệm thu bằng chứng sản xuất / PDF trên smart contract.
        </p>
      </header>

      {errorMsg && <p className="toast toast--error" role="alert">{errorMsg}</p>}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}

      {/* Flow V2 - V4: Resolver Campaign Lifecycle Queue */}
      <section className="panel">
        <h2>Flow V2 – V4: Thẩm Định Chiến Dịch & Nghiệm Thu Hợp Đồng ({campaigns?.length ?? 0})</h2>
        {(campaigns || []).length === 0 ? (
          <p className="muted">Chưa có chiến dịch nào hoặc tài khoản hiện tại không có quyền RESOLVER.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
            {campaigns!.map(c => c.draftConfig || c.category === 'COMICS_ARTBOOK' ? (
              <div key={c.id}>
                {c.commitmentHash && ['UNDER_REVIEW', 'APPROVED'].includes(c.status) && <EditionsCommunity id={c.id} userId={userId} commitmentHash={c.commitmentHash} />}
                <EditionsResolverReview campaign={c} onChange={() => void refetchCampaigns()} />
                {c.status === 'APPROVED' && <a className="button button--secondary" href={`#/reward/editions/${c.id}/resolver`}>Mở duyệt hợp đồng, sản xuất & PDF local</a>}
              </div>
            ) : (
              <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0' }}>{c.title}</h3>
                    <span className="reward-status-pill status-active" style={{ fontSize: '11px' }}>{c.status}</span>
                    <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '10px' }}>
                      Goal: {(Number(c.goal) / 1e6).toLocaleString()} USDC
                      {c.onchainCampaignId ? ` · On-chain ID #${c.onchainCampaignId}` : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {c.status === 'UNDER_REVIEW' && (
                      <>
                        <button className="button button--primary" disabled={busy} onClick={() => void handleReviewCampaign(c, 'APPROVED')}>
                          Duyệt Cam Kết (V2 APPROVED)
                        </button>
                        <button className="button button--secondary" disabled={busy} onClick={() => void handleReviewCampaign(c, 'CHANGES_REQUESTED')}>
                          Yêu cầu sửa
                        </button>
                      </>
                    )}
                    {c.status === 'PUBLISHED' && c.onchainCampaignId && (
                      <button className="button button--primary" disabled={busy} onClick={() => void handleActivateOnchain(c)}>
                        Kích hoạt On-chain (activateCampaign)
                      </button>
                    )}
                    {c.status === 'ACTIVE' && c.onchainCampaignId && (
                      <>
                        <button className="button button--secondary" disabled={busy} onClick={() => void handleApproveDepositOnchain(c)}>
                          1. Giải ngân Cọc (approveAndDisburse)
                        </button>
                        <button className="button button--secondary" disabled={busy} onClick={() => void handleCandidateExpenditureOnchain(c)}>
                          2. Duyệt Hóa đơn (candidateExpenditure)
                        </button>
                        <button className="button button--secondary" disabled={busy} onClick={() => void handleFinalizeExpenditureOnchain(c)}>
                          3. Tất toán Cọc (finalizeExpenditure)
                        </button>
                        <button className="button button--primary" disabled={busy} onClick={() => void handleVerifyProductionOnchain(c)}>
                          4. Nghiệm thu Sản xuất V3 (recordProductionVerified)
                        </button>
                      </>
                    )}

                    {(c.status === 'ACTIVE' || c.status === 'PRODUCTION_VERIFIED' || c.status === 'FULFILLMENT_COMPLETE') && c.onchainCampaignId && (
                      <button
                        className="button button--secondary"
                        style={{ color: '#dc2626' }}
                        disabled={busy}
                        onClick={() => void handleStartWindDownOnchain(c)}
                      >
                        Dừng & Hoàn tiền (startWindDown)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Disputes Queue */}
      <section className="panel">
        <h2>Phân Xử Khiếu Nại Quà Tặng ({disputes?.length ?? 0})</h2>
        {(disputes || []).length === 0 ? (
          <p className="muted">Không có khiếu nại nào cần xử lý.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {disputes!.map(d => (
              <div key={d.id} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <strong>Khiếu nại #{d.id.slice(0, 8)}</strong> · Trạng thái: <strong>{d.status}</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#991b1b' }}>Lý do: {d.reason}</p>
                </div>
                {d.status === 'OPEN' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="button button--primary" disabled={busy} onClick={() => void handleResolveDispute(d, 'RESOLVED_BACKER')}>
                      Chấp thuận Backer (Mở REFUND_ELIGIBLE)
                    </button>
                    <button className="button button--secondary" disabled={busy} onClick={() => void handleResolveDispute(d, 'RESOLVED_CREATOR')}>
                      Bác bỏ (Xác nhận đã giao)
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
