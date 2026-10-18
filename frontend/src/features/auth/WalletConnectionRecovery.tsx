import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { isWalletConnectStalled, WALLET_CONNECT_WATCHDOG_MS } from './wallet-connect-recovery'

export function WalletConnectionRecovery() {
  const { isConnecting } = useAccount()
  const { disconnect } = useDisconnect()
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const started = Date.now()
    const timer = setTimeout(() => {
      if (isWalletConnectStalled(isConnecting, started)) setStalled(true)
    }, WALLET_CONNECT_WATCHDOG_MS)
    return () => {
      clearTimeout(timer)
      setStalled(false)
    }
  }, [isConnecting])

  if (!stalled || !isConnecting) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 10001,
        width: 'min(360px, calc(100vw - 32px))',
        padding: '16px',
        border: '1px solid #9e2a2b',
        borderRadius: 8,
        background: '#fffaf8',
        color: '#181716',
        boxShadow: '0 12px 32px rgba(24, 23, 22, 0.2)',
      }}
    >
      <strong>MetaMask chưa phản hồi yêu cầu kết nối</strong>
      <p style={{ margin: '8px 0 12px', fontSize: 13, lineHeight: 1.45 }}>
        Hãy kiểm tra extension và từ chối yêu cầu localhost đang treo trước khi thử lại.
      </p>
      <button
        type="button"
        className="button button--secondary button--sm"
        onClick={() => {
          disconnect()
          setStalled(false)
        }}
      >
        Dừng kết nối
      </button>
    </div>
  )
}
