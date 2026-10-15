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
import { ReviewQueue } from './ui/ReviewQueue';
import { ReviewHistoryDisclosure } from './ui/ReviewHistoryDisclosure';
import { TransactionLifecycle, type TransactionPhase } from './ui/TransactionLifecycle';
import {
  rewardAbi,
  rewardContractAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

function resolverStatusLabel(status: string) {
  const labels: Record<string, string> = {
    UNDER_REVIEW: 'Chờ Resolver kiểm tra',
    UNDER_REVIEW_PRIVATE: 'Đang kiểm tra riêng',
    COMMUNITY_REVIEW: 'Chờ Resolver quyết định',
    APPROVED: 'Đã duyệt · chờ kích hoạt',
    CHANGES_REQUESTED: 'Cần Creator bổ sung',
    REJECTED: 'Đã từ chối',
    PUBLISHED: 'Chờ kích hoạt on-chain',
    ACTIVE: 'Đang gây quỹ',
    PRODUCTION_VERIFIED: 'Đã nghiệm thu sản xuất',
    FULFILLMENT_COMPLETE: 'Đã hoàn tất phát hành',
    STOPPED: 'Đã dừng',
  };
  return labels[status] ?? status;
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [txPhase, setTxPhase] = useState<TransactionPhase>('idle');
  const [txHash, setTxHash] = useState<string | undefined>();
  const activeSelectedId = selectedId ?? campaigns?.[0]?.id ?? undefined;
  const selectedCampaign = campaigns?.find(c => c.id === activeSelectedId) ?? campaigns?.[0] ?? null;

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
    setTxPhase('signing');
    setTxHash(undefined);
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
      setTxHash(hash);
      setTxPhase('submitted');
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch approveAndDisburse bị revert.');

      setTxPhase('confirmed');
      await syncRewardReceipt(hash);
      setTxPhase('indexed');
      setNotice(`Đã giải ngân cọc in ấn cho chiến dịch #${c.onchainCampaignId} và đồng bộ Indexer!`);
      void refetchCampaigns();
    } catch (err) {
      setTxPhase('error');
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
    setTxPhase('signing');
    setTxHash(undefined);
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
      setTxHash(hash);
      setTxPhase('submitted');
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch candidateExpenditure bị revert.');

      setTxPhase('confirmed');
      await syncRewardReceipt(hash);
      setTxPhase('indexed');
      setNotice('Đã ghi nhận chứng từ chi tiêu (ExpenditureCandidate) trên chuỗi và đồng bộ Indexer!');
      void refetchCampaigns();
    } catch (err) {
      setTxPhase('error');
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
    setTxPhase('signing');
    setTxHash(undefined);
    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'finalizeExpenditure',
        args: [BigInt(c.onchainCampaignId), 0n],
      });
      const hash = await wallet.writeContract(call.request);
      setTxHash(hash);
      setTxPhase('submitted');
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch finalizeExpenditure bị revert.');

      setTxPhase('confirmed');
      await syncRewardReceipt(hash);
      setTxPhase('indexed');
      setNotice('Đã tất toán đợt chi tiêu (FINANCIALLY_SETTLED) trên chuỗi và đồng bộ Indexer!');
      void refetchCampaigns();
    } catch (err) {
      setTxPhase('error');
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
    setTxPhase('signing');
    setTxHash(undefined);
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
      setTxHash(hash);
      setTxPhase('submitted');
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch recordProductionVerified bị revert.');

      setTxPhase('confirmed');
      const res = await verifyResolverRewardProduction(c.id, {
        txHash: hash,
        productionReportHash: reportHash,
      });
      setTxPhase('indexed');
      setNotice(
        `Đã nghiệm thu sản xuất (PRODUCTION_VERIFIED) trên chuỗi! Đã tự động cấp phát ${res.digitalKeysIssued ?? 0} mã đọc kỹ thuật số.`,
      );
      void refetchCampaigns();
    } catch (err) {
      setTxPhase('error');
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
    setTxPhase('signing');
    setTxHash(undefined);
    try {
      const call = await client.simulateContract({
        account: account.address,
        address: rewardContractAddress,
        abi: rewardAbi,
        functionName: 'startWindDown',
        args: [BigInt(c.onchainCampaignId)],
      });
      const hash = await wallet.writeContract(call.request);
      setTxHash(hash);
      setTxPhase('submitted');
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch startWindDown bị revert.');

      setTxPhase('confirmed');
      await syncRewardReceipt(hash);
      setTxPhase('indexed');
      setNotice('Đã kích hoạt Wind-down dừng dự án (STOPPED) và mở khóa REFUND_ELIGIBLE cho toàn bộ backer!');
      void refetchCampaigns();
    } catch (err) {
      setTxPhase('error');
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
    <div className="reward-container resolver-console">
      <header className="reward-hero">
        <span className="reward-badge-category">⚖️ Thẩm quyền Hợp đồng · Resolver Console</span>
        <h1 className="reward-hero-title">Resolver Console</h1>
        <p className="reward-hero-pitch">
          Kiểm tra hồ sơ Editions, ra quyết định và xử lý các bước nghiệm thu cần chữ ký Resolver.
        </p>
      </header>

      {errorMsg && <p className="toast toast--error" role="alert">{errorMsg}</p>}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}

      <section className="panel resolver-queue" aria-labelledby="resolver-queue-title">
        <div className="resolver-section-heading">
          <div>
            <span className="resolver-section-kicker">Hàng đợi Resolver</span>
            <h2 id="resolver-queue-title">Chiến dịch cần xử lý <span className="resolver-count">{campaigns?.length ?? 0}</span></h2>
            <p className="muted">Chọn hồ sơ để kiểm tra cam kết, phản hồi và quyết định bước tiếp theo.</p>
          </div>
        </div>
        {(campaigns || []).length === 0 ? (
          <div className="resolver-empty-state" role="status">
            <span className="resolver-empty-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>Không có chiến dịch nào cần thẩm định lúc này.</strong>
              <p>Chiến dịch mới sẽ xuất hiện sau khi Creator gửi hồ sơ cho Resolver.</p>
            </div>
          </div>
        ) : (
          <div className="resolver-master-detail">
            <aside className="resolver-master-detail__sidebar">
              <ReviewQueue
                campaigns={campaigns || []}
                selectedId={activeSelectedId}
                onSelect={id => setSelectedId(id)}
                onRefresh={() => void refetchCampaigns()}
              />
            </aside>

            <main className="resolver-master-detail__main">
              {txPhase !== 'idle' && (
                <TransactionLifecycle phase={txPhase} hash={txHash} error={errorMsg} />
              )}
              {selectedCampaign && (selectedCampaign.draftConfig || selectedCampaign.category === 'COMICS_ARTBOOK') ? (
                <article className="resolver-campaign-card" key={selectedCampaign.id}>
                  <EditionsResolverReview campaign={selectedCampaign} onChange={() => void refetchCampaigns()} />
                  {selectedCampaign.status === 'APPROVED' && (
                    <div className="resolver-next-action">
                      <p>Hồ sơ đã được duyệt. Tiếp tục sang trang on-chain để chốt funding, nghiệm thu sản xuất và PDF.</p>
                      <a className="button button--primary" href={`#/reward/editions/${selectedCampaign.id}/resolver`}>Mở trang xử lý on-chain →</a>
                    </div>
                  )}
                  {selectedCampaign.reviews && selectedCampaign.reviews.length > 0 && (
                    <ReviewHistoryDisclosure reviews={selectedCampaign.reviews} />
                  )}
                  {selectedCampaign.commitmentHash && ['COMMUNITY_REVIEW', 'APPROVED'].includes(selectedCampaign.status) && (
                    <details className="resolver-community-details">
                      <summary>Phản hồi cộng đồng <span>Góp ý tham khảo · không phải phiếu quyết định</span></summary>
                      <EditionsCommunity id={selectedCampaign.id} userId={userId} viewerMode="resolver" commitmentHash={selectedCampaign.commitmentHash} />
                    </details>
                  )}
                </article>
              ) : selectedCampaign ? (
                <article className="resolver-campaign-card" key={selectedCampaign.id}>
                  <div className="resolver-campaign-card__header">
                    <div>
                      <h3>{selectedCampaign.title}</h3>
                      <span className="resolver-status-pill">{resolverStatusLabel(selectedCampaign.status)}</span>
                      <span className="resolver-campaign-card__meta">
                        Goal: {(Number(selectedCampaign.goal) / 1e6).toLocaleString()} USDC
                        {selectedCampaign.onchainCampaignId ? ` · On-chain ID #${selectedCampaign.onchainCampaignId}` : ''}
                      </span>
                    </div>

                    <div className="resolver-action-group">
                      {selectedCampaign.status === 'UNDER_REVIEW' && (
                        <>
                          <button className="button button--primary" disabled={busy} onClick={() => void handleReviewCampaign(selectedCampaign, 'APPROVED')}>
                            Duyệt cam kết
                          </button>
                          <button className="button button--secondary" disabled={busy} onClick={() => void handleReviewCampaign(selectedCampaign, 'CHANGES_REQUESTED')}>
                            Yêu cầu sửa
                          </button>
                        </>
                      )}
                      {selectedCampaign.status === 'PUBLISHED' && selectedCampaign.onchainCampaignId && (
                        <button className="button button--primary" disabled={busy} onClick={() => void handleActivateOnchain(selectedCampaign)}>
                          Kích hoạt On-chain (activateCampaign)
                        </button>
                      )}
                      {selectedCampaign.status === 'ACTIVE' && selectedCampaign.onchainCampaignId && (
                        <>
                          <button className="button button--secondary" disabled={busy} onClick={() => void handleApproveDepositOnchain(selectedCampaign)}>
                            1. Giải ngân cọc
                          </button>
                          <button className="button button--secondary" disabled={busy} onClick={() => void handleCandidateExpenditureOnchain(selectedCampaign)}>
                            2. Ghi nhận hóa đơn
                          </button>
                          <button className="button button--secondary" disabled={busy} onClick={() => void handleFinalizeExpenditureOnchain(selectedCampaign)}>
                            3. Tất toán cọc
                          </button>
                          <button className="button button--primary" disabled={busy} onClick={() => void handleVerifyProductionOnchain(selectedCampaign)}>
                            4. Nghiệm thu sản xuất
                          </button>
                        </>
                      )}

                      {(selectedCampaign.status === 'ACTIVE' || selectedCampaign.status === 'PRODUCTION_VERIFIED' || selectedCampaign.status === 'FULFILLMENT_COMPLETE') && selectedCampaign.onchainCampaignId && (
                        <button
                          className="button button--secondary"
                          style={{ color: '#dc2626' }}
                          disabled={busy}
                          onClick={() => void handleStartWindDownOnchain(selectedCampaign)}
                        >
                          Dừng & mở hoàn tiền
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ) : null}
            </main>
          </div>
        )}
      </section>

      <section className="panel resolver-queue resolver-disputes" aria-labelledby="resolver-disputes-title">
        <div className="resolver-section-heading">
          <div>
            <span className="resolver-section-kicker">Sau phát hành</span>
            <h2 id="resolver-disputes-title">Khiếu nại cần phân xử <span className="resolver-count">{disputes?.length ?? 0}</span></h2>
            <p className="muted">Chỉ xuất hiện khi có backer gửi khiếu nại cần Resolver xem xét.</p>
          </div>
        </div>
        {(disputes || []).length === 0 ? (
          <div className="resolver-empty-state resolver-empty-state--quiet" role="status">
            <span className="resolver-empty-state__icon" aria-hidden="true">✓</span>
            <div>
              <strong>Không có khiếu nại nào cần xử lý.</strong>
              <p>Khu vực này sẽ được cập nhật khi phát sinh khiếu nại.</p>
            </div>
          </div>
        ) : (
          <div className="resolver-dispute-list">
            {disputes!.map(d => (
              <article className="resolver-dispute-card" key={d.id}>
                <div>
                  <strong>Khiếu nại #{d.id.slice(0, 8)}</strong> · <strong>{d.status}</strong>
                  <p>Lý do: {d.reason}</p>
                </div>
                {d.status === 'OPEN' && (
                  <div className="resolver-action-group">
                    <button className="button button--primary" disabled={busy} onClick={() => void handleResolveDispute(d, 'RESOLVED_BACKER')}>
                      Chấp thuận Backer (Mở REFUND_ELIGIBLE)
                    </button>
                    <button className="button button--secondary" disabled={busy} onClick={() => void handleResolveDispute(d, 'RESOLVED_CREATOR')}>
                      Bác bỏ (Xác nhận đã giao)
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
