import { useState } from 'react'
import { useBalance, useConfig, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import type { Address } from 'viem'
import deployment from '../../lib/web3/deployment-context'

export function LinkedWalletCard({ address, chainId, userId, onUnlink, unlinkDisabled = false }: {
  address: string
  chainId: number
  userId: string
  onUnlink?: (password: string) => Promise<void>
  unlinkDisabled?: boolean
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const [password, setPassword] = useState('')
  const config = useConfig()
  const chain = config.chains.find(item => item.id === chainId)
  const balance = useBalance({
    address: address as Address,
    chainId,
    scopeKey: userId,
    query: { enabled: Boolean(chain), retry: false, staleTime: 0, refetchInterval: 30_000 },
  })
  const supportsToken = chain?.id === deployment.chainId
  const tokenBalance = useReadContract({
    address: deployment.tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as Address],
    chainId: deployment.chainId,
    scopeKey: `${userId}:${deployment.deploymentId}`,
    query: { enabled: supportsToken, retry: false, staleTime: 0, refetchInterval: 30_000 },
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
          <p>Phí giao dịch: <strong>{formatUnits(balance.data.value, balance.data.decimals)} {balance.data.symbol}</strong></p>
        ) : null}
        {chain && <button className="button button--secondary" disabled={balance.isFetching || tokenBalance.isFetching}
          onClick={() => void Promise.all([balance.refetch(), ...(supportsToken ? [tokenBalance.refetch()] : [])])}>
          {balance.isFetching || tokenBalance.isFetching ? 'Đang tải…' : 'Tải lại số dư'}
        </button>}
      </div>
      {supportsToken && <div aria-live="polite">
        {tokenBalance.isError ? <p role="alert">Không tải được số dư MockUSDC. Thử tải lại số dư.</p>
          : tokenBalance.isPending ? <p role="status">Đang tải số dư MockUSDC…</p>
            : tokenBalance.data !== undefined ? <p>Số dư quyên góp: <strong>{formatUnits(tokenBalance.data, deployment.tokenDecimals)} MockUSDC</strong></p> : null}
      </div>}
      {(chain?.id === 31337 || chain?.id === 31338) && <p className="wallet-note">ETH dùng để trả phí giao dịch; MockUSDC dùng để quyên góp trên mạng thử nghiệm.</p>}
      {copyState === 'copied' && <span className="public-sr-only" role="status">Đã sao chép địa chỉ ví.</span>}
      {copyState === 'error' && <p role="alert">Không sao chép được. Bạn có thể chọn địa chỉ và sao chép thủ công.</p>}
      {onUnlink && (confirmUnlink ? <form className="form-grid" onSubmit={event => {
        event.preventDefault()
        if (unlinkDisabled || !password) return
        const confirmation = password
        setPassword('')
        void onUnlink(confirmation)
      }}>
        <p>Gỡ ví <code>{address}</code> khỏi tài khoản trên mạng {chainId}? Số dư và lịch sử blockchain vẫn còn. Các phiên đăng nhập khác sẽ bị đăng xuất.</p>
        <label>Mật khẩu tài khoản để xác nhận
          <input type="password" autoComplete="current-password" required maxLength={128}
            value={password} onChange={event => setPassword(event.target.value)} disabled={unlinkDisabled} />
        </label>
        <div className="signin-row">
          <button type="submit" className="button button--secondary" disabled={unlinkDisabled || !password}>Xác nhận gỡ liên kết</button>
          <button type="button" className="button button--quiet" disabled={unlinkDisabled}
            onClick={() => { setConfirmUnlink(false); setPassword('') }}>Hủy</button>
        </div>
      </form> : <button type="button" className="button button--quiet" disabled={unlinkDisabled}
        onClick={() => setConfirmUnlink(true)}>Gỡ liên kết</button>)}
    </li>
  )
}
