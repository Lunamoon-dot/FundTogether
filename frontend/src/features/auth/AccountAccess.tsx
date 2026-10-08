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
} from '../../lib/api/auth'
import type { AccountSession } from '../../lib/api/auth'
import { createSiweMessage } from '../../lib/web3/siwe'
import { requestWalletProof } from '../../lib/web3/wallet-proof'
import { assertWalletRequestAvailable } from '../../lib/web3/wallet-confirmation'
import deployment from '../../../../backend/src/blockchain/generated/deployment.local.json'
import { getErrorMessage } from '../../lib/api/error'
import { LinkedWalletCard } from './LinkedWalletCard'

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
  const alreadyLinked = Boolean(address && session?.wallets.some(wallet => wallet.address.toLowerCase() === address.toLowerCase() && wallet.chainId === chainId))
  const wrongResolverWallet = Boolean(session?.roles.includes('RESOLVER') && address && address.toLowerCase() !== deployment.resolver.toLowerCase())

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setWalletStatus('')
    setWalletStage('')
    try {
      await action()
    } catch (cause) {
      if (mounted.current) setError(cause instanceof BaseError && cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
        ? 'Bạn đã từ chối ký trong ví. Chưa liên kết ví; có thể thử lại khi sẵn sàng.'
        : cause instanceof BaseError && cause.walk(item => item instanceof ResourceUnavailableRpcError) instanceof ResourceUnavailableRpcError
          ? 'Ví chưa sẵn sàng hoặc đang có yêu cầu khác. Mở extension, xử lý yêu cầu đang chờ rồi thử lại.'
          : getErrorMessage(cause) === 'Wallet is already linked to another account'
            ? 'Ví này đã liên kết với tài khoản khác. Ngắt ví đang kết nối và chọn ví thuộc tài khoản hiện tại để tiếp tục.'
            : getErrorMessage(cause))
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
    void run(async () => {
      if (!address || !chainId || !connector) throw new Error('Kết nối ví trước.')
      assertWalletRequestAvailable(connector.uid)
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
    proofController.current?.abort(new Error('Đã dừng chờ xác thực. Yêu cầu trong extension chưa bị hủy; từ chối yêu cầu cũ trong ví trước khi ký lại. Chữ ký trả muộn không được dùng để liên kết.'))
  }
  const linkingLabel = walletStage === 'prepare' ? 'Kiểm tra kết nối…'
    : walletStage === 'challenge' ? 'Lấy thông điệp…'
      : walletStage === 'signature' ? `Chờ chữ ký · ${signatureSeconds}s`
        : walletStage === 'verify' ? 'Xác minh chữ ký…' : 'Đang xử lý…'
  const walletRecovery = <>
    {walletStage && walletStage !== 'verify' && <button type="button" className="button button--quiet" onClick={stopWaiting}>Dừng chờ</button>}
    {address && connector && !busy && <button type="button" className="button button--quiet" onClick={() => disconnect({ connector })}>Ngắt kết nối / đổi ví</button>}
    {error && session && !busy && <button type="button" className="button button--quiet" onClick={() => void run(async () => {
      const fresh = await getSession()
      if (fresh.userId !== currentSession.current?.userId) throw new Error('Tài khoản đã thay đổi. Tải lại trang để đọc phiên hiện tại.')
      onSession(fresh)
    })}>Kiểm tra lại liên kết</button>}
  </>

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
            <h2>Quyền tài khoản</h2>
            <ul className="account-role-list" aria-label="Quyền tài khoản">
              {(session.roles?.length ? session.roles : ['USER']).map(role => (
                <li className="account-role" key={role}>{role}</li>
              ))}
            </ul>
            <p className="wallet-note">
              USER là quyền mặc định; donor không cần role riêng. ADMIN không tự có quyền duyệt campaign.
              RESOLVER cần được platform cấp để xét hồ sơ. Duyệt trên blockchain cần liên kết đúng ví resolver và ký giao dịch.
            </p>
            {session.roles.includes('RESOLVER') && <div className="wallet-note">
              <p>Ví resolver của deployment hiện tại: <code>{deployment.resolver}</code> · mạng {deployment.chainId}.</p>
              <p>Đây là ví triển khai contract local được cấu hình làm resolver. Chọn tài khoản có đúng địa chỉ này trong extension để ký duyệt trên blockchain.</p>
            </div>}
            <h2>Ví đã liên kết với tài khoản</h2>
            <p className="wallet-note">
              Bạn có thể tạo bản nháp trước. Khi giao dịch trên blockchain, chọn
              một ví đã liên kết.
            </p>
            {session.wallets.length ? (
              <ul className="linked-wallets">
                {session.wallets.map((wallet) => (
                  <LinkedWalletCard key={`${session.userId}:${wallet.chainId}:${wallet.address}`}
                    {...wallet} userId={session.userId} />
                ))}
              </ul>
            ) : (
              <p>Tài khoản này chưa có ví liên kết.</p>
            )}
            <h3>Ví đang kết nối trên trình duyệt</h3>
            {address && <p className="public-wallet-address"><code>{address}</code> · mạng {chainId}</p>}
            {address && connector && <p className="wallet-note">Ví kết nối qua {connector.name}.</p>}
            {wrongResolverWallet && <div className="review-notice review-notice--blocked" role="alert">
              <p>Trang đang dùng ví <code>{address}</code>, khác ví resolver <code>{deployment.resolver}</code>.</p>
              <p>Ngắt ví này, bấm Connect Wallet và chọn MetaMask với đúng địa chỉ resolver. Ví đang mở trong extension chưa tự động trở thành ví kết nối với trang.</p>
              <button type="button" className="button button--secondary" disabled={busy || !connector}
                onClick={() => { if (connector) disconnect({ connector }) }}>Ngắt ví đang kết nối</button>
            </div>}
            <div className="signin-row">
              <ConnectButton showBalance={false} />
              <button
                className="button button--secondary"
                disabled={!address || busy || alreadyLinked}
                onClick={verifyExternalWallet}
              >
                {busy ? linkingLabel : alreadyLinked ? 'Ví đã liên kết' : 'Liên kết ví ngoài'}
              </button>
            </div>
            {walletStatus && <p className="wallet-note" role="status">{walletStatus}</p>}
            {walletRecovery}
            {connector?.id === 'injected' && <p className="wallet-note">Browser Wallet dùng ví mặc định của trình duyệt. Nếu bạn đang mở MetaMask nhưng không thấy yêu cầu ký, ngắt kết nối rồi chọn MetaMask theo tên trong Connect Wallet.</p>}
            <p className="wallet-note">
              {alreadyLinked ? 'Ví đang kết nối đã được xác thực và liên kết với tài khoản này.' : <>Địa chỉ ở nút kết nối là ví bạn đang chọn trên trình duyệt,
              chưa xác nhận liên kết với tài khoản. Để liên kết,
              chọn “Liên kết ví ngoài” và ký thông điệp; không tốn gas.</>}
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
            {busy ? linkingLabel : 'Ký để đăng nhập'}
          </button>
        </div>
        {walletStatus && <p className="wallet-note" role="status">{walletStatus}</p>}
        {walletRecovery}
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
