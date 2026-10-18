import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { claimHistoricalRefund, listMyHistoricalEntitlements } from '../../../lib/api/historical-campaigns';
import type { HistoricalEntitlement } from '../../../lib/api/historical-campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { historicalCampaignAbi, historicalCampaignAddress, activeChain } from '../../../lib/web3/historical-deployment';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import '../shared/styles.css';

// Historical financial records. Current PDF rights live in the campaigns library.
export function HistoricalEntitlements() {
  const { session } = useAccountSession();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['campaign-history-entitlements', session?.userId],
    queryFn: ({ signal }) => listMyHistoricalEntitlements(signal), enabled: Boolean(session?.userId),
  });
  return <div className="campaign-container"><h1>Hồ sơ quyền lợi lịch sử</h1>
    <p>Dữ liệu giao nhận đã được lưu trữ riêng. Trạng thái trong DB không tự tạo quyền hoàn tiền trên hợp đồng.</p>
    {isPending && <p role="status">Đang tải lịch sử…</p>}
    {error && <p role="alert">{getErrorMessage(error)}</p>}
    {data?.map(item => <HistoricalEntitlement key={item.id} item={item} onChanged={() => void refetch()} />)}
  </div>;
}

function HistoricalEntitlement({ item, onChanged }: { item: HistoricalEntitlement; onChanged: () => void }) {
  const account = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const currentDeployment = item.contractAddress?.toLowerCase() === historicalCampaignAddress.toLowerCase();
  async function claim() {
    setBusy(true); setNotice('');
    try {
      if (!currentDeployment || !client || !wallet || !account.address || item.onchainCampaignId === null
        || account.chainId !== activeChain.id || account.address.toLowerCase() !== item.backerWallet.toLowerCase()) {
        throw new Error('Cần đúng ví backer, mạng local và deployment đã được cấu hình.');
      }
      const call = await client.simulateContract({ account: account.address, address: historicalCampaignAddress, abi: historicalCampaignAbi,
        functionName: 'claimRefund', args: [BigInt(item.onchainCampaignId)] });
      const hash = await wallet.writeContract(call.request);
      setNotice(`Đã gửi: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== 'success') throw new Error('Giao dịch hoàn tiền bị revert.');
      await claimHistoricalRefund({ txHash: hash, campaignId: item.campaignId });
      setNotice('Đã xác nhận receipt và đồng bộ hoàn tiền.'); onChanged();
    } catch (error) { setNotice(getErrorMessage(error)); } finally { setBusy(false); }
  }
  return <article className="panel"><h2>{item.campaignTitle}</h2><p>{item.tier.title} · {item.status}</p>
    <p>Deployment: {item.contractAddress || 'Chưa đối chiếu'} · Campaign #{item.onchainCampaignId ?? '?'}</p>
    <p>Đã ghi nhận: {item.amountPaid} đơn vị token cơ sở. Receipt: {item.txHash}</p>
    {item.status === 'REFUND_ELIGIBLE' && <p>Quyết định lịch sử của Resolver; hợp đồng sẽ kiểm tra quyền claim khi mô phỏng giao dịch.</p>}
    {!currentDeployment && <p>Hồ sơ thuộc deployment lịch sử; chưa có kết nối giao dịch cho deployment này.</p>}
    {currentDeployment && item.status === 'REFUND_ELIGIBLE' && <button className="button button--secondary" disabled={busy} onClick={() => void claim()}>Kiểm tra và claim hoàn tiền</button>}
    {notice && <p role="status">{notice}</p>}
  </article>;
}
