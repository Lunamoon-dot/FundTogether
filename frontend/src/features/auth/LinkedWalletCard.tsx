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
      setTimeout(() => setCopyState('idle'), 2500)
    } catch {
      setCopyState('error')
    }
  }

  return (
    <li className="linked-wallet linked-wallet-item">
      <div className="linked-wallet-item__top">
        <div className="linked-wallet-item__network">
          <span className="status-badge__dot" />
          <span>Đã liên kết · {chain?.name ?? 'Mạng chưa hỗ trợ'} · Chain ID {chainId}</span>
        </div>
        <div className="linked-wallet-item__address-group linked-wallet__address">
          <code>{address}</code>
          <button
            type="button"
            className="button button--quiet button--copy-wallet"
            onClick={() => void copyAddress()}
            title="Sao chép địa chỉ ví"
          >
            {copyState === 'copied' ? '✓ Đã sao chép' : 'Sao chép địa chỉ'}
          </button>
        </div>
      </div>

      <div className="balance-grid">
        {supportsToken && (
          <div className="balance-tile" aria-live="polite">
            <div className="balance-tile__icon">🪙</div>
            <div className="balance-tile__body">
              <span className="balance-tile__caption">Token ủng hộ Editions</span>
              {tokenBalance.isError ? (
                <p className="balance-tile__error" role="alert">Không tải được số dư MockUSDC. Thử tải lại số dư.</p>
              ) : tokenBalance.isPending ? (
                <p className="balance-tile__status" role="status">Đang tải số dư MockUSDC…</p>
              ) : tokenBalance.data !== undefined ? (
                <p className="balance-tile__amount">
                  Số dư quyên góp: <strong>{formatUnits(tokenBalance.data, deployment.tokenDecimals)} MockUSDC</strong>
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="balance-tile linked-wallet__balance" aria-live="polite">
          <div className="balance-tile__icon">⛽</div>
          <div className="balance-tile__body">
            <span className="balance-tile__caption">Phí gas giao dịch</span>
            {!chain ? (
              <p className="balance-tile__error">Ứng dụng chưa hỗ trợ đọc số dư trên mạng này.</p>
            ) : balance.isError ? (
              <p className="balance-tile__error" role="alert">Không tải được số dư. Kiểm tra kết nối mạng và thử tải lại.</p>
            ) : balance.isPending ? (
              <p className="balance-tile__status" role="status">Đang tải số dư…</p>
            ) : balance.data ? (
              <p className="balance-tile__amount">
                Phí giao dịch: <strong>{formatUnits(balance.data.value, balance.data.decimals)} {balance.data.symbol}</strong>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="linked-wallet-item__actions">
        {chain && (
          <button
            type="button"
            className="button button--secondary button--sm"
            disabled={balance.isFetching || tokenBalance.isFetching}
            onClick={() => void Promise.all([balance.refetch(), ...(supportsToken ? [tokenBalance.refetch()] : [])])}
          >
            {balance.isFetching || tokenBalance.isFetching ? 'Đang tải…' : '🔄 Tải lại số dư'}
          </button>
        )}

        {onUnlink && !confirmUnlink && (
          <button
            type="button"
            className="button button--quiet button--danger-soft button--sm"
            disabled={unlinkDisabled}
            onClick={() => setConfirmUnlink(true)}
          >
            Gỡ liên kết
          </button>
        )}
      </div>

      {(chain?.id === 31337 || chain?.id === 31338) && (
        <p className="wallet-note">ETH dùng để trả phí giao dịch; MockUSDC dùng để quyên góp trên mạng thử nghiệm.</p>
      )}
      {copyState === 'copied' && <span className="public-sr-only" role="status">Đã sao chép địa chỉ ví.</span>}
      {copyState === 'error' && <p role="alert" className="balance-tile__error">Không sao chép được. Bạn có thể chọn địa chỉ và sao chép thủ công.</p>}

      {onUnlink && confirmUnlink && (
        <form className="form-grid" style={{ marginTop: '12px', padding: '14px', background: '#fff1f2', borderRadius: '8px', border: '1px solid #fecdd3' }} onSubmit={event => {
          event.preventDefault()
          if (unlinkDisabled || !password) return
          const confirmation = password
          setPassword('')
          void onUnlink(confirmation)
        }}>
          <p style={{ margin: 0, color: '#9f1239', fontSize: '13px' }}>
            Gỡ ví <code>{address}</code> khỏi tài khoản trên mạng {chainId}? Số dư và lịch sử blockchain vẫn còn. Các phiên đăng nhập khác sẽ bị đăng xuất.
          </p>
          <label style={{ fontSize: '13px', color: '#881337', marginTop: '8px', display: 'block' }}>
            Mật khẩu tài khoản để xác nhận
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={unlinkDisabled}
              style={{ width: '100%', marginTop: '4px' }}
            />
          </label>
          <div className="signin-row" style={{ marginTop: '12px', paddingTop: '10px' }}>
            <button type="submit" className="button button--secondary" style={{ color: '#be123c', borderColor: '#fda4af' }} disabled={unlinkDisabled || !password}>
              Xác nhận gỡ liên kết
            </button>
            <button type="button" className="button button--quiet" disabled={unlinkDisabled} onClick={() => { setConfirmUnlink(false); setPassword('') }}>
              Hủy
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
