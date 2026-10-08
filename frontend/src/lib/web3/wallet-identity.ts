import { keccak256, publicActions } from 'viem'
import type { Address, WalletClient } from 'viem'
import type { SubmissionPlan } from '../api/campaign-submission'

export interface WalletConnectionIdentity { address?: Address; chainId?: number; connectorUid?: string; userId: string | null }

export function assertWalletConnection(expected: WalletConnectionIdentity, active: WalletConnectionIdentity) {
  if (!expected.address || !expected.chainId || active.address?.toLowerCase() !== expected.address.toLowerCase()
    || active.chainId !== expected.chainId || active.userId !== expected.userId
    || (expected.connectorUid !== undefined && active.connectorUid !== expected.connectorUid))
    throw new Error('Ví, mạng hoặc tài khoản đã thay đổi. Chọn đúng ví rồi thực hiện lại.')
}

export async function verifyWalletDeployment(wallet: WalletClient, plan: Pick<SubmissionPlan, 'chainId' | 'contractAddress' | 'tokenAddress' | 'genesisHash' | 'contractCodeHash' | 'tokenCodeHash' | 'deploymentBlockNumber' | 'deploymentBlockHash'>) {
  const reader = wallet.extend(publicActions)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if ((plan.deploymentBlockNumber === undefined) !== (plan.deploymentBlockHash === undefined))
      throw new Error('Cấu hình thiếu mốc deployment. Tải lại trước khi ký.')
    const [chainId, genesis, code, tokenCode, anchor] = await Promise.race([
      Promise.all([
        reader.getChainId(), reader.getBlock({ blockNumber: 0n }),
        reader.getCode({ address: plan.contractAddress }), reader.getCode({ address: plan.tokenAddress }),
        plan.deploymentBlockNumber === undefined ? Promise.resolve(null) : reader.getBlock({ blockNumber: BigInt(plan.deploymentBlockNumber) }),
      ]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Không đọc được mạng qua ví. Kiểm tra extension và RPC của mạng Foundry rồi thử lại.')), 8_000)
      }),
    ])
    if (Number(chainId) !== plan.chainId || genesis?.hash?.toLowerCase() !== plan.genesisHash.toLowerCase()
      || !code || !tokenCode || keccak256(code) !== plan.contractCodeHash || keccak256(tokenCode) !== plan.tokenCodeHash
      || (plan.deploymentBlockHash !== undefined && anchor?.hash !== plan.deploymentBlockHash))
      throw new Error('Mạng trong ví khác deployment của ứng dụng. Kiểm tra RPC Foundry trong ví; trùng chain ID chưa đủ để ký.')
  } finally { clearTimeout(timer) }
}
