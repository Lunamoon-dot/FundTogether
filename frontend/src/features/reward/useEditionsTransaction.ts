import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, keccak256, toHex } from 'viem';
import type { Abi, Address } from 'viem';
import editionsAbiJson from '../../../../backend/src/blockchain/generated/editions/fund-together-editions.abi.json';
import { editionsApi } from '../../lib/api/editions';
import { listEditionsWallets } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';
import {
  clearEditionsTransaction,
  loadLatestEditionsTransaction,
  saveEditionsTransaction,
} from './editions-transaction-recovery';
import type {
  EditionsTransactionAction,
  EditionsTransactionRecord,
  EditionsTransactionStage,
} from './editions-transaction-recovery';

const abi = editionsAbiJson as Abi;

const transactionAction = (functionName: string): EditionsTransactionAction => {
  const actions: EditionsTransactionAction[] = [
    'approveCampaign', 'createCampaign', 'pledge', 'submitProduction', 'submitRelease',
    'reviewProduction', 'reviewRelease', 'challengeRelease', 'resolveChallenge',
    'finalizeFunding', 'startRefunds', 'claimRefund', 'payout', 'cancelCampaign',
  ];
  if (!actions.includes(functionName as EditionsTransactionAction)) throw new Error(`Unsupported Editions transaction: ${functionName}`);
  return functionName as EditionsTransactionAction;
};

interface EditionsTransactionContext {
  userId?: string;
  campaignId?: string;
}

export function useEditionsTransaction(onConfirmed: () => void, context: EditionsTransactionContext = {}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const contextKey = JSON.stringify([context.userId ?? null, context.campaignId ?? null]);
  const [transactionState, setTransactionState] = useState<{ key: string; record: EditionsTransactionRecord | null }>(() => ({
    key: contextKey,
    record: context.userId && context.campaignId
      ? loadLatestEditionsTransaction(context.userId, context.campaignId)
      : null,
  }));
  const transaction = transactionState.key === contextKey
    ? transactionState.record
    : context.userId && context.campaignId
      ? loadLatestEditionsTransaction(context.userId, context.campaignId)
      : null;

  function updateTransaction(record: EditionsTransactionRecord | null) {
    setTransactionState({ key: contextKey, record });
  }

  function persist(action: EditionsTransactionAction, stage: EditionsTransactionStage, txHash?: `0x${string}`, message?: string) {
    if (!context.userId || !context.campaignId) return null;
    const record: EditionsTransactionRecord = {
      userId: context.userId,
      campaignId: context.campaignId,
      action,
      stage,
      ...(txHash ? { txHash } : {}),
      ...(message ? { error: message } : {}),
      updatedAt: new Date().toISOString(),
    };
    saveEditionsTransaction(record);
    updateTransaction(record);
    return record;
  }

  async function reconcile(action?: EditionsTransactionAction, txHash?: `0x${string}`): Promise<'PENDING' | 'ON_CHAIN_CONFIRMED'> {
    if (!client || !context.userId || !context.campaignId) return 'PENDING';
    const record = txHash && action
      ? persist(action, 'submitted', txHash)
      : transaction ?? loadLatestEditionsTransaction(context.userId, context.campaignId);
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
      const synced = await editionsApi.sync(record.txHash, context.campaignId, record.action);
      if (synced.state === 'REVERTED' || synced.state === 'UNRELATED') {
        persist(record.action, 'failed', record.txHash, synced.state === 'REVERTED'
          ? 'Giao dịch đã revert; không có trạng thái canonical để đồng bộ.'
          : 'Transaction không khớp action hoặc campaign Editions hiện tại.');
        setNotice('');
        return 'PENDING';
      }
      if (synced.state !== 'ON_CHAIN_CONFIRMED') {
        persist(record.action, 'indexing', record.txHash, 'Indexer chưa xác nhận đúng event canonical; hãy kiểm tra lại sau ít giây.');
        setNotice('');
        return 'PENDING';
      }
      persist(record.action, 'canonical', record.txHash);
      clearEditionsTransaction(context.userId, context.campaignId, record.action);
      updateTransaction(loadLatestEditionsTransaction(context.userId, context.campaignId));
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
    if (context.userId && context.campaignId && transaction) clearEditionsTransaction(context.userId, context.campaignId, transaction.action);
    updateTransaction(context.userId && context.campaignId ? loadLatestEditionsTransaction(context.userId, context.campaignId) : null);
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
      if (!context.campaignId) throw new Error('Thiếu campaign Editions cho giao dịch này.');
      if (!account.address || !wallet || !client || account.chainId !== 31339) throw new Error('Kết nối ví đã liên kết trên mạng local 31339.');
      const [deployment, links] = await Promise.all([editionsApi.deployment(), listEditionsWallets()]);
      const actor = account.address;
      if (!links.some(link => link.address.toLowerCase() === actor.toLowerCase())) throw new Error('Ví đang kết nối chưa được liên kết bằng chữ ký với tài khoản này.');
      if (options.expectedWallet && options.expectedWallet.toLowerCase() !== actor.toLowerCase()) throw new Error('Hãy chọn đúng ví có thẩm quyền cho thao tác này.');
      const [chainId, genesis, code] = await Promise.all([client.getChainId(), client.getBlock({ blockNumber: 0n }), client.getCode({ address: deployment.contractAddress })]);
      if (deployment.protocolKind !== 'EDITIONS' || deployment.chainId !== 31339 || chainId !== 31339 || deployment.abiVersion !== 'editions-local-v1' ||
        deployment.abiHash !== keccak256(toHex(JSON.stringify(editionsAbiJson, null, 2) + '\n')) || genesis.hash !== deployment.genesisHash || !code || keccak256(code) !== deployment.contractCodeHash)
        throw new Error('Deployment Editions không khớp mạng, ABI hoặc bytecode đã kiểm tra.');

      async function write(address: Address, contractAbi: Abi, method: string, values: readonly unknown[], track = false) {
        if (!wallet || !client) throw new Error('Ví đã ngắt kết nối.');
        const addresses = await wallet.getAddresses();
        if (addresses[0]?.toLowerCase() !== actor.toLowerCase() || await wallet.getChainId() !== 31339) throw new Error('Ví hoặc mạng đã thay đổi; thực hiện lại thao tác.');
        const { request } = await client.simulateContract({ address, abi: contractAbi, functionName: method, args: values, account: actor });
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
        const allowance = await client.readContract({ address: deployment.tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [actor, deployment.contractAddress] });
        if (allowance < BigInt(options.pledgePrice)) {
          setNotice('Bước 1/2 · Xác nhận approve MockUSDC trong ví.');
          await write(deployment.tokenAddress, erc20Abi, 'approve', [deployment.contractAddress, BigInt(options.pledgePrice)]);
          approvalCompleted = true;
          setNotice('Approve đã thành công. Bước 2/2 · Xác nhận pledge trong ví.');
        } else {
          setNotice('Allowance đã đủ. Bước 2/2 · Xác nhận pledge trong ví.');
        }
      }
      submitted = await write(deployment.contractAddress, abi, functionName, args, true);
      persist(action, 'indexing', submitted);
      setNotice(`Receipt thành công ${submitted}; chờ indexer xác nhận canonical…`);
      const result = await editionsApi.sync(submitted, context.campaignId, action);
      if (result.state !== 'ON_CHAIN_CONFIRMED') throw new Error('Indexer chưa xác nhận giao dịch.');
      persist(action, 'canonical', submitted);
      if (context.userId && context.campaignId) clearEditionsTransaction(context.userId, context.campaignId, action);
      updateTransaction(context.userId && context.campaignId ? loadLatestEditionsTransaction(context.userId, context.campaignId) : null);
      setNotice(`Giao dịch đã được xác nhận và đồng bộ · ${submitted}`); onConfirmed();
    } catch (err) {
      const message = getErrorMessage(err);
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
