import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSignMessage } from 'wagmi'
import { getNonce, logout, verifySiwe } from '../../lib/api/auth'
import type { WalletSession } from '../../lib/api/auth'
import { createSiweMessage } from '../../lib/web3/siwe'
import { getErrorMessage } from '../../lib/api/error'

interface WalletSignInProps {
  session: WalletSession | null
  onSession: (session: WalletSession | null) => void
}

export function WalletSignIn({ session, onSession }: WalletSignInProps) {
  const { address, chainId, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn() {
    setBusy(true)
    setError('')
    try {
      if (!address || !chainId) throw new Error('Connect a wallet first.')
      if (chainId !== 31337) {
        throw new Error(
          'Switch your wallet to the local Foundry network (31337).',
        )
      }

      const nonce = await getNonce()
      const message = createSiweMessage({
        address,
        chainId,
        nonce,
        domain: window.location.host,
        uri: window.location.origin,
      })
      const signature = await signMessageAsync({ message })
      const verifiedSession = await verifySiwe(message, signature)
      onSession(verifiedSession)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logout()
      onSession(null)
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const connectedToDifferentWallet =
    Boolean(session && address) &&
    session?.address.toLowerCase() !== address?.toLowerCase()

  if (session) {
    return (
      <section className="account-menu" aria-label="Signed-in account">
        <div className="account-identity">
          <span className="account-avatar">W</span>
          <div>
            <strong title={session.address}>
              {session.address.slice(0, 6)}…{session.address.slice(-4)}
            </strong>
            <p>
              <span className="status-dot" /> Signed in
            </p>
          </div>
        </div>
        <button
          className="button button--quiet"
          disabled={busy}
          onClick={signOut}
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
        {connectedToDifferentWallet && (
          <p className="notice notice--warning">
            Wallet changed. Sign out and sign in again to use the selected
            wallet.
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
      </section>
    )
  }

  return (
    <section className="wallet-card">
      <div className="wallet-card__topline">
        <div>
          <span className="eyebrow">GET STARTED</span>
          <h2>Continue with wallet</h2>
        </div>
        <ConnectButton showBalance={false} />
      </div>

      <div className="signin-row">
        <p>Verify wallet ownership to open your workspace.</p>
        <button
          className="button button--primary"
          disabled={!isConnected || busy}
          onClick={signIn}
        >
          {busy
            ? 'Waiting for wallet…'
            : address
              ? `Continue as ${address.slice(0, 6)}…${address.slice(-4)}`
              : 'Continue with wallet'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="wallet-note">
        You'll sign a message to verify wallet ownership. No transaction or gas
        fee.
      </p>
    </section>
  )
}
