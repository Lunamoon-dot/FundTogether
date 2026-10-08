import { useEffect, useRef, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useConfig, useDisconnect, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { BaseError, decodeEventLog, formatUnits, keccak256, parseUnits, UserRejectedRequestError } from 'viem'
import type { Abi, Address, Hash, Hex } from 'viem'
import contractAbiJson from '../../../../backend/src/blockchain/generated/fund-together.abi.json'
import tokenAbiJson from '../../../../backend/src/blockchain/generated/mock-usdc.abi.json'
import deployment from '../../../../backend/src/blockchain/generated/deployment.local.json'
import type { CampaignWorkflow, IndexerStatus, PublicCampaign } from '../../lib/api/public-campaigns'
import { getPublicCampaign, listMyContributions } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../../lib/web3/wallet-confirmation'
import { assertWalletConnection, verifyWalletDeployment } from '../../lib/web3/wallet-identity'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { walletActionReason } from '../campaigns/campaign-journey'
import { TransactionSteps } from '../campaigns/TransactionSteps'

const contractAbi = contractAbiJson as Abi
const tokenAbi = tokenAbiJson as Abi
type Pending = { phase: 'approve' | 'donate'; hash: Hash; amountUnits: string; receiptBlock?: string; cancelled?: boolean }

function loadPending(key: string): Pending | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as Pending : null
  } catch { return null }
}

export function DonatePanel({ campaign, workflow, sync, onRefresh }: {
  campaign: PublicCampaign; workflow?: CampaignWorkflow; sync?: IndexerStatus; onRefresh: () => void
}) {
  const account = useAccount()
  const config = useConfig()
  const client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const { switchChainAsync } = useSwitchChain()
  const { disconnect } = useDisconnect()
  const { session, sessionLoading } = useAccountSession()
  const currentUserId = useRef(session?.userId ?? null)
  useEffect(() => { currentUserId.current = session?.userId ?? null }, [session?.userId])
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const running = useRef(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [waitingWalletKey, setWaitingWalletKey] = useState<string | null>(null)
  const [requestPhase, setRequestPhase] = useState<{ key: string; phase: Pending['phase'] } | null>(null)
  const pendingKey = `ft-donate:${deployment.genesisHash}:${deployment.contractAddress}:${campaign.id}:${account.address?.toLowerCase() ?? 'none'}${'deploymentBlockHash' in deployment ? `:${String(deployment.deploymentBlockHash)}` : ''}`
  const [pendingState, setPendingState] = useState(() => ({ key: pendingKey, value: loadPending(pendingKey) }))
  const storedPending = pendingState.key === pendingKey ? pendingState.value : loadPending(pendingKey)
  const history = useQuery({ queryKey: ['my-contributions', session?.userId],
    queryFn: ({ signal }) => listMyContributions(signal),
    enabled: Boolean(session && storedPending?.phase === 'donate' && storedPending.receiptBlock),
    retry: false, refetchInterval: 4_000 })
  const indexedDonation = Boolean(!history.isError && storedPending?.phase === 'donate' && storedPending.receiptBlock
    && history.data?.items.some(item => item.id === campaign.id
      && item.donor === account.address?.toLowerCase() && item.amountUnits === storedPending.amountUnits
      && item.transactionHash.toLowerCase() === storedPending.hash.toLowerCase()
      && BigInt(item.blockNumber) >= BigInt(storedPending.receiptBlock!)))
  const pending = indexedDonation ? null : storedPending
  const linked = Boolean(session && account.address && session.wallets.some(item =>
    item.chainId === deployment.chainId && item.address.toLowerCase() === account.address!.toLowerCase()))
  const token = useQuery({ queryKey: ['donation-token', account.address, campaign.id], enabled: linked && Boolean(client), retry: false,
    refetchInterval: 10_000, queryFn: async () => {
      const address = account.address!
      const [balance, allowance, gas] = await Promise.all([
        client!.readContract({ address: campaign.tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [address] }),
        client!.readContract({ address: campaign.tokenAddress, abi: tokenAbi, functionName: 'allowance', args: [address, campaign.contractAddress] }),
        client!.getBalance({ address }),
      ])
      return { balance: balance as bigint, allowance: allowance as bigint, gas }
    } })
  const refreshToken = token.refetch
  const walletReason = walletActionReason({ sessionLoading, signedIn: Boolean(session), address: account.address, linked,
    chainId: account.chainId, requiredChainId: deployment.chainId, walletReady: Boolean(wallet && client) })
  let amountUnits = 0n, amountReason = ''
  try {
    if (!/^(0|[1-9][0-9]*)(\.\d+)?$/.test(amount) || (amount.split('.')[1]?.length ?? 0) > deployment.tokenDecimals) throw new Error()
    amountUnits = parseUnits(amount, deployment.tokenDecimals)
    if (amountUnits <= 0n) throw new Error()
  } catch { amountReason = `Nhập số tiền lớn hơn 0, tối đa ${deployment.tokenDecimals} chữ số sau dấu chấm.` }
  const donationReason = busy ? 'Đang xử lý yêu cầu hiện tại; chờ kết quả trước khi thao tác tiếp.'
    : indexedDonation ? 'Đã đóng góp và đồng bộ. Chọn Đóng góp tiếp để nhập khoản mới.'
      : pending?.receiptBlock ? 'Receipt đã thành công; đang chờ indexer. Chưa gửi thêm giao dịch.'
        : pending ? walletReason : !workflow ? 'API thiếu dữ liệu workflow của campaign. Khởi động lại backend bản mới rồi tải lại trang; chưa gửi giao dịch.'
          : sync?.status !== 'ready' ? 'Chờ dữ liệu chain và indexer sẵn sàng.'
          : campaign.state !== 'FUNDING' ? 'Campaign đã dừng nhận đóng góp.'
            : BigInt(workflow.chainTimestamp) >= BigInt(campaign.fundingDeadline) ? 'Đã hết hạn gây quỹ theo thời gian chain. Không nhận thêm đóng góp; ký chốt gây quỹ thất bại ở phần Hoàn tiền.'
              : walletReason || amountReason || (amountUnits > BigInt(campaign.goalUnits) - BigInt(campaign.totalContributedUnits) ? 'Số tiền vượt phần mục tiêu còn thiếu.'
                : token.isError ? 'Chưa đọc được số dư/allowance. Thử tải lại số dư.'
                  : !token.data ? 'Đang đọc số dư token và ETH phí gas.'
                    : token.data.balance < amountUnits ? 'Ví chưa đủ MockUSDC cho số tiền đã nhập.'
                      : token.data.gas === 0n ? 'Ví chưa có ETH Foundry để trả phí gas.' : '')

  function savePending(value: Pending | null) {
    if (value) localStorage.setItem(pendingKey, JSON.stringify(value))
    else localStorage.removeItem(pendingKey)
    setPendingState({ key: pendingKey, value })
  }

  useEffect(() => {
    if (!indexedDonation) return
    localStorage.removeItem(pendingKey)
    void refreshToken()
  }, [indexedDonation, pendingKey, refreshToken])

  async function execute() {
    if (running.current) return
    running.current = true
    setBusy(true); setError(''); setProgress('Đang kiểm tra ví và campaign…')
    try {
      if (!session) throw new Error('Đăng nhập tài khoản FundTogether trước khi đóng góp.')
      if (!client || !wallet || !account.address || !account.connector) throw new Error('Kết nối ví donor trước khi đóng góp.')
      if (!linked) throw new Error('Liên kết ví donor với tài khoản trong trang Tài khoản trước khi đóng góp.')
      const connectorUid = account.connector.uid
      assertWalletRequestAvailable(connectorUid)
      const expected = { address: account.address, chainId: account.chainId, connectorUid, userId: session.userId }
      function checkConnection() {
        if (!mounted.current) throw new Error('Đã rời trang campaign. Mở lại để đối chiếu giao dịch.')
        const active = getAccount(config)
        assertWalletConnection(expected, { ...active, connectorUid: active.connector?.uid, userId: currentUserId.current })
      }
      checkConnection()
      if (account.chainId !== deployment.chainId) {
        setProgress(`Đang chờ ${account.connector.name} xác nhận chuyển mạng…`)
        await requestWalletConfirmation({ connectorUid, request: () => switchChainAsync({ chainId: deployment.chainId }) })
        throw new Error('Đã chuyển mạng. Bấm tiếp tục để đối chiếu lại ví.')
      }
      const amountUnits = pending?.amountUnits ?? (() => {
        if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amount)) throw new Error('Nhập số MockUSDC hợp lệ, tối đa 6 chữ số thập phân.')
        const units = parseUnits(amount, deployment.tokenDecimals)
        if (units <= 0n) throw new Error('Số đóng góp phải lớn hơn 0.')
        return units.toString()
      })()
      const units = BigInt(amountUnits)
      if (pending?.phase === 'donate' && pending.receiptBlock) {
        onRefresh()
        setProgress('Giao dịch đã xác nhận. Đang chờ indexer đồng bộ…')
        return
      }
      const identity = { chainId: deployment.chainId, contractAddress: deployment.contractAddress as Address,
        tokenAddress: deployment.tokenAddress as Address, genesisHash: deployment.genesisHash as Hex,
        contractCodeHash: deployment.contractCodeHash as Hex, tokenCodeHash: deployment.tokenCodeHash as Hex }
      const [chainId, genesis, code, tokenCode] = await Promise.all([
        client.getChainId(), client.getBlock({ blockNumber: 0n }), client.getCode({ address: identity.contractAddress }),
        client.getCode({ address: identity.tokenAddress }),
      ])
      if (chainId !== identity.chainId || genesis.hash !== identity.genesisHash || !code || !tokenCode
        || keccak256(code) !== identity.contractCodeHash || keccak256(tokenCode) !== identity.tokenCodeHash)
        throw new Error('RPC hoặc deployment đã thay đổi. Chưa thể đóng góp.')
      await verifyWalletDeployment(wallet, identity)
      checkConnection()
      const addresses = await wallet.getAddresses()
      if (addresses[0]?.toLowerCase() !== account.address.toLowerCase() || await wallet.getChainId() !== deployment.chainId)
        throw new Error('Ví trong extension đã thay đổi. Kết nối lại ví donor.')

      async function reconcile(value: Pending) {
        setProgress(value.phase === 'approve' ? 'Đang kiểm tra giao dịch cấp quyền token…' : 'Đang kiểm tra giao dịch đóng góp…')
        let cancelled = Boolean(value.cancelled)
        const receipt = await client!.waitForTransactionReceipt({ hash: value.hash, confirmations: deployment.confirmations, timeout: 90_000,
          onReplaced: replacement => {
            cancelled ||= replacement.reason === 'cancelled'
            value.hash = replacement.transaction.hash
            savePending({ ...value, hash: replacement.transaction.hash, cancelled })
          } })
        if (cancelled || receipt.status !== 'success') {
          savePending(null)
          throw new Error(cancelled ? 'Giao dịch đã bị hủy trong ví.' : 'Giao dịch bị revert. Token chưa được cấp quyền hoặc đóng góp chưa được ghi nhận.')
        }
        if (value.phase === 'donate') {
          const received = receipt.logs.some(log => {
            if (log.address.toLowerCase() !== campaign.contractAddress.toLowerCase()) return false
            try {
              const event = decodeEventLog({ abi: contractAbi, data: log.data, topics: log.topics })
              const args = event.args as { campaignId?: bigint; donor?: Address; amount?: bigint }
              return event.eventName === 'DonationReceived' && args.campaignId === BigInt(campaign.onchainCampaignId)
                && args.donor?.toLowerCase() === account.address!.toLowerCase() && args.amount === units
            } catch { return false }
          })
          if (!received) throw new Error('Receipt không có sự kiện đóng góp đúng campaign, ví và số tiền. Cần đối chiếu trước khi thử lại.')
          savePending({ ...value, receiptBlock: receipt.blockNumber.toString() })
          setProgress('Giao dịch đã xác nhận. Đang chờ indexer đồng bộ…')
          onRefresh()
        } else savePending(null)
      }

      if (pending) {
        await reconcile(pending)
        if (pending.phase === 'donate') return
      }
      const fresh = (await getPublicCampaign(campaign.id)).campaign
      if (fresh.chainId !== deployment.chainId || fresh.contractAddress.toLowerCase() !== campaign.contractAddress.toLowerCase()
        || fresh.tokenAddress.toLowerCase() !== campaign.tokenAddress.toLowerCase() || fresh.onchainCampaignId !== campaign.onchainCampaignId)
        throw new Error('Danh tính campaign đã thay đổi. Tải lại trang trước khi đóng góp.')
      const id = BigInt(campaign.onchainCampaignId)
      const block = await client.getBlock({ blockTag: 'latest' })
      const [state, deadline, chainCampaign, balance, allowance, gas] = await Promise.all([
        client.readContract({ address: campaign.contractAddress, abi: contractAbi, functionName: 'campaignState', args: [id], blockNumber: block.number }),
        client.readContract({ address: campaign.contractAddress, abi: contractAbi, functionName: 'fundingDeadlines', args: [id], blockNumber: block.number }),
        client.readContract({ address: campaign.contractAddress, abi: contractAbi, functionName: 'campaigns', args: [id], blockNumber: block.number }),
        client.readContract({ address: campaign.tokenAddress, abi: tokenAbi, functionName: 'balanceOf', args: [account.address], blockNumber: block.number }),
        client.readContract({ address: campaign.tokenAddress, abi: tokenAbi, functionName: 'allowance', args: [account.address, campaign.contractAddress], blockNumber: block.number }),
        client.getBalance({ address: account.address, blockNumber: block.number }),
      ])
      const [title, tokenAddress, goal, , organizer, , , contributed] = chainCampaign as [string, Address, bigint, bigint, Address, boolean, bigint, bigint]
      if (title !== fresh.title || tokenAddress.toLowerCase() !== fresh.tokenAddress.toLowerCase()
        || organizer.toLowerCase() !== fresh.organizer.toLowerCase() || goal !== BigInt(fresh.goalUnits))
        throw new Error('Dữ liệu campaign trên chain không khớp trang công khai.')
      if (Number(state) !== 2 || BigInt(deadline as bigint) <= block.timestamp) throw new Error('Campaign không còn nhận đóng góp.')
      if (units > goal - contributed) throw new Error(`Số tiền vượt phần mục tiêu còn lại: ${formatUnits(goal - contributed, deployment.tokenDecimals)} MockUSDC.`)
      if ((balance as bigint) < units) throw new Error(`Ví chỉ có ${formatUnits(balance as bigint, deployment.tokenDecimals)} MockUSDC.`)
      if (gas === 0n) throw new Error('Ví chưa có ETH trên mạng Foundry để trả phí giao dịch.')
      async function send(phase: Pending['phase'], functionName: string, args: unknown[], address: Address, abi: Abi) {
        checkConnection()
        if ((await wallet!.getAddresses())[0]?.toLowerCase() !== account.address!.toLowerCase()) throw new Error('Ví đã thay đổi trước khi ký.')
        setProgress(`Đang chờ ${account.connector!.name} xác nhận ${phase === 'approve' ? 'cấp quyền MockUSDC' : 'đóng góp'}…`)
        const simulation = await client!.simulateContract({ account: account.address!, address, abi, functionName, args })
        await verifyWalletDeployment(wallet!, identity)
        checkConnection()
        const value: Pending = { phase, hash: '0x' as Hash, amountUnits }
        setWaitingWalletKey(pendingKey)
        setRequestPhase({ key: pendingKey, phase })
        const hash = await requestWalletConfirmation({ connectorUid, request: async () => {
          checkConnection()
          if ((await wallet!.getAddresses())[0]?.toLowerCase() !== account.address!.toLowerCase()
            || await wallet!.getChainId() !== deployment.chainId) throw new Error('Ví hoặc mạng đã thay đổi trước khi ký.')
          return wallet!.writeContract(simulation.request)
        },
          onResult: (result, late) => {
            value.hash = result
            savePending(value)
            if (late) setProgress('Ví vừa trả hash sau thời gian chờ. Bấm tiếp tục để đối chiếu; chưa gửi thêm giao dịch.')
          } })
        value.hash = hash
        setWaitingWalletKey(null)
        await reconcile(value)
      }
      if ((allowance as bigint) < units) {
        await send('approve', 'approve', [campaign.contractAddress, units], campaign.tokenAddress, tokenAbi)
        checkConnection()
      }
      const latest = (await getPublicCampaign(campaign.id)).campaign
      if (latest.state !== 'FUNDING') throw new Error('Campaign đã đổi trạng thái. Chưa gửi giao dịch đóng góp.')
      await send('donate', 'donate', [id, units], campaign.contractAddress, contractAbi)
      void token.refetch()
    } catch (cause) {
      setProgress('')
      setError(cause instanceof BaseError
        ? cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
          ? 'Bạn đã từ chối giao dịch trong ví.' : cause.shortMessage
        : getErrorMessage(cause))
    } finally { running.current = false; setBusy(false); setWaitingWalletKey(null) }
  }

  return <section className="panel donation-panel" aria-labelledby="donation-title">
    <h2 id="donation-title">Đóng góp bằng MockUSDC</h2>
    <p className="muted">MockUSDC được chuyển từ ví donor vào escrow của hợp đồng. Trên mạng Foundry (31337), ví sẽ hỏi cấp quyền dùng đúng số token nếu chưa đủ allowance, rồi hỏi ký đóng góp. Số đã góp hiển thị sau khi indexer đồng bộ.</p>
    <p className="muted">Nếu extension đã gửi giao dịch nhưng trang chưa nhận hash, kiểm tra Activity trong ví trước khi bấm lại để tránh đóng góp hai lần.</p>
    {!session && <p>Đăng nhập để liên kết ví donor. <a href="#/account">Mở tài khoản</a></p>}
    <ConnectButton showBalance={false} />
    {session && account.address && !linked && <div role="alert">
      <p>{account.address.toLowerCase() === campaign.organizer.toLowerCase()
        ? 'Đây là ví đại diện tổ chức của campaign. Để thử như donor, hãy chọn ví khác và liên kết ví đó với tài khoản đang đăng nhập.'
        : 'Ví đang chọn chưa liên kết với tài khoản đang đăng nhập.'}</p>
      <button className="button button--secondary" onClick={() => disconnect({ connector: account.connector })}>Ngắt ví này để chọn ví donor</button>
      <a className="button button--secondary" href="#/account">Liên kết ví donor với tài khoản</a>
    </div>}
    {linked && <p>{token.isError ? getErrorMessage(token.error) : token.data
      ? `Ví có ${formatUnits(token.data.balance, deployment.tokenDecimals)} MockUSDC · allowance ${formatUnits(token.data.allowance, deployment.tokenDecimals)} · ${formatUnits(token.data.gas, 18)} ETH phí gas`
      : 'Đang đọc số dư ví…'}</p>}
    <label htmlFor="donation-amount">Số tiền đóng góp (MockUSDC)</label>
    <input id="donation-amount" type="text" inputMode="decimal" placeholder="Ví dụ: 1.5" value={amount}
      disabled={busy || Boolean(pending) || campaign.state !== 'FUNDING'} onChange={event => setAmount(event.target.value)} />
    <p className="muted">Còn thiếu: {formatUnits(BigInt(campaign.goalUnits) - BigInt(campaign.totalContributedUnits), deployment.tokenDecimals)} MockUSDC.</p>
    {pending && <p className="public-wallet-address">{pending.phase === 'approve' ? 'Cấp quyền token' : 'Đóng góp'} · giao dịch <code>{pending.hash}</code>
      {pending.receiptBlock ? ` · đã xác nhận tại block ${pending.receiptBlock}, chờ indexer` : ' · đang chờ receipt'}</p>}
    {progress && !indexedDonation && <p role="status">{progress}</p>}
    {pending?.receiptBlock && history.isError && <p role="alert">Chưa đối chiếu được indexer: {getErrorMessage(history.error)}</p>}
    {pending?.receiptBlock && <button className="button button--secondary" disabled={history.isFetching} onClick={() => { void history.refetch(); onRefresh() }}>Đối chiếu indexer · không ký lại</button>}
    {indexedDonation && <p className="toast toast--success" role="status">Giao dịch đóng góp đã xác nhận và được indexer đồng bộ.</p>}
    {(busy || storedPending || indexedDonation) && <TransactionSteps operation={(pending?.phase ?? (requestPhase?.key === pendingKey ? requestPhase.phase : 'donate')) === 'approve' ? 'Cấp quyền MockUSDC (sau đó ký đóng góp)' : 'Đóng góp'}
      stage={indexedDonation ? 'indexed' : pending?.receiptBlock ? 'receipt' : pending ? 'submitted' : waitingWalletKey === pendingKey ? 'wallet' : 'idle'}
      approval={(pending?.phase ?? (requestPhase?.key === pendingKey ? requestPhase.phase : 'donate')) === 'approve'}
      hash={storedPending?.hash} receiptBlock={storedPending?.receiptBlock} />}
    {indexedDonation && <button className="button button--secondary" onClick={() => {
      setPendingState({ key: pendingKey, value: null }); setAmount(''); setProgress('')
    }}>Đóng góp tiếp</button>}
    {error && <p role="alert">{error}</p>}
    <button className="button button--primary" disabled={Boolean(donationReason)} aria-describedby="donation-reason" onClick={() => void execute()}>
      {busy ? 'Đang xử lý…' : pending ? 'Tiếp tục kiểm tra giao dịch' : 'Đóng góp'}</button>
    <p id="donation-reason" className="muted">{donationReason || (token.data && token.data.allowance < amountUnits
      ? 'Đủ điều kiện. Ví sẽ hỏi cấp quyền đúng số token, rồi hỏi ký đóng góp.' : 'Đủ điều kiện. Ví sẽ hỏi ký đóng góp; chưa gửi giao dịch.')}</p>
    {token.isError && <button className="button button--secondary" onClick={() => void token.refetch()}>Tải lại số dư</button>}
  </section>
}
