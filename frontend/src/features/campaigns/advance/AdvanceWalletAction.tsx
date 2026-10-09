import { useEffect, useRef, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConfig, usePublicClient, useWalletClient } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { encodeFunctionData, erc20Abi, publicActions } from 'viem'
import type { Abi, Hash, PublicClient } from 'viem'
import generatedAbi from '../../../../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json'
import { advanceHealth, advancePrepareAction } from '../../../lib/api/generated/advance'
import type { AdvanceActionInput } from '../../../lib/api/generated/advance'
import { getSession } from '../../../lib/api/auth'
import { getErrorMessage } from '../../../lib/api/error'
import deployment from '../../../lib/web3/deployment-context'
import { advanceCall, advanceExpectedEvent, advanceTrackingKey, assertAdvanceContext, isAdvanceIndexed, verifyAdvanceWallet, verifyTrackedAdvanceReceipt } from '../../../lib/web3/advance-action'
import type { AdvanceActionDisplay, AdvanceTrackedCall } from '../../../lib/web3/advance-action'
import { assertWalletConnection } from '../../../lib/web3/wallet-identity'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../../../lib/web3/wallet-confirmation'
import { useAccountSession } from '../../auth/AccountSessionProvider'

const abi = generatedAbi as Abi
interface Tracked extends AdvanceTrackedCall { hash: Hash; label: string; kind: 'approval' | 'action'; status: 'submitted' | 'confirmed' | 'indexed' | 'failed'; cancelled?: boolean }
interface Props { metadataId: string; input: Omit<AdvanceActionInput, 'actorWallet'>; display: AdvanceActionDisplay;
  label: string; requiredWallet?: string; disabledReason?: string; onRefresh: () => void }

export function AdvanceWalletAction(props: Props) {
  const account = useAccount(), { session } = useAccountSession()
  // Remount the tracker on wallet/account/network changes, before rendering its permissions.
  return <AdvanceWalletActionSession key={`${session?.userId}:${account.address}:${account.chainId}:${account.connector?.uid}:${props.metadataId}:${props.input.action}:${props.input.stage ?? props.input.expectedCurrentStage}:${props.input.evidenceRef?.version ?? props.input.review?.evidenceRef?.version ?? props.input.packageId ?? '0'}`}
    {...props} />
}

function AdvanceWalletActionSession({ metadataId, input, display, label, requiredWallet, disabledReason, onRefresh }: Props) {
  const account = useAccount(), config = useConfig(), { session } = useAccountSession()
  const client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const request = { ...input, actorWallet: account.address ?? '' }
  const key = advanceTrackingKey(session?.userId ?? '', request, metadataId, deployment)
  const [tracked, setTracked] = useState<Tracked | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Tracked | null
      return saved && /^0x[0-9a-fA-F]{64}$/.test(saved.hash) && saved.from.toLowerCase() === account.address?.toLowerCase()
        && [deployment.contractAddress.toLowerCase(), deployment.tokenAddress.toLowerCase()].includes(saved.to.toLowerCase()) ? saved : null
    } catch { return null }
  })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('')
  const running = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const blocked = !session ? 'Đăng nhập tài khoản trước khi ký.' : !account.address ? 'Kết nối ví đã liên kết với tài khoản.'
    : account.chainId !== deployment.chainId ? `Chọn mạng B ${deployment.chainId} trong ví.`
      : !session.wallets.some(w => w.chainId === deployment.chainId && w.address.toLowerCase() === account.address!.toLowerCase()) ? 'Ví này chưa được liên kết SIWE với tài khoản trên mạng B.'
        : requiredWallet && requiredWallet.toLowerCase() !== account.address.toLowerCase() ? `Thao tác cần ví ${requiredWallet}.` : disabledReason
  function remember(value: Tracked) {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new Event('advance-transaction'))
    if (alive.current) setTracked(value)
  }
  async function reconcile(saved: Tracked) {
    if (!client) throw new Error('RPC B chưa sẵn sàng.')
    if (alive.current) setProgress(saved.kind === 'approval' ? 'Chờ xác nhận allowance token…' : 'Đã gửi. Chờ receipt và xác nhận…')
    const message = await reconcileAdvanceTransaction(client, saved, remember)
    if (alive.current) setProgress(message)
    if (alive.current) onRefresh()
  }
  async function execute() {
    const recovering = tracked && ['submitted', 'confirmed'].includes(tracked.status) && !(tracked.kind === 'approval' && tracked.status === 'confirmed')
    if (running.current || (blocked && !recovering) || !client || !wallet || !session || !account.address) return
    running.current = true; setBusy(true); setError('')
    const expected = { address: account.address, chainId: deployment.chainId, connectorUid: account.connector?.uid, userId: session.userId }
    const check = () => {
      if (!alive.current) throw new Error('Tài khoản hoặc màn hình đã thay đổi.')
      const current = getAccount(config)
      assertWalletConnection(expected, { address: current.address, chainId: current.chainId, connectorUid: current.connector?.uid, userId: session.userId })
    }
    try {
      if (tracked && ['submitted', 'confirmed'].includes(tracked.status) && !(tracked.kind === 'approval' && tracked.status === 'confirmed')) {
        await reconcile(tracked); return
      }
      assertWalletRequestAvailable(expected.connectorUid ?? expected.address)
      check(); setProgress('Kiểm tra tài khoản, quyền hiện tại và deployment qua RPC của ví…')
      const fresh = await getSession(); check()
      if (fresh.userId !== session.userId || !fresh.wallets.some(w => w.chainId === deployment.chainId && w.address.toLowerCase() === expected.address.toLowerCase()))
        throw new Error('Tài khoản hoặc liên kết ví đã đổi. Tải lại trang trước khi ký.')
      await verifyAdvanceWallet(wallet, deployment); check()
      const prepared = await advancePrepareAction(metadataId, request); check()
      const call = advanceCall(request, prepared, display, deployment)
      const block = await client.getBlock({ blockNumber: BigInt(prepared.checkpoint.blockNumber) }); check()
      if (block.hash !== prepared.checkpoint.blockHash || block.timestamp.toString() !== prepared.checkpoint.chainTimestamp)
        throw new Error('Checkpoint chuẩn bị giao dịch không còn canonical.')
      const approval = prepared.approval
      const target = approval ? deployment.tokenAddress : deployment.contractAddress
      const transactionAbi = approval ? erc20Abi : abi
      const selected = approval ? { functionName: 'approve', args: [deployment.contractAddress, BigInt(approval.amount)] } : call
      const data = encodeFunctionData({ abi: transactionAbi, ...selected })
      await client.call({ account: expected.address, to: target, data, value: 0n }); check()
      await wallet.extend(publicActions).call({ account: expected.address, to: target, data, value: 0n }); check()
      const description: Omit<Tracked, 'hash'> = { to: target, from: expected.address, data, label,
        kind: approval ? 'approval' : 'action', status: 'submitted', event: approval
          ? { name: 'Approval', args: { owner: expected.address, spender: deployment.contractAddress, value: approval.amount } }
          : advanceExpectedEvent(request, prepared, display) }
      setProgress(approval ? 'Xác nhận allowance đúng số tiền trong ví. Bước này chưa chuyển tiền.' : 'Chờ bạn xác nhận giao dịch trong ví…')
      const hash = await requestWalletConfirmation({ connectorUid: expected.connectorUid ?? expected.address,
        request: () => { check(); return wallet.sendTransaction({ account: expected.address, chain: wallet.chain, to: target, data, value: 0n }) },
        onResult: value => remember({ ...description, hash: value }) })
      if (alive.current) await reconcile({ ...description, hash })
    } catch (cause) { if (alive.current) { setError(getErrorMessage(cause)); onRefresh() } }
    finally { running.current = false; if (alive.current) setBusy(false) }
  }
  const done = tracked?.kind === 'action' && tracked.status === 'indexed'
  const recovering = tracked && ['submitted', 'confirmed'].includes(tracked.status) && !(tracked.kind === 'approval' && tracked.status === 'confirmed')
  const repeatable = ['DONATE', 'RETURN_FUNDS', 'CLAIM_REFUND', 'ADD_CASE_MATERIAL'].includes(input.action)
  return <div className="campaign-wallet-action">
    <ConnectButton showBalance={false} />
    {requiredWallet && <p className="advance-hash">Ví ký: {requiredWallet}</p>}
    {blocked && <p>{blocked}</p>}
    {progress && <p role="status">{progress}</p>}
    {done ? <><p className="toast toast--success" role="status">Đã xác nhận và đồng bộ thao tác này.</p>
      {repeatable && <button className="button button--secondary" onClick={() => {
        localStorage.setItem(`${key}:history:${tracked.hash}`, JSON.stringify(tracked)); localStorage.removeItem(key)
        setTracked(null); setProgress(''); onRefresh()
      }}>Chuẩn bị lượt tiếp theo</button>}</>
      : <button className="button button--primary" disabled={busy || (Boolean(blocked) && !recovering) || !wallet} onClick={() => void execute()}>
        {busy ? 'Đang kiểm tra…' : tracked && ['submitted', 'confirmed'].includes(tracked.status) && !(tracked.kind === 'approval' && tracked.status === 'confirmed') ? 'Kiểm tra giao dịch đã gửi' : label}
      </button>}
    {tracked && <p className="advance-hash">{tracked.kind === 'approval' ? 'Allowance' : 'Giao dịch'}: {tracked.hash} · {tracked.status}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}

async function reconcileAdvanceTransaction(client: PublicClient, saved: Tracked, remember: (value: Tracked) => void) {
  const health = await advanceHealth()
  assertAdvanceContext(health.context, deployment)
  if (health.rpc !== 'ready') throw new Error('RPC hoặc deployment B chưa được xác minh. Giữ hash để đối chiếu lại.')
  let active = saved
  const receipt = await client.waitForTransactionReceipt({ hash: saved.hash, confirmations: deployment.confirmations, timeout: 90_000,
    onReplaced: r => { active = { ...active, hash: r.transaction.hash, cancelled: active.cancelled || r.reason === 'cancelled' }; remember(active) } })
  const tx = await client.getTransaction({ hash: receipt.transactionHash })
  try {
    if (active.cancelled) throw new Error('Giao dịch đã được hủy trong ví.')
    verifyTrackedAdvanceReceipt(receipt, tx, active, saved.kind === 'approval' ? erc20Abi : abi)
  } catch (cause) { remember({ ...active, status: 'failed' }); throw cause }
  const receiptBlock = await client.getBlock({ blockNumber: receipt.blockNumber })
  if (receiptBlock.hash !== receipt.blockHash) throw new Error('Receipt không còn ở chain chính. Tiếp tục đối chiếu, chưa gửi lại.')
  if (saved.kind === 'approval') {
    const allowance = await client.readContract({ address: deployment.tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [active.from, deployment.contractAddress] })
    if (allowance < BigInt(String(active.event.args.value))) throw new Error('Allowance hiện tại chưa đủ. Đối chiếu lại ví trước bước tiền.')
    remember({ ...active, status: 'confirmed' })
    return 'Allowance đã xác nhận. Chưa chuyển tiền; bấm thao tác một lần nữa để kiểm tra điều kiện mới và ký giao dịch tiếp theo.'
  }
  remember({ ...active, status: 'confirmed' })
  if (!('lastIndexedBlock' in health.indexer)) throw new Error('Indexer đang lỗi; receipt đã được giữ để kiểm tra lại.')
  const indexedBlock = health.indexer.lastIndexedBlock == null ? null : await client.getBlock({ blockNumber: BigInt(health.indexer.lastIndexedBlock) })
  if (isAdvanceIndexed(receipt, receiptBlock.hash, health.indexer, indexedBlock?.hash ?? null)) {
    remember({ ...active, status: 'indexed' })
    return 'Giao dịch thành công, event khớp và đã đồng bộ vào indexer.'
  }
  return 'Receipt thành công và event khớp. Đang chờ indexer; bấm kiểm tra lại để cập nhật.'
}

export function AdvanceTransactionHistory({ metadataId, onRefresh }: { metadataId: string; onRefresh: () => void }) {
  const { session } = useAccountSession(), account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  useEffect(() => {
    const update = () => setRevision(v => v + 1)
    window.addEventListener('advance-transaction', update); window.addEventListener('storage', update)
    return () => { window.removeEventListener('advance-transaction', update); window.removeEventListener('storage', update) }
  }, [])
  void revision
  if (!session || !account.address || account.chainId !== deployment.chainId) return null
  const prefix = ['ft-advance', deployment.deploymentId, deployment.genesisHash, deployment.deploymentBlockHash,
    deployment.contractAddress.toLowerCase(), deployment.chainId, session.userId, account.address.toLowerCase(), metadataId, ''].join(':')
  const entries: { key: string; value: Tracked }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (!key.startsWith(prefix)) continue
    try {
      const value = JSON.parse(localStorage.getItem(key)!) as Tracked
      if (/^0x[0-9a-fA-F]{64}$/.test(value.hash) && value.from.toLowerCase() === account.address.toLowerCase()
        && [deployment.contractAddress.toLowerCase(), deployment.tokenAddress.toLowerCase()].includes(value.to.toLowerCase())) entries.push({ key, value })
    } catch { /* Ignore damaged local tracking records; never sign from them. */ }
  }
  if (!entries.length) return null
  async function refresh(entry: typeof entries[number]) {
    if (!client || busy) return
    setBusy(entry.key); setMessage('Đang kiểm tra receipt/canonical event/indexer…')
    try {
      setMessage(await reconcileAdvanceTransaction(client, entry.value, value => {
        localStorage.setItem(entry.key, JSON.stringify(value)); setRevision(v => v + 1)
      })); onRefresh()
    } catch (cause) { setMessage(getErrorMessage(cause)) } finally { setBusy('') }
  }
  return <section className="panel"><h2>Giao dịch của ví đang chọn</h2>
    <p>Hash được lưu trên trình duyệt này; có thể kiểm tra lại sau khi đổi trạng thái hoặc tải lại trang.</p>
    {entries.map(entry => <div key={entry.key}><p>{entry.value.label} · {entry.value.kind === 'approval' ? 'allowance' : 'thao tác'} · {entry.value.status}</p>
      <p className="advance-hash">{entry.value.hash}</p><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => void refresh(entry)}>Đối chiếu lại</button></div>)}
    {message && <p role="status">{message}</p>}
  </section>
}
