import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConfig, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { BaseError, UserRejectedRequestError, formatUnits, keccak256 } from 'viem'
import type { Abi, Address, Hash } from 'viem'
import generatedAbi from '../../../../backend/src/blockchain/generated/fund-together.abi.json'
import deployment from '../../lib/web3/deployment-context'
import { getMyRefunds } from '../../lib/api/public-campaigns'
import type { PublicCampaign } from '../../lib/api/public-campaigns'
import { getSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'
import { assertRefundAction, readRefundSnapshot, verifyRefundReceipt } from '../../lib/web3/refund-action'
import type { RefundAction } from '../../lib/web3/refund-action'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../../lib/web3/wallet-confirmation'
import { assertWalletConnection, verifyWalletDeployment } from '../../lib/web3/wallet-identity'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { refundEligibilityReason, walletActionReason } from '../campaigns/campaign-journey'
import { TransactionSteps } from '../campaigns/TransactionSteps'

const abi = generatedAbi as Abi
const identity = { ...deployment, contractAddress: deployment.contractAddress as Address, tokenAddress: deployment.tokenAddress as Address,
  genesisHash: deployment.genesisHash as Hash, contractCodeHash: deployment.contractCodeHash as Hash, tokenCodeHash: deployment.tokenCodeHash as Hash }
type Pending = { action: RefundAction; hash: Hash; amountUnits: string; milestoneIndex?: string; receiptBlock?: string; cancelled?: boolean }
function load(key: string): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Pending | null
    return value && ['claimRefund', 'cancelCampaign', 'finalizeFundingFailure', 'finalizeMilestoneTimeout'].includes(value.action)
      && /^0x[\da-f]{64}$/i.test(value.hash) && /^\d+$/.test(value.amountUnits)
      && (value.action !== 'finalizeMilestoneTimeout' || /^\d+$/.test(value.milestoneIndex ?? ''))
      && (value.receiptBlock === undefined || /^\d+$/.test(value.receiptBlock)) ? value : null
  } catch { return null }
}

export function RefundPanel({ campaign, onRefresh }: { campaign: PublicCampaign; onRefresh: () => void }) {
  const account = useAccount()
  const config = useConfig()
  const { session, sessionLoading } = useAccountSession()
  const client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const { switchChainAsync } = useSwitchChain()
  const userId = useRef(session?.userId ?? null)
  useEffect(() => { userId.current = session?.userId ?? null }, [session?.userId])
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const running = useRef(false)
  const key = `ft-refund:${deployment.genesisHash}:${campaign.contractAddress}:${campaign.id}:${session?.userId}:${account.address?.toLowerCase()}${'deploymentBlockHash' in deployment ? `:${String(deployment.deploymentBlockHash)}` : ''}`
  const [stored, setStored] = useState<{ key: string; value: Pending | null }>(() => ({ key, value: load(key) }))
  const pending = stored.key === key ? stored.value : load(key)
  const [busy, setBusy] = useState(false)
  const [waitingWalletKey, setWaitingWalletKey] = useState<string | null>(null)
  const [requestedAction, setRequestedAction] = useState<{ key: string; action: RefundAction } | null>(null)
  const [message, setMessage] = useState({ key, progress: '', error: '' })
  const progress = message.key === key ? message.progress : ''
  const error = message.key === key ? message.error : ''
  function setProgress(progress: string) { setMessage(current => ({ key, progress, error: current.key === key ? current.error : '' })) }
  function setError(error: string) { setMessage(current => ({ key, error, progress: current.key === key ? current.progress : '' })) }
  const [cancelConfirmationKey, setCancelConfirmationKey] = useState<string | null>(null)
  const confirmCancel = cancelConfirmationKey === key
  const linked = session?.wallets.some(link => link.address.toLowerCase() === account.address?.toLowerCase() && link.chainId === deployment.chainId)
  const query = useQuery({ queryKey: ['campaign-refund', campaign.id, session?.userId],
    queryFn: ({ signal }) => getMyRefunds(campaign.id, signal), enabled: Boolean(session), retry: false, refetchInterval: 5_000 })
  const refund = query.isError ? undefined : query.data?.items[0]
  const donor = refund?.wallets.find(item => item.donor === account.address?.toLowerCase())
  const gas = useQuery({ queryKey: ['refund-gas', session?.userId, account.address, campaign.chainId],
    enabled: Boolean(linked && client), retry: false, refetchInterval: 10_000,
    queryFn: () => client!.getBalance({ address: account.address! }) })
  const walletReason = walletActionReason({ sessionLoading, signedIn: Boolean(session), address: account.address, linked: Boolean(linked),
    chainId: account.chainId, requiredChainId: deployment.chainId, walletReady: Boolean(wallet && client) })
  function actionReason(action: RefundAction) {
    if (busy) return 'Đang xử lý yêu cầu hiện tại; chờ kết quả trước khi thao tác tiếp.'
    if (pending?.receiptBlock) return 'Receipt đã thành công; chờ indexer ghi nhận. Không ký lại.'
    if (walletReason) return walletReason
    if (pending) return ''
    if (query.isError || !refund) return 'Chưa đối chiếu được quyền nhận và trạng thái chain. Tải lại dữ liệu trước khi ký.'
    if (query.data?.sync.status !== 'ready') return 'Indexer đang đồng bộ. Chờ checkpoint mới trước khi ký.'
    if (gas.isError || gas.data === undefined) return 'Chưa đọc được ETH phí gas. Tải lại số dư trước khi ký.'
    if (gas.data === 0n) return 'Ví chưa có ETH Foundry để trả phí gas. Refund không cần MockUSDC hay approve token.'
    return refundEligibilityReason(action, refund, account.address, confirmCancel)
  }
  const indexed = Boolean(pending?.receiptBlock && refund && BigInt(refund.checkedBlock) >= BigInt(pending.receiptBlock) &&
    (pending.action === 'claimRefund' ? donor?.claimed && donor.transactionHash === pending.hash && donor.entitlementUnits === pending.amountUnits
      : refund.snapshotted && refund.snapshotTransactionHash === pending.hash && refund.campaign.state === (pending.action === 'cancelCampaign' ? 'CANCELLED' : pending.action === 'finalizeMilestoneTimeout' ? 'FAILED' : 'FUNDING_FAILED')))
  useEffect(() => { if (indexed) localStorage.removeItem(key) }, [indexed, key])

  function save(value: Pending) { localStorage.setItem(key, JSON.stringify(value)); if (mounted.current) setStored({ key, value }) }
  async function execute(action: RefundAction) {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setProgress('Đang đối chiếu ví và quyền nhận trên blockchain…')
    setRequestedAction({ key, action })
    try {
      if (!session || !account.address || !account.connector || !wallet || !client) throw new Error('Đăng nhập, liên kết và kết nối ví để tiếp tục.')
      const address = account.address
      const connectorUid = account.connector.uid
      const expected = { address, chainId: account.chainId, connectorUid, userId: session.userId }
      const check = () => {
        if (!mounted.current) throw new Error('Đã rời màn hình. Mở lại để kiểm tra giao dịch.')
        const active = getAccount(config)
        assertWalletConnection(expected, { ...active, connectorUid: active.connector?.uid, userId: userId.current })
      }
      check(); assertWalletRequestAvailable(connectorUid)
      if (account.chainId !== deployment.chainId) {
        await requestWalletConfirmation({ connectorUid, request: () => switchChainAsync({ chainId: deployment.chainId }) })
        throw new Error('Đã chuyển mạng. Bấm lại để đối chiếu ví.')
      }
      const authorize = async () => {
        const fresh = await getSession(); check()
        if (fresh.userId !== session.userId || !fresh.wallets.some(link => link.address.toLowerCase() === address.toLowerCase() && link.chainId === deployment.chainId))
          throw new Error('Ví chưa liên kết với tài khoản hiện tại. Mở Tài khoản để liên kết bằng chữ ký.')
      }
      await authorize()
      if (campaign.chainId !== deployment.chainId || campaign.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase()
        || campaign.tokenAddress.toLowerCase() !== deployment.tokenAddress.toLowerCase()) throw new Error('Campaign thuộc deployment khác.')
      const [chainId, genesis, code, tokenCode] = await Promise.all([client.getChainId(), client.getBlock({ blockNumber: 0n }),
        client.getCode({ address: identity.contractAddress }), client.getCode({ address: identity.tokenAddress })])
      if (chainId !== deployment.chainId || genesis.hash !== deployment.genesisHash || !code || !tokenCode
        || keccak256(code) !== deployment.contractCodeHash || keccak256(tokenCode) !== deployment.tokenCodeHash)
        throw new Error('RPC hoặc deployment đã thay đổi. Chưa thể tiếp tục.')
      const snapshot = () => readRefundSnapshot(campaign, address, { getBlock: options => client.getBlock(options),
        read: (name, args, blockNumber) => client.readContract({ address: campaign.contractAddress, abi, functionName: name, args, blockNumber }) })
      let value = load(key)
      if (!value) {
        const checked = await snapshot()
        assertRefundAction(action, checked, address, campaign.organizer)
        if (action === 'cancelCampaign' && !confirmCancel) throw new Error('Xác nhận hủy campaign trước khi ký.')
        if (await client.getBalance({ address }) === 0n) throw new Error('Ví cần ETH trên mạng Foundry để trả phí gas; không cần cấp quyền token để nhận hoàn tiền.')
        const simulation = await client.simulateContract({ address: campaign.contractAddress, abi, functionName: action,
          args: action === 'finalizeMilestoneTimeout' ? [BigInt(campaign.onchainCampaignId), checked.milestoneIndex] : [BigInt(campaign.onchainCampaignId)], account: address, blockNumber: checked.block.number })
        await verifyWalletDeployment(wallet, identity); await authorize(); check()
        if ((await client.getBlock({ blockNumber: checked.block.number })).hash !== checked.block.hash) throw new Error('Block thay đổi trước khi ký. Đối chiếu lại.')
        value = { action, hash: '0x' as Hash, amountUnits: checked.amount.toString(), milestoneIndex: checked.milestoneIndex.toString() }
        const current = value
        setProgress('Đang chờ xác nhận trong ví. Ký hoặc từ chối yêu cầu; giới hạn chờ 90 giây.')
        setWaitingWalletKey(key)
        const hash = await requestWalletConfirmation({ connectorUid, request: async () => {
          check()
          if ((await wallet.getAddresses())[0]?.toLowerCase() !== address.toLowerCase() || await wallet.getChainId() !== deployment.chainId)
            throw new Error('Ví hoặc mạng đã thay đổi trước khi ký.')
          return wallet.writeContract(simulation.request)
        }, onResult: (hash, late) => {
          current.hash = hash; save(current)
          if (late && mounted.current) { setError(''); setProgress('Ví vừa trả hash muộn. Bấm kiểm tra giao dịch; chưa gửi thêm giao dịch.') }
        } })
        value.hash = hash; save(value); setWaitingWalletKey(null)
      }
      const current = value
      setProgress('Đã gửi giao dịch. Đang chờ receipt và xác nhận…')
      const receipt = await client.waitForTransactionReceipt({ hash: current.hash, confirmations: deployment.confirmations, timeout: 90_000,
        onReplaced: replacement => { current.cancelled ||= replacement.reason === 'cancelled'; current.hash = replacement.transaction.hash; save(current) } })
      if (current.cancelled || receipt.status === 'reverted') {
        localStorage.removeItem(key); setStored({ key, value: null })
        throw new Error(current.cancelled ? 'Giao dịch đã bị hủy trong ví. Có thể đối chiếu và thử lại.' : 'Giao dịch bị revert. Chưa xác nhận nhận tiền; đối chiếu lại trước khi thử tiếp.')
      }
      const transaction = await client.getTransaction({ hash: receipt.transactionHash })
      if (transaction.from.toLowerCase() !== address.toLowerCase() || transaction.to?.toLowerCase() !== campaign.contractAddress.toLowerCase())
        throw new Error('Giao dịch thay thế không đúng ví hoặc contract. Chưa xác nhận thao tác thành công.')
      verifyRefundReceipt(current.action, receipt, abi, campaign.contractAddress, campaign.onchainCampaignId, address, current.amountUnits, current.milestoneIndex)
      if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Receipt không còn trên chain hiện tại. Đối chiếu lại.')
      current.hash = receipt.transactionHash; current.receiptBlock = receipt.blockNumber.toString(); save(current)
      check()
      if (mounted.current) setProgress('Receipt thành công. Đang chờ indexer ghi nhận; chưa hoàn tất trên ứng dụng.')
      void query.refetch(); onRefresh()
    } catch (cause) {
      if (mounted.current) {
        setProgress(''); setError(cause instanceof BaseError ? cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
          ? 'Bạn đã từ chối giao dịch trong ví.' : cause.shortMessage : getErrorMessage(cause))
        if (userId.current === session?.userId) void query.refetch()
        onRefresh()
      }
    } finally { running.current = false; if (mounted.current) { setBusy(false); setWaitingWalletKey(null) } }
  }

  return <section className="panel refund-panel" aria-labelledby="refund-title">
    <h2 id="refund-title">Hoàn tiền</h2>
    <p>Donor tự ký nhận tiền về chính ví đã đóng góp. Không cần approve token; ví cần ETH trả phí gas.</p>
    {sessionLoading ? <p role="status">Đang kiểm tra tài khoản…</p> : !session ? <a href="#/account">Đăng nhập và liên kết ví để xem quyền nhận</a> : <>
      <ConnectButton showBalance={false} />
      {account.address && !linked && <p>Ví đang chọn chưa liên kết với tài khoản này. <a href="#/account">Liên kết ví</a></p>}
      {query.isPending && <p role="status">Đang đối chiếu quyền nhận…</p>}
      {query.isError && <p role="alert">{getErrorMessage(query.error)} <button className="button button--secondary" onClick={() => void query.refetch()}>Thử lại</button></p>}
      {refund && <>
        <p>Đối chiếu quyền nhận tại block {refund.checkedBlock} · thời gian chain {new Date(Number(refund.chainTimestamp) * 1000).toLocaleString('vi-VN')}</p>
        {refund.snapshotted ? <><p>Quỹ hoàn tiền: {formatUnits(BigInt(refund.poolUnits), deployment.tokenDecimals)} MockUSDC.</p>
          <p className="muted">Khoản nhận được tính theo tỷ lệ đóng góp trong quỹ đã chốt, làm tròn xuống. Tiền đã giải ngân không nằm trong quỹ này; bond được xử lý riêng.</p>
          <p className="muted">Quyền nhận không hết hạn và không phụ thuộc thứ tự nhận. Phần dư do làm tròn giữ trong escrow, admin không có quyền rút. Tiền donor chưa nhận vẫn được giữ để hoàn trả.</p></>
          : <p>{refund.canFinalizeFunding ? 'Đã hết hạn và chưa đạt mục tiêu. Cần ký chốt gây quỹ thất bại để mở quyền nhận.'
            : refund.canFinalizeMilestone ? 'Milestone đã quá hạn. Có thể ký chốt thất bại để mở hoàn tiền từ escrow chưa giải ngân.' : 'Chưa mở hoàn tiền. Đạt mục tiêu gây quỹ không tự tạo quyền hoàn tiền.'}</p>}
        {!refund.snapshotted && refund.milestoneDeadline !== '0' && <p className="muted">Hạn {refund.campaign.state === 'MILESTONE_ACTIVE' ? 'nộp bằng chứng' : 'kích hoạt'} milestone {Number(refund.currentMilestoneIndex) + 1}: {new Date(Number(refund.milestoneDeadline) * 1000).toLocaleString('vi-VN')}. Điều kiện quá hạn dùng thời gian chain.</p>}
        {donor && BigInt(donor.contributionUnits) > 0n && <><p>Ví đã góp {formatUnits(BigInt(donor.contributionUnits), deployment.tokenDecimals)} MockUSDC.</p>
          {donor.claimed ? <p role="status">Đã nhận và đồng bộ: {formatUnits(BigInt(donor.entitlementUnits), deployment.tokenDecimals)} MockUSDC. <code className="public-wallet-address">{donor.transactionHash}</code></p>
            : refund.snapshotted && <p>Được nhận: {formatUnits(BigInt(donor.claimableUnits), deployment.tokenDecimals)} MockUSDC{donor.claimableUnits === '0' ? ' (khoản nhận làm tròn về 0; ký chỉ ghi nhận đã xử lý và vẫn tốn phí gas)' : ''}.</p>}</>}
        {refund.snapshotted && donor && donor.contributionUnits === '0' && <p>Ví này không đóng góp vào campaign nên không có quyền nhận.</p>}
        {refund.wallets.some(item => BigInt(item.contributionUnits) > 0n) && <div className="refund-wallet-rights">
          <h3>Quyền nhận theo ví của tài khoản</h3>
          <ul>{refund.wallets.filter(item => BigInt(item.contributionUnits) > 0n).map(item => <li key={item.donor}>
            <code className="public-wallet-address">{item.donor}</code> · {item.claimed ? 'Đã nhận và đồng bộ' : refund.snapshotted
              ? `Có thể nhận ${formatUnits(BigInt(item.claimableUnits), deployment.tokenDecimals)} MockUSDC` : 'Chưa mở hoàn tiền'}
            {item.donor === account.address?.toLowerCase() ? ' · ví đang chọn' : ' · chọn ví này trong bộ chọn ví để nhận'}
          </li>)}</ul>
        </div>}
      </>}
      {(busy || pending || indexed) && <TransactionSteps operation={(pending?.action ?? (requestedAction?.key === key ? requestedAction.action : undefined)) === 'claimRefund' ? 'Nhận hoàn tiền' : 'Mở quyền hoàn tiền'}
        stage={indexed ? 'indexed' : pending?.receiptBlock ? 'receipt' : pending ? 'submitted' : waitingWalletKey === key ? 'wallet' : 'idle'} hash={pending?.hash} receiptBlock={pending?.receiptBlock} />}
      {indexed ? <p className="toast toast--success" role="status">{pending?.action === 'claimRefund' ? 'Hoàn tiền đã xác nhận và đồng bộ.' : 'Đã mở quyền hoàn tiền và đồng bộ. Donor có thể ký nhận.'}</p>
        : pending ? <><button className="button button--primary" disabled={Boolean(actionReason(pending.action))} aria-describedby="refund-pending-reason" onClick={() => void execute(pending.action)}>{busy ? 'Đang xử lý…' : 'Kiểm tra giao dịch đã gửi'}</button>
          <p id="refund-pending-reason" className="muted">{actionReason(pending.action) || 'Kiểm tra hash hiện có; không tạo giao dịch mới.'}</p></>
          : refund && <>
            {(refund.snapshotted || donor && BigInt(donor.contributionUnits) > 0n) && <div className="campaign-action-row">
              <button className="button button--primary" disabled={Boolean(actionReason('claimRefund'))} aria-describedby="refund-claim-reason" onClick={() => void execute('claimRefund')}>Nhận hoàn tiền{donor?.claimableUnits === '0' ? ' (0 MockUSDC)' : ''}</button>
              <p id="refund-claim-reason" className="muted">{actionReason('claimRefund') || `Được nhận ${formatUnits(BigInt(donor!.claimableUnits), deployment.tokenDecimals)} MockUSDC về ví ${account.address}. Không có hạn cuối để nhận.`}</p></div>}
            {refund.campaign.state === 'FUNDING' && <div className="campaign-action-row">
              <button className="button button--primary" disabled={Boolean(actionReason('finalizeFundingFailure'))} aria-describedby="refund-funding-reason" onClick={() => void execute('finalizeFundingFailure')}>Chốt gây quỹ thất bại và mở hoàn tiền</button>
              <p id="refund-funding-reason" className="muted">{actionReason('finalizeFundingFailure') || 'Đã đến hạn trên chain. Bất kỳ ví đã liên kết nào có ETH phí gas đều có thể ký chốt.'}</p></div>}
            {['FUNDED', 'MILESTONE_SETTLED', 'MILESTONE_ACTIVE'].includes(refund.campaign.state) && <div className="campaign-action-row">
              <button className="button button--primary" disabled={Boolean(actionReason('finalizeMilestoneTimeout'))} aria-describedby="refund-milestone-reason" onClick={() => void execute('finalizeMilestoneTimeout')}>Chốt milestone quá hạn và mở hoàn tiền</button>
              <p id="refund-milestone-reason" className="muted">{actionReason('finalizeMilestoneTimeout') || 'Đã quá hạn theo chain. Ký chốt thất bại; chưa tự nhận tiền cho donor.'}</p></div>}
            {refund.campaign.state === 'FUNDING' && linked && account.address?.toLowerCase() === campaign.organizer.toLowerCase() && <div>
              <label className="confirmation-check"><input type="checkbox" checked={confirmCancel} onChange={event => setCancelConfirmationKey(event.target.checked ? key : null)} disabled={busy} /><span>Tôi xác nhận hủy campaign, trả bond và mở hoàn tiền cho donor. Không thể hoàn tác.</span></label>
              <button className="button button--secondary" disabled={Boolean(actionReason('cancelCampaign'))} aria-describedby="refund-cancel-reason" onClick={() => void execute('cancelCampaign')}>Ký hủy campaign</button>
              <p id="refund-cancel-reason" className="muted">{actionReason('cancelCampaign') || `Đủ điều kiện ký hủy bằng ví ${campaign.organizer}; bond được trả riêng, donor tự claim.`}</p>
            </div>}
          </>}
      {pending && <p className="public-wallet-address">Giao dịch: <code>{pending.hash}</code>{pending.receiptBlock ? ` · receipt block ${pending.receiptBlock}` : ' · chưa có receipt'}</p>}
      {pending?.receiptBlock && !indexed && <button className="button button--secondary" disabled={query.isFetching} onClick={() => { void query.refetch(); onRefresh() }}>Đối chiếu indexer · không ký lại</button>}
      {indexed && pending?.action !== 'claimRefund' && <button className="button button--secondary" onClick={() => {
        setStored({ key, value: null }); setProgress(''); setCancelConfirmationKey(null); void query.refetch()
      }}>Tiếp tục xem quyền nhận của ví</button>}
      {pending && error && !indexed && <button className="button button--secondary" disabled={busy} onClick={() => {
        localStorage.removeItem(key); setStored({ key, value: null }); setProgress(''); setError('Đã bỏ theo dõi hash. Kiểm tra Activity trong ví và tải lại quyền nhận trước khi ký; giao dịch cũ vẫn có thể được mine và giao dịch sau có thể revert, tốn phí.')
        void query.refetch()
      }}>Bỏ theo dõi hash để đối chiếu lại</button>}
    </>}
    {progress && !indexed && <p role="status">{progress}</p>}
    {gas.isError && <button className="button button--secondary" onClick={() => void gas.refetch()}>Tải lại ETH phí gas</button>}
    {error && <p role="alert">{error}</p>}
  </section>
}
