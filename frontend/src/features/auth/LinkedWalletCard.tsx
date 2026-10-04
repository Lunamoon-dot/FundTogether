import { useState } from 'react'
import { useBalance, useConfig } from 'wagmi'
import { formatUnits } from 'viem'
import type { Address } from 'viem'

export function LinkedWalletCard({ address, chainId, userId }: {
  address: string
  chainId: number
  userId: string
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const config = useConfig()
  const chain = config.chains.find(item => item.id === chainId)
  const balance = useBalance({
    address: address as Address,
    chainId,
    scopeKey: userId,
    query: { enabled: Boolean(chain), retry: false, staleTime: 0, refetchInterval: 30_000 },
  })

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <li className="linked-wallet">
      <div className="linked-wallet__address">
        <code>{address}</code>
        <button className="button button--quiet" onClick={() => void copyAddress()}>
          {copyState === 'copied' ? 'Đã sao chép' : 'Sao chép địa chỉ'}
        </button>
      </div>
      <p className="muted">Đã liên kết · {chain?.name ?? 'Mạng chưa hỗ trợ'} · Chain ID {chainId}</p>
      <div className="linked-wallet__balance" aria-live="polite">
        {!chain ? (
          <p>Ứng dụng chưa hỗ trợ đọc số dư trên mạng này.</p>
        ) : balance.isError ? (
          <p role="alert">Không tải được số dư. Kiểm tra kết nối mạng và thử tải lại.</p>
        ) : balance.isPending ? (
          <p role="status">Đang tải số dư…</p>
        ) : balance.data ? (
          <p>Số dư: <strong>{formatUnits(balance.data.value, balance.data.decimals)} {balance.data.symbol}</strong></p>
        ) : null}
        {chain && <button className="button button--secondary" disabled={balance.isFetching}
          onClick={() => void balance.refetch()}>
          {balance.isFetching ? 'Đang tải…' : 'Tải lại số dư'}
        </button>}
      </div>
      {chain?.id === 31337 && <p className="wallet-note">ETH trên mạng local dùng để trả phí giao dịch thử nghiệm.</p>}
      {copyState === 'copied' && <span className="public-sr-only" role="status">Đã sao chép địa chỉ ví.</span>}
      {copyState === 'error' && <p role="alert">Không sao chép được. Bạn có thể chọn địa chỉ và sao chép thủ công.</p>}
    </li>
  )
}
