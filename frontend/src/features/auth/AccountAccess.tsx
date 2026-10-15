import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConfig, useDisconnect } from 'wagmi'
import { getAccount, getConnectorClient } from 'wagmi/actions'
import { BaseError, ResourceUnavailableRpcError, UserRejectedRequestError } from 'viem'
import { signMessage } from 'viem/actions'
import {
  getLinkNonce,
  getNonce,
  getSession,
  linkWallet,
  login,
  logout,
  register,
  verifySiwe,
  unlinkWallet,
} from '../../lib/api/auth'
import type { AccountSession } from '../../lib/api/auth'
import { createSiweMessage } from '../../lib/web3/siwe'
import { requestWalletProof } from '../../lib/web3/wallet-proof'
import { assertWalletRequestAvailable, releaseWalletRequest } from '../../lib/web3/wallet-confirmation'
import { getResolverWalletBlockReason } from '../../lib/web3/wallet-link-guard'
import deployment from '../../lib/web3/deployment-context'
import { getErrorMessage } from '../../lib/api/error'
import { LinkedWalletCard } from './LinkedWalletCard'
import { classifyAccountError, type ClassifiedAccountError } from './account-error'
import './AccountProfile.css'

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
  const { address, chainId, connector } = useAccount()
  const config = useConfig()
  const { disconnect } = useDisconnect()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState<ClassifiedAccountError | null>(null)
  const [walletStatus, setWalletStatus] = useState('')
  const [walletStage, setWalletStage] = useState<'prepare' | 'challenge' | 'signature' | 'verify' | ''>('')
  const [signatureSeconds, setSignatureSeconds] = useState(90)
  const proofController = useRef<AbortController | null>(null)
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false
    proofController.current?.abort(new Error('Đã rời màn hình xác thực. Chữ ký trả muộn không được dùng để liên kết.'))
  } }, [])
  useEffect(() => {
    if (walletStage !== 'signature') return
    const end = Date.now() + 90_000
    const timer = setInterval(() => setSignatureSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 1000)
    return () => clearInterval(timer)
  }, [walletStage])
  const currentSession = useRef(session)
  useEffect(() => { currentSession.current = session }, [session])
  useEffect(() => {
    proofController.current?.abort(new Error('Kết nối ví hoặc tài khoản đã thay đổi. Lần xác thực cũ đã dừng; bạn có thể liên kết bằng kết nối hiện tại.'))
  }, [address, chainId, connector?.uid, session?.userId])
  const alreadyLinked = Boolean(address && session?.wallets.some(wallet => wallet.address.toLowerCase() === address.toLowerCase() && wallet.chainId === chainId))
  const resolverWalletBlockReason = getResolverWalletBlockReason({
    roles: session?.roles ?? [], connectedAddress: address, resolverAddress: deployment.resolver,
  })
  const wrongResolverWallet = Boolean(resolverWalletBlockReason)

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setAccountError(null)
    setWalletStatus('')
    setWalletStage('')
    try {
      await action()
    } catch (cause) {
      if (mounted.current) {
        const classified = classifyAccountError(cause);
        const customMessage = cause instanceof BaseError && cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
          ? 'Bạn đã từ chối ký trong ví. Chưa liên kết ví; có thể thử lại khi sẵn sàng.'
          : cause instanceof BaseError && cause.walk(item => item instanceof ResourceUnavailableRpcError) instanceof ResourceUnavailableRpcError
            ? 'Ví chưa sẵn sàng hoặc đang có yêu cầu khác. Mở extension, xử lý yêu cầu đang chờ rồi thử lại.'
            : getErrorMessage(cause) === 'Wallet is already linked to another account'
              ? 'Ví này đã liên kết với tài khoản khác. Ngắt ví đang kết nối và chọn ví thuộc tài khoản hiện tại để tiếp tục.'
              : classified.message;
        setAccountError({ ...classified, message: customMessage });
        setError(customMessage);
      }
    } finally {
      running.current = false
      proofController.current = null
      if (mounted.current) {
        setBusy(false)
        setWalletStatus('')
        setWalletStage('')
      }
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
    if (resolverWalletBlockReason) {
      setError(resolverWalletBlockReason)
      return
    }
    void run(async () => {
      if (!address || !chainId || !connector) throw new Error('Kết nối ví trước.')
      assertWalletRequestAvailable(connector.uid)
      const controller = new AbortController()
      proofController.current = controller
      let signer: Awaited<ReturnType<typeof getConnectorClient>> | undefined
      try {
        const { message, signature } = await requestWalletProof({
          expected: { address, chainId, connectorUid: connector.uid, userId: session?.userId ?? null },
          current: () => { const active = getAccount(config)
            return { ...active, address: mounted.current ? active.address : undefined,
              connectorUid: active.connector?.uid, userId: currentSession.current?.userId ?? null } },
          prepare: async () => { signer = await getConnectorClient(config, { account: address, connector, chainId }) },
          challenge: () => session ? getLinkNonce() : getNonce(),
          message: challenge => createSiweMessage({
            ...challenge, address,
            statement: session ? `Link this wallet to FundTogether account ${session.userId}.` : undefined,
          }),
          sign: (text, account) => {
            if (!signer) throw new Error('Chưa đọc được kết nối ví. Chưa gửi yêu cầu ký.')
            return signMessage(signer, { message: text, account })
          },
          signal: controller.signal,
          onStage: stage => {
            setWalletStage(stage)
            setSignatureSeconds(90)
            setWalletStatus(stage === 'prepare'
              ? `Đang kiểm tra kết nối ${connector.name} (tối đa 8 giây). Chưa gửi yêu cầu ký.`
              : stage === 'challenge' ? 'Đang lấy thông điệp xác thực từ backend…'
                : `Đang chờ chữ ký trong ${connector.name}. Mở đúng ví này để xem yêu cầu ký; có thể nằm trong cửa sổ riêng.`)
          },
        })
        setWalletStage('verify')
        setWalletStatus('Đã nhận chữ ký. Đang xác minh với backend…')
        const linked = await (session
            ? linkWallet(message, signature)
            : verifySiwe(message, signature))
        if (!mounted.current) return
        if (currentSession.current?.userId !== session?.userId) throw new Error('Tài khoản đã thay đổi. Tải lại phiên đăng nhập trước khi tiếp tục.')
        onSession(linked)
      } finally {
        if (connector?.uid) releaseWalletRequest(connector.uid)
        if (address) releaseWalletRequest(address)
      }
    })
  }


  function stopWaiting() {
    if (connector?.uid) releaseWalletRequest(connector.uid)
    if (address) releaseWalletRequest(address)
    proofController.current?.abort(new Error('Đã dừng lần xác thực này; chữ ký trả muộn sẽ bị bỏ qua. Nếu extension còn hiển thị yêu cầu cũ, từ chối yêu cầu đó trước khi thử lại.'))
  }
  function disconnectWallet() {
    if (connector?.uid) releaseWalletRequest(connector.uid)
    if (address) releaseWalletRequest(address)
    stopWaiting()
    setError('')
    if (connector) disconnect({ connector })
  }
  const linkingLabel = walletStage === 'prepare' ? 'Kiểm tra kết nối…'
    : walletStage === 'challenge' ? 'Lấy thông điệp…'
      : walletStage === 'signature' ? `Chờ chữ ký · ${signatureSeconds}s`
        : walletStage === 'verify' ? 'Xác minh chữ ký…' : 'Đang xử lý…'
  const walletRecovery = <>
    {busy && <button type="button" className="button button--quiet" onClick={stopWaiting}>Dừng chờ</button>}
    {address && connector && !busy && <button type="button" className="button button--quiet" onClick={disconnectWallet}>Ngắt kết nối / đổi ví</button>}
    {error && session && !busy && <button type="button" className="button button--quiet" onClick={() => void run(async () => {
      const fresh = await getSession()
      if (fresh.userId !== currentSession.current?.userId) throw new Error('Tài khoản đã thay đổi. Tải lại trang để đọc phiên hiện tại.')
      onSession(fresh)
    })}>Kiểm tra lại liên kết</button>}
    <button
      type="button"
      className="button button--quiet"
      onClick={() => {
        if (connector?.uid) releaseWalletRequest(connector.uid)
        if (address) releaseWalletRequest(address)
        if (typeof window !== 'undefined') window.location.reload()
      }}
    >
      🔄 Làm mới kết nối (F5)
    </button>
  </>

  if (session) {
    return (
      <div className={compact ? 'account-menu' : 'account-profile-container'} aria-label="Tài khoản">
        {/* 1. Profile Header Card */}
        <section className="profile-card" aria-label="Thông tin tài khoản">
          <div className="profile-header">
            <div className="profile-header__user">
              <div className="profile-avatar">
                {session.email ? session.email[0].toUpperCase() : 'U'}
              </div>
              <div className="profile-header__details">
                <h2>{session.email ?? 'Tài khoản ví'}</h2>
                <div className="profile-badges">
                  <span className="status-badge">
                    <span className="status-badge__dot" /> Đã đăng nhập
                  </span>
                  {(session.roles?.length ? session.roles : ['USER']).map(role => (
                    <span className={`role-badge role-badge--${role.toLowerCase()}`} key={role}>
                      {role === 'USER' ? '👤 Thành viên'
                        : role === 'RESOLVER' ? '⚖️ Resolver'
                        : role === 'ADMIN' ? '🛡️ Admin' : role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="button button--quiet button--sm"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await logout()
                  onSession(null)
                })
              }}
            >
              🚪 Đăng xuất
            </button>
          </div>

          {!compact && (
            <div className="profile-quick-nav">
              <a href="#/reward/studio" className="profile-nav-tile">
                <span className="profile-nav-tile__icon">🎨</span>
                <div>
                  <strong>Creator Studio</strong>
                  <p>Soạn thảo & xuất bản ấn phẩm</p>
                </div>
              </a>
              <a href="#/reward/my-rewards" className="profile-nav-tile">
                <span className="profile-nav-tile__icon">📚</span>
                <div>
                  <strong>Tủ sách của tôi</strong>
                  <p>Tải file PDF các ấn phẩm đã ủng hộ</p>
                </div>
              </a>
              <a href="#/reward/editions" className="profile-nav-tile">
                <span className="profile-nav-tile__icon">✨</span>
                <div>
                  <strong>Khám phá Editions</strong>
                  <p>Bảng tin chiến dịch gây quỹ cộng đồng</p>
                </div>
              </a>
            </div>
          )}
        </section>

        {!compact && session.roles.includes('ADMIN') && (
          <section className="resolver-portal-banner" style={{ background: '#f5f3ff', borderColor: '#ddd6fe' }} aria-label="Khu vực quản trị viên">
            <div className="resolver-portal-banner__left">
              <strong style={{ color: '#5b21b6' }}>🛡️ Cổng quản trị hệ thống (Admin Portal)</strong>
              <p style={{ color: '#4c1d95' }}>
                Duyệt hồ sơ tác giả độc lập và xác minh cam kết bản quyền sở hữu trí tuệ (Flow V1).
              </p>
            </div>
            <a href="#/admin" className="button button--secondary button--sm" style={{ borderColor: '#c4b5fd', color: '#5b21b6' }}>
              Mở Admin Console →
            </a>
          </section>
        )}

        {!compact && session.roles.includes('RESOLVER') && (
          <section className="resolver-portal-banner" aria-label="Khu vực kiểm duyệt viên">
            <div className="resolver-portal-banner__left">
              <strong>⚖️ Cổng kiểm duyệt viên (Resolver Portal)</strong>
              <p>
                Ví resolver hợp đồng: <code>{deployment.resolver}</code> (Chain ID {deployment.chainId}). Chọn ví này để ký duyệt chiến dịch hoặc quyết định tranh chấp.
              </p>
            </div>
            <a href="#/reward/resolver" className="button button--secondary button--sm">
              Mở Resolver Console →
            </a>
          </section>
        )}

        {!compact && (
          <>
            {/* 2. Linked Wallets Section */}
            <section className="profile-card" aria-label="Ví đã liên kết">
              <div className="profile-section-title">
                <h3>💳 Ví đã liên kết với tài khoản</h3>
                <span className="profile-section-subtitle">
                  Dùng để giao dịch an toàn trên blockchain và nhận quyền lợi
                </span>
              </div>

              {session.wallets.length ? (
                <ul className="linked-wallet-list linked-wallets">
                  {session.wallets.map((wallet) => (
                    <LinkedWalletCard
                      key={`${session.userId}:${wallet.chainId}:${wallet.address}`}
                      {...wallet}
                      userId={session.userId}
                      unlinkDisabled={busy}
                      onUnlink={confirmation => run(async () => {
                        const updated = await unlinkWallet(wallet.address, wallet.chainId, confirmation)
                        if (!mounted.current || currentSession.current?.userId !== session.userId) return
                        if (getAccount(config).address?.toLowerCase() === wallet.address.toLowerCase()
                          && getAccount(config).chainId === wallet.chainId) disconnectWallet()
                        onSession(updated)
                      })}
                    />
                  ))}
                </ul>
              ) : (
                <p className="wallet-note">Tài khoản này chưa có ví liên kết. Hãy kết nối ví bên dưới và bấm "Liên kết ví".</p>
              )}
            </section>

            {/* 3. Browser Wallet Connection Section */}
            <section className="profile-card browser-wallet-card" aria-label="Kết nối ví trình duyệt">
              <div className="browser-wallet-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 650, color: '#1e3325' }}>
                    🦊 Kết nối ví trên trình duyệt
                  </h3>
                  <span className="profile-section-subtitle">
                    {connector ? `Đang kết nối qua ${connector.name}` : 'Chưa kết nối extension ví'}
                  </span>
                </div>

                {address && (
                  <span className={`sync-status-pill ${alreadyLinked ? 'sync-status-pill--synced' : 'sync-status-pill--unlinked'}`}>
                    {alreadyLinked ? '✅ Đã đồng bộ với tài khoản' : '⚠️ Ví chưa liên kết'}
                  </span>
                )}
              </div>

              {address ? (
                <div className="browser-wallet-details">
                  <span>Địa chỉ:</span>
                  <code>{address}</code>
                  <span>· Mạng {chainId}</span>
                </div>
              ) : (
                <p className="wallet-note" style={{ margin: '0 0 14px' }}>
                  Bấm "Connect Wallet" để kết nối ví MetaMask hoặc extension ví trên trình duyệt của bạn.
                </p>
              )}

              {wrongResolverWallet && (
                <div className="review-notice review-notice--blocked" role="alert" style={{ marginBottom: '14px' }}>
                  <p>{resolverWalletBlockReason}</p>
                  <button type="button" className="button button--secondary button--sm" disabled={busy || !connector} onClick={disconnectWallet}>
                    Ngắt ví đang kết nối
                  </button>
                </div>
              )}

              <div className="browser-wallet-actions signin-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                <ConnectButton showBalance={false} />
                <button
                  type="button"
                  className={`button ${alreadyLinked ? 'button--quiet' : 'button--primary'}`}
                  disabled={!address || busy || alreadyLinked || wrongResolverWallet}
                  onClick={verifyExternalWallet}
                >
                  {busy ? linkingLabel : alreadyLinked ? '✓ Ví đã liên kết'
                    : wrongResolverWallet ? 'Chọn đúng ví Resolver' : '🔗 Liên kết ví (Ký SIWE)'}
                </button>
              </div>

              {walletStage === 'signature' && (
                <div className="signature-waiting-box" role="status">
                  <span className="signature-waiting-box__icon">✍️</span>
                  <div className="signature-waiting-box__content">
                    <strong>Đang chờ xác nhận chữ ký từ extension {connector?.name ?? 'ví'}... ({signatureSeconds}s)</strong>
                    <p>
                      Nếu trình duyệt không tự động bật cửa sổ popup, hãy <strong>bấm vào biểu tượng extension {connector?.name ?? 'ví'} ở thanh tiện ích góc trên bên phải trình duyệt</strong> để bấm <strong>Ký (Sign)</strong> thông điệp SIWE.
                    </p>
                  </div>
                </div>
              )}

              {walletStatus && walletStage !== 'signature' && (
                <p className="wallet-note" role="status" style={{ marginTop: '10px' }}>{walletStatus}</p>
              )}

              <div className="profile-recovery-bar">
                {walletRecovery}
              </div>
            </section>
          </>
        )}

        {compact && <a href="#/account">Quản lý tài khoản và ví</a>}

        {(error || accountError) && (
          <div className="account-error-banner" role="alert" style={{ marginTop: '14px' }}>
            <span className={`account-error-layer-badge account-error-layer-badge--${accountError?.layer ?? 'session'}`}>
              {accountError?.layerLabel ?? 'Phiên đăng nhập / API (Session)'}
            </span>
            <p className="form-error">{error || accountError?.message}</p>
          </div>
        )}
      </div>
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
            {busy ? linkingLabel : 'Ký để đăng nhập'}
          </button>
        </div>
        {walletStatus && <p className="wallet-note" role="status">{walletStatus}</p>}
        {walletRecovery}
      </details>
      {(error || accountError) && (
        <div className="account-error-banner" role="alert" style={{ marginTop: '14px' }}>
          <span className={`account-error-layer-badge account-error-layer-badge--${accountError?.layer ?? 'session'}`}>
            {accountError?.layerLabel ?? 'Phiên đăng nhập / API (Session)'}
          </span>
          <p className="form-error">{error || accountError?.message}</p>
        </div>
      )}
    </section>
  )
}
