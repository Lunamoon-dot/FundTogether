import { useEffect, useRef, useState } from 'react'
import { ArchivalConnectButton } from './ArchivalConnectButton'
import { useAccount, useConfig, useDisconnect } from 'wagmi'
import { getAccount, getConnectorClient } from 'wagmi/actions'
import { BaseError, ResourceUnavailableRpcError, UserRejectedRequestError } from 'viem'
import { signMessage } from 'viem/actions'
import {
  checkWalletAvailability,
  getLinkNonce,
  getNonce,
  getSession,
  linkWallet,
  logout,
  verifySiwe,
  unlinkWallet,
} from '../../lib/api/auth'
import type { AccountSession } from '../../lib/api/auth'
import { createSiweMessage } from '../../lib/web3/siwe'
import { requestWalletProof } from '../../lib/web3/wallet-proof'
import { assertWalletRequestAvailable } from '../../lib/web3/wallet-confirmation'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState<ClassifiedAccountError | null>(null)
  const [walletStatus, setWalletStatus] = useState('')
  const [walletStage, setWalletStage] = useState<'prepare' | 'challenge' | 'signature' | 'verify' | ''>('')
  const [signatureSeconds, setSignatureSeconds] = useState(90)
  const [walletAvailability, setWalletAvailability] = useState<'idle' | 'checking' | 'available' | 'current' | 'other' | 'unavailable'>('idle')
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
  useEffect(() => {
    let active = true
    if (alreadyLinked) {
      setWalletAvailability('current')
      return () => { active = false }
    }
    if (!session || !address || !chainId) {
      setWalletAvailability('idle')
      return () => { active = false }
    }
    setWalletAvailability('checking')
    void checkWalletAvailability(address, chainId)
      .then(result => {
        if (!active) return
        setWalletAvailability(result.alreadyLinked ? 'current' : result.canLink ? 'available' : 'other')
      })
      .catch(() => {
        if (active) setWalletAvailability('unavailable')
      })
    return () => { active = false }
  }, [alreadyLinked, address, chainId, session?.userId])
  const resolverWalletBlockReason = getResolverWalletBlockReason({
    roles: session?.roles ?? [], connectedAddress: address,
    resolverAddress: deployment.resolver, backupResolverAddress: deployment.backupResolver,
  })
  const wrongResolverWallet = Boolean(resolverWalletBlockReason)
  const hasPrimaryResolverWallet = Boolean(session?.wallets.some(
    wallet => wallet.address.toLowerCase() === deployment.resolver.toLowerCase()
      && wallet.chainId === deployment.chainId,
  ))
  const hasBackupResolverWallet = Boolean(session?.wallets.some(
    wallet => wallet.address.toLowerCase() === deployment.backupResolver.toLowerCase()
      && wallet.chainId === deployment.chainId,
  ))

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
          ? 'Bạn đã từ chối ký trong ví. Chưa đăng nhập; có thể thử lại khi sẵn sàng.'
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

  function verifyExternalWallet() {
    if (resolverWalletBlockReason) {
      setError(resolverWalletBlockReason)
      return
    }
    void run(async () => {
      if (!address || !chainId || !connector) throw new Error('Kết nối ví trước.')
      assertWalletRequestAvailable(connector.uid)
      if (session) {
        const availability = await checkWalletAvailability(address, chainId)
        if (availability.alreadyLinked) {
          onSession(await getSession())
          return
        }
        if (!availability.canLink) {
          throw new Error('Ví này đã liên kết với tài khoản khác. Hãy chọn đúng ví của tài khoản hiện tại.')
        }
      }
      const controller = new AbortController()
      proofController.current = controller
      let signer: Awaited<ReturnType<typeof getConnectorClient>> | undefined
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
    })
  }


  function stopWaiting() {
    proofController.current?.abort(new Error('Đã dừng lần xác thực này; chữ ký trả muộn sẽ bị bỏ qua. Nếu extension còn hiển thị yêu cầu cũ, từ chối yêu cầu đó trước khi thử lại.'))
  }
  function disconnectWallet() {
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
                      {role === 'USER' ? 'Thành viên'
                        : role === 'RESOLVER' ? 'Resolver'
                        : role === 'ADMIN' ? 'Admin' : role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="profile-header__actions">
              <div className="profile-wallet-connect-inline">
                <ArchivalConnectButton label="Kết nối ví" size="sm" />
                {address && !alreadyLinked && (
                  <button
                    type="button"
                    className="button button--primary button--sm"
                    disabled={busy || wrongResolverWallet || walletAvailability === 'checking' || walletAvailability === 'other'}
                    onClick={verifyExternalWallet}
                    title="Liên kết ví này với tài khoản bằng chữ ký SIWE"
                  >
                    {busy ? linkingLabel : wrongResolverWallet ? 'Chọn đúng ví' : walletAvailability === 'checking' ? 'Đang kiểm tra ví…' : walletAvailability === 'other' ? 'Chọn ví khác' : 'Liên kết ví (Ký SIWE)'}
                  </button>
                )}
                {address && alreadyLinked && (
                  <span className="sync-status-pill sync-status-pill--synced" title="Ví trình duyệt hiện tại đã đồng bộ với tài khoản">
                    ✓ Đã liên kết
                  </span>
                )}
              </div>

              <button
                type="button"
                className="button button--quiet button--sm profile-header__logout"
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
            </div>
          </div>

          {wrongResolverWallet && (
            <div className="review-notice review-notice--blocked" role="alert" style={{ marginTop: '16px' }}>
              <p>{resolverWalletBlockReason}</p>
              <button type="button" className="button button--secondary button--sm" disabled={busy || !connector} onClick={disconnectWallet}>
                Ngắt ví đang kết nối
              </button>
            </div>
          )}

          {walletAvailability === 'other' && !wrongResolverWallet && (
            <div className="review-notice review-notice--blocked" role="alert" style={{ marginTop: '16px' }}>
              <p>Ví đang chọn trong extension đã liên kết với tài khoản khác. Hãy đổi sang ví thuộc tài khoản hiện tại trước khi liên kết.</p>
              <button type="button" className="button button--secondary button--sm" disabled={busy || !connector} onClick={disconnectWallet}>
                Ngắt ví đang chọn
              </button>
            </div>
          )}

          {walletStage === 'signature' && (
            <div className="signature-waiting-box" role="status" style={{ marginTop: '16px' }}>
              <div className="signature-waiting-box__content">
                <strong>Đang chờ xác nhận chữ ký từ extension {connector?.name ?? 'ví'}... ({signatureSeconds}s)</strong>
                <p>
                  Nếu trình duyệt không tự động bật cửa sổ popup, hãy <strong>bấm vào biểu tượng extension {connector?.name ?? 'ví'} ở thanh tiện ích góc trên bên phải trình duyệt</strong> để bấm <strong>Ký (Sign)</strong> thông điệp SIWE.
                </p>
                <div style={{ marginTop: '8px' }}>
                  <button type="button" className="button button--quiet button--sm" onClick={stopWaiting}>Dừng chờ</button>
                </div>
              </div>
            </div>
          )}

          {walletStatus && walletStage !== 'signature' && (
            <p className="wallet-note" role="status" style={{ marginTop: '12px' }}>{walletStatus}</p>
          )}
        </section>

        {!compact && session.roles.includes('ADMIN') && (
          <section className="resolver-portal-banner" style={{ background: '#f5f3ff', borderColor: '#ddd6fe' }} aria-label="Khu vực quản trị viên">
            <div className="resolver-portal-banner__left">
              <strong style={{ color: '#5b21b6' }}>Cổng quản trị hệ thống (Admin Portal)</strong>
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
              <strong>Cổng kiểm duyệt viên (Resolver Portal)</strong>
              {hasPrimaryResolverWallet ? (
                <p>
                  Ví Resolver chính: <code>{deployment.resolver}</code> (Chain ID {deployment.chainId}). Ví này có thể ký duyệt chiến dịch và quyết định tranh chấp.
                </p>
              ) : hasBackupResolverWallet ? (
                <p>
                  Ví Resolver dự phòng: <code>{deployment.backupResolver}</code> (Chain ID {deployment.chainId}). Ví này chỉ takeover quyền review sau 7 ngày nếu Resolver chính chưa xử lý.
                </p>
              ) : (
                <p>
                  Contract có ví Resolver chính <code>{deployment.resolver}</code> và ví dự phòng <code>{deployment.backupResolver}</code> (Chain ID {deployment.chainId}). Hãy liên kết đúng ví tương ứng với tài khoản hiện tại.
                </p>
              )}
            </div>
            <a href="#/campaigns/resolver" className="button button--secondary button--sm">
              Mở Resolver Console →
            </a>
          </section>
        )}

        {!compact && (
          <>
            {/* 2. Linked Wallets Section */}
            <section className="profile-card" aria-label="Ví đã liên kết">
              <div className="profile-section-title">
                <h3>Ví đã liên kết với tài khoản</h3>
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
                <p className="wallet-note">Tài khoản này chưa có ví liên kết. Hãy bấm nút "Kết nối ví" ở góc trên bên phải để liên kết ví.</p>
              )}
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
    <section className="wallet-card account-login" aria-labelledby="account-login-title">
      <div className="account-login__intro">
        <h2 id="account-login-title">Đăng nhập bằng ví</h2>
        <p className="wallet-note account-login__description">
          FundTogether dùng ví và chữ ký SIWE làm phương thức đăng nhập duy nhất. Ví mới sẽ tự tạo tài khoản và giữ nguyên quyền sở hữu ví.
        </p>
      </div>
      {(error || accountError) && (
        <div className="account-error-banner account-login__error" role="alert">
          <span className={`account-error-layer-badge account-error-layer-badge--${accountError?.layer ?? 'session'}`}>
            {accountError?.layerLabel ?? 'Phiên đăng nhập / API (Session)'}
          </span>
          <p className="form-error">{error || accountError?.message}</p>
        </div>
      )}
      <div className="account-login__wallet">
        <p className="wallet-note">
          Kết nối đúng ví, sau đó ký thông điệp SIWE. Không nhập hoặc gửi private key/seed phrase vào ứng dụng.
        </p>
        <div className="signin-row account-login__wallet-actions">
          <ArchivalConnectButton label="Kết nối ví" />
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
      </div>
    </section>
  )
}
