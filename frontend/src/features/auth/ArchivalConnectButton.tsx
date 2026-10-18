import { ConnectButton } from '@rainbow-me/rainbowkit'

export function ArchivalConnectButton({ label = 'Kết nối ví', size = 'md' }: { label?: string; size?: 'sm' | 'md' }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && account && chain

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    className={`button button--secondary ${size === 'sm' ? 'button--sm' : ''}`}
                    onClick={openConnectModal}
                  >
                    {label}
                  </button>
                )
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    className="button button--secondary"
                    style={{ color: '#9e2a2b', borderColor: 'rgba(158, 42, 43, 0.3)' }}
                    onClick={openChainModal}
                  >
                    Đổi mạng hỗ trợ
                  </button>
                )
              }

              return (
                <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="button button--quiet button--sm"
                    onClick={openChainModal}
                  >
                    {chain.name}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary button--sm"
                    onClick={openAccountModal}
                  >
                    {account.displayName}
                  </button>
                </div>
              )
            })()}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
