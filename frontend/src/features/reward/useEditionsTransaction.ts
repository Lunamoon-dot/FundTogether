import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, keccak256, toHex } from 'viem';
import type { Abi, Address } from 'viem';
import editionsAbiJson from '../../../../backend/src/blockchain/generated/editions/fund-together-editions.abi.json';
import { editionsApi } from '../../lib/api/editions';
import { listEditionsWallets } from '../../lib/api/reward';
import { getErrorMessage } from '../../lib/api/error';

const abi = editionsAbiJson as Abi;
export function useEditionsTransaction(onConfirmed: () => void) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function send(functionName: string, args: readonly unknown[], options: { expectedWallet?: string; pledgePrice?: string } = {}) {
    setBusy(true); setError(''); setNotice('Đang kiểm tra mạng và ví đã liên kết…');
    let submitted: `0x${string}` | undefined;
    try {
      if (!account.address || !wallet || !client || account.chainId !== 31339) throw new Error('Kết nối ví đã liên kết trên mạng local 31339.');
      const [deployment, links] = await Promise.all([editionsApi.deployment(), listEditionsWallets()]);
      const actor = account.address;
      if (!links.some(link => link.address.toLowerCase() === actor.toLowerCase())) throw new Error('Ví đang kết nối chưa được liên kết bằng chữ ký với tài khoản này.');
      if (options.expectedWallet && options.expectedWallet.toLowerCase() !== actor.toLowerCase()) throw new Error('Hãy chọn đúng ví có thẩm quyền cho thao tác này.');
      const [chainId, genesis, code] = await Promise.all([client.getChainId(), client.getBlock({ blockNumber: 0n }), client.getCode({ address: deployment.contractAddress })]);
      if (deployment.protocolKind !== 'EDITIONS' || deployment.chainId !== 31339 || chainId !== 31339 || deployment.abiVersion !== 'editions-local-v1' ||
        deployment.abiHash !== keccak256(toHex(JSON.stringify(editionsAbiJson, null, 2) + '\n')) || genesis.hash !== deployment.genesisHash || !code || keccak256(code) !== deployment.contractCodeHash)
        throw new Error('Deployment Editions không khớp mạng, ABI hoặc bytecode đã kiểm tra.');

      async function write(address: Address, contractAbi: Abi, method: string, values: readonly unknown[]) {
        if (!wallet || !client) throw new Error('Ví đã ngắt kết nối.');
        const addresses = await wallet.getAddresses();
        if (addresses[0]?.toLowerCase() !== actor.toLowerCase() || await wallet.getChainId() !== 31339) throw new Error('Ví hoặc mạng đã thay đổi; thực hiện lại thao tác.');
        const { request } = await client.simulateContract({ address, abi: contractAbi, functionName: method, args: values, account: actor });
        setNotice('Chờ xác nhận trong ví…');
        const txHash = await wallet.writeContract(request);
        setNotice(`Đã gửi ${txHash}; chờ receipt thành công…`);
        const receipt = await client.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') throw new Error(`Giao dịch revert: ${txHash}`);
        return txHash;
      }
      if (options.pledgePrice) {
        const allowance = await client.readContract({ address: deployment.tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [actor, deployment.contractAddress] });
        if (allowance < BigInt(options.pledgePrice)) await write(deployment.tokenAddress, erc20Abi, 'approve', [deployment.contractAddress, BigInt(options.pledgePrice)]);
      }
      submitted = await write(deployment.contractAddress, abi, functionName, args);
      setNotice(`Receipt thành công ${submitted}; chờ indexer xác nhận canonical…`);
      const result = await editionsApi.sync(submitted);
      if (result.state !== 'ON_CHAIN_CONFIRMED') throw new Error('Indexer chưa xác nhận giao dịch.');
      setNotice(`ON_CHAIN_CONFIRMED · ${submitted}`); onConfirmed();
    } catch (err) { setError(`${getErrorMessage(err)}${submitted ? ` Receipt: ${submitted}. Tải lại trạng thái để kiểm tra indexer trước khi gửi lại.` : ''}`); setNotice(''); }
    finally { setBusy(false); }
  }
  return { send, busy, notice, error, address: account.address };
}
