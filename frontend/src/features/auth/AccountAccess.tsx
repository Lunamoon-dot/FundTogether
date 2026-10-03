import { useState } from 'react'
import type { FormEvent } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useSignMessage } from 'wagmi'
import {
  getLinkNonce,
  getNonce,
  linkWallet,
  login,
  logout,
  register,
  verifySiwe,
} from '../../lib/api/auth'
import type { AccountSession } from '../../lib/api/auth'
import { createSiweMessage } from '../../lib/web3/siwe'
import { getErrorMessage } from '../../lib/api/error'

interface AccountAccessProps {
  session: AccountSession | null
  onSession: (session: AccountSession | null) => void
  compact?: boolean
}

export function AccountAccess({
  session,
  onSession,
  compact = false,
}: AccountAccessProps) {
  const { address, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      const account = await (mode === 'register'
        ? register(email, password)
        : login(email, password))
      setPassword('')
      onSession(account)
    })
  }

  function verifyExternalWallet() {
    void run(async () => {
      if (!address || !chainId) throw new Error('Kết nối ví trước.')
      const challenge = await (session ? getLinkNonce() : getNonce())
      if (chainId !== challenge.chainId)
        throw new Error(`Chuyển ví sang mạng có chain ID ${challenge.chainId}.`)
      const message = createSiweMessage({
        ...challenge,
        address,
        statement: session
          ? `Link this wallet to FundTogether account ${session.userId}.`
          : undefined,
      })
      const signature = await signMessageAsync({ message })
      onSession(
        await (session
          ? linkWallet(message, signature)
          : verifySiwe(message, signature)),
      )
    })
  }

  if (session) {
    return (
      <section
        className={compact ? 'account-menu' : 'wallet-card'}
        aria-label="Tài khoản"
      >
        <div className="account-identity">
          <span className="account-avatar">U</span>
          <div>
            <strong>{session.email ?? 'Tài khoản ví'}</strong>
            <p>
              <span className="status-dot" /> Đã đăng nhập
            </p>
          </div>
        </div>
        {!compact && (
          <>
            <h2>Ví đã liên kết với tài khoản</h2>
            <p className="wallet-note">
              Bạn có thể tạo bản nháp trước. Khi giao dịch trên blockchain, chọn
              một ví đã liên kết.
            </p>
            {session.wallets.length ? (
              <ul>
                {session.wallets.map((wallet) => (
                  <li key={`${wallet.chainId}:${wallet.address}`}>
                    <code>{wallet.address}</code> · mạng {wallet.chainId}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Tài khoản này chưa có ví liên kết.</p>
            )}
            <h3>Ví đang kết nối trên trình duyệt</h3>
            <div className="signin-row">
              <ConnectButton showBalance={false} />
              <button
                className="button button--secondary"
                disabled={!address || busy}
                onClick={verifyExternalWallet}
              >
                {busy ? 'Đang xác thực…' : 'Liên kết ví ngoài'}
              </button>
            </div>
            <p className="wallet-note">
              Địa chỉ ở nút kết nối là ví bạn đang chọn trên trình duyệt,
              chưa xác nhận liên kết với tài khoản. Để liên kết,
              chọn “Liên kết ví ngoài” và ký thông điệp; không tốn gas.
            </p>
          </>
        )}
        {compact && <a href="#/account">Quản lý tài khoản và ví</a>}
        <button
          className="button button--quiet"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              await logout()
              onSession(null)
            })
          }}
        >
          Đăng xuất
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="wallet-card">
      <h2>{mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>
      <p className="wallet-note">
        Dùng email và mật khẩu. Bạn có thể thêm ví sau khi đăng nhập.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            autoComplete={
              mode === 'register' ? 'new-password' : 'current-password'
            }
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>
        {mode === 'register' && (
          <p className="wallet-note">Mật khẩu tối thiểu 12 ký tự.</p>
        )}
        <button className="button button--primary" disabled={busy}>
          {busy
            ? 'Đang xử lý…'
            : mode === 'register'
              ? 'Tạo tài khoản'
              : 'Đăng nhập'}
        </button>
      </form>
      <button
        className="button button--quiet"
        disabled={busy}
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login')
          setError('')
          setPassword('')
        }}
      >
        {mode === 'login'
          ? 'Chưa có tài khoản? Đăng ký'
          : 'Đã có tài khoản? Đăng nhập'}
      </button>
      <details>
        <summary>Đăng nhập bằng ví đã liên kết</summary>
        <p className="wallet-note">
          Dành cho ví đã gắn với một tài khoản, bao gồm tài khoản ví từ bản phát
          triển trước.
        </p>
        <div className="signin-row">
          <ConnectButton showBalance={false} />
          <button
            className="button button--secondary"
            disabled={!address || busy}
            onClick={verifyExternalWallet}
          >
            Ký để đăng nhập
          </button>
        </div>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
