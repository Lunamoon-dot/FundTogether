import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, keccak256, toHex } from 'viem';
import type { Abi } from 'viem';
import campaignArtifact from '../../../../../backend/src/blockchain/generated/vnext/CampaignEscrowVNext.json';
import registryArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryRegistry.json';
import reviewArtifact from '../../../../../backend/src/blockchain/generated/vnext/JuryReview.json';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi, listTransactionWallets } from '../api/campaigns';
import type { VNextTransactionStage } from './vnext-actions';
import { vnextContractAddress, type VNextContractKind } from './vnext-contract-descriptor';

const campaignAbi = campaignArtifact.abi as Abi;
const registryAbi = registryArtifact.abi as Abi;
const reviewAbi = reviewArtifact.abi as Abi;
const tokenAbi = erc20Abi as Abi;

export type { VNextContractKind } from './vnext-contract-descriptor';

export interface VNextTransactionState {
  stage: VNextTransactionStage;
  txHash?: `0x${string}`;
  eventCount?: number;
  error?: string;
}

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export function useVNextTransaction(onIndexed: () => void = () => {}) {
  const account = useAccount();
  const client = usePublicClient({ chainId: 31339 });
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector });
  const [state, setState] = useState<VNextTransactionState>({ stage: 'idle' });
  const [busy, setBusy] = useState(false);

  async function send(
    kind: VNextContractKind,
    functionName: string,
    args: readonly unknown[],
  ) {
    setBusy(true);
    setState({ stage: 'wallet_requested' });
    try {
      if (!account.address) throw new Error('Ví chưa được kết nối.');
      if (!wallet || !client) throw new Error('Không đọc được wallet hoặc RPC VNext.');
      if (account.chainId !== 31339 || await wallet.getChainId() !== 31339) {
        throw new Error('FundTogether VNext yêu cầu chain 31339.');
      }

      const [deployment, links] = await Promise.all([
        campaignApi.vnextDeployment(),
        listTransactionWallets(),
      ]);
      if (deployment.chainId !== 31339 || deployment.protocolKind !== 'FUNDTOGETHER_VNEXT') {
        throw new Error('Deployment VNext không đúng policy hoặc chain.');
      }
      if (deployment.abiVersion !== 'fundtogether-vnext-local-v2-remediation'
        || !deployment.abiHash || !deployment.genesisHash || !deployment.campaignCodeHash
        || !deployment.registryCodeHash || !deployment.reviewCodeHash || !deployment.tokenCodeHash
        || !deployment.campaignEscrow || !deployment.juryRegistry || !deployment.juryReview || !deployment.tokenAddress) {
        throw new Error('Manifest VNext thiếu identity bắt buộc.');
      }
      const [genesis, campaignCode, registryCode, reviewCode, tokenCode] = await Promise.all([
        client.getBlock({ blockNumber: 0n }),
        client.getCode({ address: deployment.campaignEscrow! }),
        client.getCode({ address: deployment.juryRegistry! }),
        client.getCode({ address: deployment.juryReview! }),
        client.getCode({ address: deployment.tokenAddress! }),
      ]);
      if (genesis.hash?.toLowerCase() !== deployment.genesisHash.toLowerCase()
        || !campaignCode || keccak256(campaignCode).toLowerCase() !== deployment.campaignCodeHash.toLowerCase()
        || !registryCode || keccak256(registryCode).toLowerCase() !== deployment.registryCodeHash.toLowerCase()
        || !reviewCode || keccak256(reviewCode).toLowerCase() !== deployment.reviewCodeHash.toLowerCase()
        || !tokenCode || keccak256(tokenCode).toLowerCase() !== deployment.tokenCodeHash.toLowerCase()
        || keccak256(toHex(JSON.stringify(campaignArtifact.abi, null, 2) + '\n')).toLowerCase() !== deployment.abiHash.toLowerCase()) {
        throw new Error('Deployment VNext không khớp genesis, bytecode hoặc ABI.');
      }
      if (!links.some(link => link.address.toLowerCase() === account.address!.toLowerCase() && String(link.chainId) === '31339')) {
        throw new Error('Ví hiện tại chưa được liên kết bằng SIWE cho chain 31339.');
      }

      const address = vnextContractAddress(kind, deployment);
      const abi = {
        campaign: campaignAbi,
        review: reviewAbi,
        registry: registryAbi,
        token: tokenAbi,
      }[kind];
      const { request } = await client.simulateContract({
        address,
        abi,
        functionName,
        args,
        account: account.address,
      });
      const txHash = await wallet.writeContract(request);
      setState({ stage: 'submitted', txHash });
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error(`Transaction đã revert: ${txHash}`);
      setState({ stage: 'receipt_confirmed', txHash });
      if (kind === 'token') return txHash;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await campaignApi.vnextTransaction(txHash);
        if (status.state === 'ON_CHAIN_CONFIRMED') {
          setState({ stage: 'indexed', txHash, eventCount: status.eventCount });
          onIndexed();
          return txHash;
        }
        await sleep(500);
      }
      return txHash;
    } catch (cause) {
      const error = getErrorMessage(cause);
      setState(previous => ({ ...previous, stage: 'failed', error }));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setState({ stage: 'idle' });
  }

  return { ...state, send, reset, busy, address: account.address };
}
