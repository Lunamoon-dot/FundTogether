import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, keccak256, toHex } from 'viem';
import type { Abi, Address } from 'viem';
import campaignAbiJson from '../../../../../backend/src/blockchain/generated/campaigns/fund-together-campaign.abi.json';
import mockUsdcAbiJson from '../../../../../backend/src/blockchain/generated/fundtogether/mock-usdc.abi.json';
import { campaignApi, listTransactionWallets } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import {
  clearStoredTransaction,
  loadLatestTransaction,
  saveTransaction,
} from './recovery';
import type {
  CampaignTransactionAction,
  TransactionRecord,
  TransactionStage,
} from './recovery';

const abi = campaignAbiJson as Abi;
const tokenErrorAbi = (mockUsdcAbiJson as Abi).filter(item => item.type === 'error') as Abi;

const transactionAction = (functionName: string): CampaignTransactionAction => {
  const actions: CampaignTransactionAction[] = [
    'approveCampaign', 'createCampaign', 'pledge', 'submitProduction', 'submitRelease',
    'reviewProduction', 'confirmCampaignCompletion', 'reviewRelease', 'challengeRelease', 'resolveChallenge',
    'finalizeFunding', 'startRefunds', 'claimRefund', 'requestCompletion', 'approveCompletion', 'rejectCompletion', 'claimSurplus', 'cancelCampaign',
    'requestDisbursement', 'approveDisbursement', 'rejectDisbursement',
  ];
  if (!actions.includes(functionName as CampaignTransactionAction)) throw new Error(`Unsupported campaign transaction: ${functionName}`);
  return functionName as CampaignTransactionAction;
};

interface TransactionContext {
  userId?: string;
  campaignId?: string;
}

function formatTransactionError(err: unknown): string {
  const raw = getErrorMessage(err);
  const text = (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
    ? `${err.message} ${raw}`
    : raw).toLowerCase();

  if (text.includes('user rejected') || text.includes('userrejectedrequest') || text.includes('user denied')) {
    return 'Bạn đã từ chối xác nhận giao dịch trong ví.';
  }
  if (text.includes('expired') || text.includes('0x203d82d8')) {
    return 'Thời hạn gây quỹ của chiến dịch đã kết thúc (Expired).';
  }
  if (text.includes('wrongstate') || text.includes('0x3233c04f')) {
    return 'Trạng thái chiến dịch trên hợp đồng không phù hợp với thao tác này (WrongState).';
  }
  if (text.includes('notapproved') || text.includes('0xa71b3e51')) {
    return 'Chiến dịch chưa được phê duyệt trên hợp đồng (NotApproved).';
  }
  if (text.includes('unauthorized') || text.includes('wrongcaller')) {
    return 'Ví hiện tại không có quyền thực hiện thao tác này (Unauthorized).';
  }
  if (text.includes('tooearly')) {
    return 'Chưa đến thời điểm hợp lệ để thực hiện thao tác (TooEarly).';
  }
  if (text.includes('opendisputes')) {
    return 'Vẫn còn tranh chấp đang mở, chưa thể xử lý (OpenDisputes).';
  }
  if (text.includes('completionrequestmismatch')) {
    return 'Yêu cầu hoàn thành đã thay đổi hoặc không còn khớp với hồ sơ hiện tại. Hãy tải lại dossier.';
  }
  if (text.includes('nosurplus')) {
    return 'Không còn phần surplus khả dụng để nhận.';
  }
  if (text.includes('invalidinput') && (text.includes('completion') || text.includes('dossier'))) {
    return 'Thông tin hồ sơ hoàn thành không hợp lệ.';
  }
  if (text.includes('norefund')) {
    return 'Không có khoản hoàn tiền khả dụng cho ví này (NoRefund).';
  }
  if (text.includes('inexacttransfer')) {
    return 'Số tiền chuyển không khớp với yêu cầu giao dịch (InexactTransfer).';
  }
  if (text.includes('erc20insufficientbalance') || text.includes('0xe450d38c')) {
    return 'Số dư MockUSDC không đủ để pledge. Approve có thể đã thành công nhưng pledge chưa được gửi.';
  }
  if (text.includes('erc20insufficientallowance') || text.includes('0xfb8f41b2')) {
    return 'Allowance MockUSDC chưa đủ cho khoản pledge. Hãy approve lại rồi thử pledge.';
  }
  if (text.includes('insufficient funds') || text.includes('exceeds balance')) {
    return 'Số dư trong ví không đủ để thanh toán token hoặc phí gas mạng.';
  }

  const cleaned = raw
    .split(/\b(Contract Call:|Docs:|Version:|Raw Call Arguments:)\b/i)[0]
    .replace(/^An error occurred in the contract execution:\s*/i, '')
    .trim()
    .replace(/\s+/g, ' ');

  return cleaned || raw || 'Giao dịch không thành công. Hãy thử lại.';
}

export function useTransaction(onConfirmed: () => void, context: TransactionContext = {}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const contextKey = JSON.stringify([context.userId ?? null, context.campaignId ?? null]);
  const [transactionState, setTransactionState] = useState<{ key: string; record: TransactionRecord | null }>(() => ({
    key: contextKey,
    record: context.userId && context.campaignId
      ? loadLatestTransaction(context.userId, context.campaignId)
      : null,
  }));
  const transaction = transactionState.key === contextKey
    ? transactionState.record
    : context.userId && context.campaignId
      ? loadLatestTransaction(context.userId, context.campaignId)
      : null;

  function updateTransaction(record: TransactionRecord | null) {
    setTransactionState({ key: contextKey, record });
  }

  function persist(action: CampaignTransactionAction, stage: TransactionStage, txHash?: `0x${string}`, message?: string) {
    if (!context.userId || !context.campaignId) return null;
    const record: TransactionRecord = {
      userId: context.userId,
      campaignId: context.campaignId,
      action,
      stage,
      ...(txHash ? { txHash } : {}),
      ...(message ? { error: message } : {}),
      updatedAt: new Date().toISOString(),
    };
    saveTransaction(record);
    updateTransaction(record);
    return record;
  }

  async function reconcile(action?: CampaignTransactionAction, txHash?: `0x${string}`): Promise<'PENDING' | 'ON_CHAIN_CONFIRMED'> {
    if (!client || !context.userId || !context.campaignId) return 'PENDING';
    const record = txHash && action
      ? persist(action, 'submitted', txHash)
      : transaction ?? loadLatestTransaction(context.userId, context.campaignId);
    if (!record?.txHash) return 'PENDING';
    setBusy(true); setError(''); setNotice('Đang kiểm tra receipt và đồng bộ canonical…');
    try {
      const receipt = await client.getTransactionReceipt({ hash: record.txHash });
      if (receipt.status !== 'success') {
        persist(record.action, 'failed', record.txHash, `Giao dịch đã revert: ${record.txHash}`);
        setNotice('');
        return 'PENDING';
      }
      persist(record.action, 'receipt_confirmed', record.txHash);
      persist(record.action, 'indexing', record.txHash);
      const synced = await campaignApi.sync(record.txHash, context.campaignId, record.action);
      if (synced.state === 'REVERTED' || synced.state === 'UNRELATED') {
        persist(record.action, 'failed', record.txHash, synced.state === 'REVERTED'
          ? 'Giao dịch đã revert; không có trạng thái canonical để đồng bộ.'
          : 'Transaction không khớp action hoặc campaign hiện tại.');
        setNotice('');
        return 'PENDING';
      }
      if (synced.state !== 'ON_CHAIN_CONFIRMED') {
        persist(record.action, 'indexing', record.txHash, 'Indexer chưa xác nhận đúng event canonical; hãy kiểm tra lại sau ít giây.');
        setNotice('');
        return 'PENDING';
      }
      persist(record.action, 'canonical', record.txHash);
      clearStoredTransaction(context.userId, context.campaignId, record.action);
      updateTransaction(loadLatestTransaction(context.userId, context.campaignId));
      setNotice(`Giao dịch đã được xác nhận và đồng bộ · ${record.txHash}`);
      onConfirmed();
      return 'ON_CHAIN_CONFIRMED';
    } catch {
      persist(record.action, 'indexing', record.txHash, 'Indexer chưa xác nhận giao dịch; hãy thử kiểm tra lại sau ít giây.');
      setNotice('');
      return 'PENDING';
    } finally {
      setBusy(false);
    }
  }

  function clearTransaction() {
    if (context.userId && context.campaignId && transaction) clearStoredTransaction(context.userId, context.campaignId, transaction.action);
    updateTransaction(context.userId && context.campaignId ? loadLatestTransaction(context.userId, context.campaignId) : null);
    setError('');
    setNotice('');
  }

  async function send(functionName: string, args: readonly unknown[], options: { expectedWallet?: string; pledgePrice?: string } = {}) {
    const action = transactionAction(functionName);
    setBusy(true); setError(''); setNotice('Đang kiểm tra mạng và ví đã liên kết…');
    persist(action, 'preflight');
    let submitted: `0x${string}` | undefined;
    let approvalCompleted = false;
    try {
      if (!context.campaignId) throw new Error('Thiếu campaign cho giao dịch này.');
      if (!account.address) throw new Error('Ví chưa được kết nối với trang FundTogether. Hãy bấm Kết nối ví trong ứng dụng.');
      if (!wallet) throw new Error('Trang chưa nhận được wallet provider. Hãy ngắt kết nối rồi kết nối lại ví trong ứng dụng.');
      if (!client) throw new Error('Không đọc được RPC Campaign local. Hãy kiểm tra API/RPC 127.0.0.1:9548.');
      const walletChainId = await wallet.getChainId();
      if (account.chainId !== 31339 || walletChainId !== 31339) {
        throw new Error(`Ví đang ở chain ${walletChainId}; FundTogether Campaign yêu cầu chain 31339. Hãy kết nối lại đúng network trong ứng dụng.`);
      }
      const [deployment, links] = await Promise.all([campaignApi.deployment(), listTransactionWallets()]);
      const actor = account.address;
      if (!links.some(link => link.address.toLowerCase() === actor.toLowerCase())) throw new Error('Ví đang kết nối chưa được liên kết bằng chữ ký với tài khoản này.');
      if (options.expectedWallet && options.expectedWallet.toLowerCase() !== actor.toLowerCase()) throw new Error('Hãy chọn đúng ví có thẩm quyền cho thao tác này.');
      const [chainId, genesis, code] = await Promise.all([client.getChainId(), client.getBlock({ blockNumber: 0n }), client.getCode({ address: deployment.contractAddress })]);
      if (deployment.protocolKind !== 'CAMPAIGNS' || deployment.chainId !== 31339 || chainId !== 31339 || deployment.abiVersion !== 'campaigns-local-v6' ||
        deployment.abiHash !== keccak256(toHex(JSON.stringify(campaignAbiJson, null, 2) + '\n')) || genesis.hash !== deployment.genesisHash || !code || keccak256(code) !== deployment.contractCodeHash)
        throw new Error('Deployment hiện tại không khớp mạng, ABI hoặc bytecode đã kiểm tra.');
      if (functionName === 'approveCampaign' || functionName === 'createCampaign') {
        const creatorWallet = functionName === 'approveCampaign' ? String(args[0] ?? '') : actor;
        const resolverWallets = [deployment.resolver, deployment.backupResolver].map(address => address.toLowerCase());
        if (resolverWallets.includes(creatorWallet.toLowerCase())) {
          throw new Error('Ví Creator không được trùng ví Resolver của deployment hiện tại.');
        }
      }

      async function write(address: Address, contractAbi: Abi, method: string, values: readonly unknown[], track = false) {
        if (!wallet || !client) throw new Error('Ví đã ngắt kết nối.');
        const addresses = await wallet.getAddresses();
        if (addresses[0]?.toLowerCase() !== actor.toLowerCase() || await wallet.getChainId() !== 31339) throw new Error('Ví hoặc mạng đã thay đổi; thực hiện lại thao tác.');
        const simulationAbi = method === 'pledge' ? [...contractAbi, ...tokenErrorAbi] as Abi : contractAbi;
        const { request } = await client.simulateContract({ address, abi: simulationAbi, functionName: method, args: values, account: actor });
        setNotice('Chờ xác nhận trong ví…');
        persist(action, 'awaiting_signature');
        const txHash = await wallet.writeContract(request);
        if (track) persist(action, 'submitted', txHash);
        setNotice(`Đã gửi ${txHash}; chờ receipt thành công…`);
        const receipt = await client.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') throw new Error(`Giao dịch revert: ${txHash}`);
        if (track) persist(action, 'receipt_confirmed', txHash);
        return txHash;
      }
      if (options.pledgePrice) {
        const pledgeAmount = BigInt(options.pledgePrice);
        const balance = await client.readContract({ address: deployment.tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [actor] });
        if (balance < pledgeAmount) throw new Error('Số dư MockUSDC không đủ để pledge.');
        const allowance = await client.readContract({ address: deployment.tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [actor, deployment.contractAddress] });
        if (allowance < pledgeAmount) {
          setNotice('Bước 1/2 · Xác nhận approve MockUSDC trong ví.');
          await write(deployment.tokenAddress, erc20Abi, 'approve', [deployment.contractAddress, pledgeAmount]);
          approvalCompleted = true;
          setNotice('Approve đã thành công. Bước 2/2 · Xác nhận pledge trong ví.');
        } else {
          setNotice('Allowance đã đủ. Bước 2/2 · Xác nhận pledge trong ví.');
        }
      }
      submitted = await write(deployment.contractAddress, abi, functionName, args, true);
      persist(action, 'indexing', submitted);
      setNotice(`Receipt thành công ${submitted}; chờ indexer xác nhận canonical…`);
      const result = await campaignApi.sync(submitted, context.campaignId, action);
      if (result.state !== 'ON_CHAIN_CONFIRMED') throw new Error('Indexer chưa xác nhận giao dịch.');
      persist(action, 'canonical', submitted);
      if (context.userId && context.campaignId) clearStoredTransaction(context.userId, context.campaignId, action);
      updateTransaction(context.userId && context.campaignId ? loadLatestTransaction(context.userId, context.campaignId) : null);
      setNotice(`Giao dịch đã được xác nhận và đồng bộ · ${submitted}`); onConfirmed();
    } catch (err) {
      const message = formatTransactionError(err);
      if (submitted) {
        persist(action, 'indexing', submitted, message);
        setError(`${message} Receipt: ${submitted}. Hãy kiểm tra trạng thái trước khi gửi lại.`);
      } else {
        const failure = approvalCompleted
          ? `Approve MockUSDC đã thành công nhưng pledge chưa được gửi. ${message}`
          : message;
        persist(action, 'failed', undefined, failure);
        setError(failure);
      }
      setNotice('');
    } finally { setBusy(false); }
  }
  return { send, reconcile, clearTransaction, transaction, busy, notice, error, address: account.address };
}
