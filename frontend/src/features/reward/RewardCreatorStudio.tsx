import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, keccak256, parseEventLogs, toHex } from 'viem';
import {
  listMyRewardCampaigns,
  freezeRewardCampaign,
  submitCampaignReview,
  registerRewardOnchain,
  completeRewardCampaign,
  getCreatorProfile,
  applyCreatorVerification,
  syncRewardReceipt,
} from '../../lib/api/reward';
import { EditionsPreparationPanel, NewEditionsPreparationPanel } from './EditionsReview';
import { CreatorPipeline } from './ui/CreatorPipeline';
import { CreatorTaskCard } from './ui/CreatorTaskCard';
import type { RewardCampaign } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import {
  rewardAbi,
  rewardContractAddress,
  activeChain,
} from '../../lib/web3/reward-deployment';
import './reward.css';

export function RewardCreatorStudio({ userId, path }: { userId: string; path?: string }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });

  const tab: 'studio' | 'draft' | 'all' = path
    ? (path === '/reward/creator/draft' || path === '/reward/creator/new' ? 'draft' : 'studio')
    : 'all';

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

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [newlyCreatedCampaign, setNewlyCreatedCampaign] = useState<RewardCampaign | null>(null);

  async function handleNewCampaignCreated(campaign: RewardCampaign) {
    const result = await refetch();
    setNewlyCreatedCampaign(result.data?.find(item => item.id === campaign.id) ?? campaign);
  }

  async function refreshNewlyCreatedCampaign() {
    if (!newlyCreatedCampaign) return;
    const result = await refetch();
    const updated = result.data?.find(item => item.id === newlyCreatedCampaign.id);
    if (updated) setNewlyCreatedCampaign(updated);
  }

  async function handleApplyProfile(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSuccessNotice('');

    if (displayName.trim().length < 3) {
      setFormError('Bút danh / Tên Studio xuất bản phải từ 3 ký tự trở lên.');
      return;
    }
    if (bio.trim().length < 10) {
      setFormError('Tiểu sử & Kinh nghiệm sáng tác phải có ít nhất 10 ký tự.');
      return;
    }
    if (ipDeclaration.trim().length < 10) {
      setFormError('Cam kết Bản quyền Sở hữu Trí tuệ (IP Declaration) phải từ 10 ký tự trở lên.');
      return;
    }

    setBusy(true);
    try {
      await applyCreatorVerification({ displayName: displayName.trim(), bio: bio.trim(), ipDeclaration: ipDeclaration.trim() });
      setSuccessNotice('Đã gửi hồ sơ xác minh Tác giả (Flow V1). Vui lòng chờ Admin phê duyệt.');
      void refetchProfile();
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
      {/* Tabs navigation */}
      <div className="reward-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <a
          href="#/reward/creator"
          className={`button ${tab === 'studio' ? 'button--primary' : 'button--secondary'}`}
        >
          Studio của tôi
        </a>
        <a
          href="#/reward/creator/draft"
          className={`button ${tab === 'draft' ? 'button--primary' : 'button--secondary'}`}
        >
          Tạo bản thảo
        </a>
      </div>

      {formError && <p className="toast toast--error" role="alert">{formError}</p>}
      {successNotice && <p className="toast toast--success" role="status">{successNotice}</p>}

      {/* Trang 1: Studio (Flow V1: Creator Verification) */}
      {(tab === 'studio' || tab === 'all') && (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Bước 0 (Flow V1): Hồ sơ Xác minh Tác giả & Bản quyền IP</h2>
            <span className="reward-status-pill status-active">
              {profile?.status || 'CHƯA ĐĂNG KÝ'}
            </span>
          </div>
          {profile?.status === 'VERIFIED' ? (
            <div style={{ marginTop: '12px' }}>
              <p className="muted">
                ✓ Bút danh <strong>{profile.displayName}</strong> đã được Admin xác minh bản quyền (Flow V1). Bạn có thể khởi tạo bản thảo Editions.
              </p>
              <div style={{ marginTop: '14px' }}>
                <a href="#/reward/creator/draft" className="button button--primary">
                  ➕ Tạo bản thảo mới
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleApplyProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
              <label>
                <span>Bút danh / Tên Studio xuất bản (tối thiểu 3 ký tự):</span>
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Studio Truyện Tranh Việt"
                />
              </label>
              <label>
                <span>Tiểu sử & Kinh nghiệm sáng tác (tối thiểu 10 ký tự):</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Giới thiệu tác giả, quá trình sáng tác, các tác phẩm đã xuất bản (tối thiểu 10 ký tự)..."
                />
                <span style={{ fontSize: '12px', color: bio.trim().length > 0 && bio.trim().length < 10 ? '#dc2626' : '#6b7280', display: 'block', marginTop: '3px' }}>
                  {bio.trim().length < 10
                    ? `⚠️ Cần tối thiểu 10 ký tự (hiện có ${bio.trim().length}/10 ký tự)`
                    : `✓ Đã đạt ${bio.trim().length} ký tự`}
                </span>
              </label>
              <label>
                <span>Cam kết Bản quyền Sở hữu Trí tuệ (IP Declaration):</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={2}
                  value={ipDeclaration}
                  onChange={e => setIpDeclaration(e.target.value)}
                />
              </label>
              <button type="submit" className="button button--primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
                {profile ? 'Cập nhật & Gửi lại Hồ sơ V1' : 'Gửi Hồ sơ Xác minh Tác giả (V1)'}
              </button>
            </form>
          )}
        </section>
      )}

      {/* Trang 2: Tạo bản thảo */}
      {tab === 'draft' && (
        profile?.status !== 'VERIFIED' ? (
          <section className="panel" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎨</div>
            <h2 style={{ marginBottom: '8px' }}>Chưa xác minh Hồ sơ Studio / Tác giả</h2>
            <p className="muted" style={{ maxWidth: '540px', margin: '0 auto 24px auto', lineHeight: '1.6' }}>
              {profile?.status === 'PENDING'
                ? 'Hồ sơ Studio của bạn đang chờ Admin thẩm định và phê duyệt (Flow V1). Vui lòng đợi phê duyệt để có thể khởi tạo bản thảo.'
                : profile?.status === 'REJECTED'
                ? `Hồ sơ Studio bị từ chối (${profile.rejectionReason || 'Vui lòng kiểm tra lại thông tin'}). Vui lòng cập nhật lại hồ sơ Studio.`
                : 'Để đảm bảo tính minh bạch và bảo hộ quyền sở hữu trí tuệ, bạn cần tạo Hồ sơ Tác giả & cam kết Bản quyền IP (Bước 0) trước khi có thể khởi tạo bản thảo gọi vốn.'}
            </p>
            <div><a className="button button--primary" href="#/reward/creator">Qua trang xác minh Studio</a></div>
          </section>
        ) : (
          newlyCreatedCampaign ? (
            <EditionsPreparationPanel campaign={newlyCreatedCampaign} initialStep={2} onChange={refreshNewlyCreatedCampaign} />
          ) : (
            <NewEditionsPreparationPanel onCreated={handleNewCampaignCreated} />
          )
        )
      )}

      {/* Tiến trình sản xuất */}
      {(tab === 'studio' || tab === 'all') && (
        <CreatorPipeline campaigns={campaigns ?? []} />
      )}

      {/* Cần bạn làm task cards */}
      {(tab === 'studio' || tab === 'all') && campaigns && campaigns.length > 0 && (
        <section className="creator-tasks-section panel" aria-label="Cần bạn làm">
          <h2>Cần bạn làm ({campaigns.length})</h2>
          <div className="creator-tasks-grid">
            {campaigns.map(c => {
              const editHref = c.status === 'CHANGES_REQUESTED'
                ? `#/reward/creator?edit=${c.id}&step=3`
                : c.status === 'APPROVED'
                ? `#/reward/editions/${c.id}/creator`
                : `#/reward/creator?edit=${c.id}`;
              return (
                <CreatorTaskCard
                  key={c.id}
                  campaign={c}
                  href={editHref}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Danh sách dự án: chỉ hiển thị ở tab Studio */}
      {(tab === 'studio' || tab === 'all') && (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h2>Dự án của bạn ({campaigns?.length ?? 0})</h2>
            {profile?.status === 'VERIFIED' && (
              <a href="#/reward/creator/draft" className="button button--secondary">
                ➕ Tạo bản thảo mới
              </a>
            )}
          </div>
          {isPending ? (
            <p className="muted">Đang tải danh sách…</p>
          ) : error ? (
            <p className="toast toast--error">{getErrorMessage(error)}</p>
          ) : (campaigns || []).length === 0 ? (
            <div style={{ marginTop: '12px' }}>
              <p className="muted">Bạn chưa tạo chiến dịch truyện tranh nào.</p>
              {profile?.status === 'VERIFIED' && (
                <div style={{ marginTop: '12px' }}>
                  <a href="#/reward/creator/draft" className="button button--primary">
                    Khởi tạo bản thảo đầu tiên
                  </a>
                </div>
              )}
            </div>
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
                      {editions && c.status === 'UNDER_REVIEW_PRIVATE' && <p className="muted">Hồ sơ đang được Resolver kiểm tra riêng; chưa mở community review.</p>}
                      {editions && c.frozenSnapshot && ['COMMUNITY_REVIEW', 'APPROVED'].includes(c.status) && <a className="button button--secondary" href={`#/reward/editions/${c.id}/creator`}>Mở community & phát hành PDF local</a>}
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

                  {editions && <EditionsPreparationPanel campaign={c} onChange={() => refetch()} />}

                </div>
              ); })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

