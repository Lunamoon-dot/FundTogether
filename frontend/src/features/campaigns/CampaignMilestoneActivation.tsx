import { useEffect, useRef, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useConfig, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { BaseError, decodeEventLog, formatUnits, UserRejectedRequestError } from 'viem'
import type { Abi, Address, Hash } from 'viem'
import abiJson from '../../../../backend/src/blockchain/generated/fund-together.abi.json'
import deployment from '../../lib/web3/deployment-context'
import type { SubmissionPlan } from '../../lib/api/campaign-submission'
import { getPublicCampaign, getPublication } from '../../lib/api/public-campaigns'
import type { CampaignWorkflow, PublicationStatus } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../../lib/web3/wallet-confirmation'
import { assertWalletConnection, verifyWalletDeployment } from '../../lib/web3/wallet-identity'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { walletActionReason } from './campaign-journey'
import { TransactionSteps } from './TransactionSteps'

const abi = abiJson as Abi
type Pending = { hash: Hash; receiptBlock?: string; cancelled?: boolean }

function loadPending(key: string): Pending | null {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as Pending : null }
  catch { return null }
}

export function CampaignMilestoneActivation({ campaignId, onchainCampaignId, plan, projection, workflow, onRefresh }: {
  campaignId: string; onchainCampaignId: string; plan: SubmissionPlan; projection: PublicationStatus; workflow?: CampaignWorkflow; onRefresh: () => void
}) {
  const client = usePublicClient({ chainId: deployment.chainId })
  const status = useQuery({ queryKey: ['milestone-activation', campaignId, projection.indexedBlock],
    enabled: Boolean(client && projection.indexedBlock), retry: false, queryFn: async () => {
      const id = BigInt(onchainCampaignId)
      const blockNumber = BigInt(projection.indexedBlock!)
      const index = await client!.readContract({ address: plan.contractAddress, abi, functionName: 'currentMilestoneIndex', args: [id], blockNumber }) as bigint
      if (index >= BigInt(plan.budgetUnits.length)) return { index: Number(index), deadline: 0n, state: -1 }
      const [deadline, milestone] = await Promise.all([
        client!.readContract({ address: plan.contractAddress, abi, functionName: 'activationDeadlines', args: [id], blockNumber }),
        client!.readContract({ address: plan.contractAddress, abi, functionName: 'milestones', args: [id, index], blockNumber }),
      ])
      return { index: Number(index), deadline: deadline as bigint, state: Number((milestone as [bigint, number])[1]) }
    } })
  if (status.isPending) return <section className="panel"><h2>Milestone tiếp theo</h2><p role="status">Đang đọc trạng thái đã đồng bộ…</p></section>
  if (status.isError) return <section className="panel"><h2>Milestone tiếp theo</h2><p role="alert">{getErrorMessage(status.error)}</p>
    <button className="button button--secondary" onClick={() => void status.refetch()}>Thử lại</button></section>
  if (status.data.index >= plan.budgetUnits.length) return null
  return <MilestoneActivationAction key={`${campaignId}:${status.data.index}`} campaignId={campaignId}
    onchainCampaignId={onchainCampaignId} plan={plan} projection={projection} workflow={workflow} indexed={status.data} onRefresh={onRefresh} />
}

function MilestoneActivationAction({ campaignId, onchainCampaignId, plan, projection, workflow, indexed, onRefresh }: {
  campaignId: string; onchainCampaignId: string; plan: SubmissionPlan; projection: PublicationStatus;
  workflow?: CampaignWorkflow;
  indexed: { index: number; deadline: bigint; state: number }; onRefresh: () => void
}) {
  const account = useAccount()
  const config = useConfig()
  const client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const { switchChainAsync } = useSwitchChain()
  const { session, sessionLoading } = useAccountSession()
  const currentUserId = useRef(session?.userId ?? null)
  useEffect(() => { currentUserId.current = session?.userId ?? null }, [session?.userId])
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [waitingWallet, setWaitingWallet] = useState(false)
  const pendingKey = `ft-activate:${plan.genesisHash}:${plan.contractAddress}:${campaignId}:${indexed.index}${plan.deploymentBlockHash ? `:${plan.deploymentBlockHash}` : ''}`
  const [pending, setPending] = useState<Pending | null>(() => loadPending(pendingKey))
  const confirmed = projection.state === 'MILESTONE_ACTIVE' && indexed.state === 1
    && (!pending || Boolean(pending.receiptBlock && workflow?.activationTransactionHash?.toLowerCase() === pending.hash.toLowerCase()
      && BigInt(workflow.checkedBlock) >= BigInt(pending.receiptBlock)))
  useEffect(() => { if (confirmed) localStorage.removeItem(pendingKey) }, [confirmed, pendingKey])
  const linked = Boolean(session?.wallets.some(link => link.address.toLowerCase() === account.address?.toLowerCase() && link.chainId === plan.chainId))
  const walletReason = walletActionReason({ sessionLoading, signedIn: Boolean(session), address: account.address, linked,
    chainId: account.chainId, requiredChainId: plan.chainId, walletReady: Boolean(client && wallet) })
  const activationReason = busy ? 'Đang xử lý yêu cầu hiện tại.' : pending?.receiptBlock ? 'Receipt đã thành công; đang chờ indexer. Không ký kích hoạt lại.'
    : walletReason || (account.address?.toLowerCase() !== plan.organizer.toLowerCase() ? `Chọn ví đại diện tổ chức: ${plan.organizer}.`
      : pending ? '' : !workflow || projection.sync.status !== 'ready' ? 'Chờ checkpoint và thời gian chain sẵn sàng.'
        : !['FUNDED', 'MILESTONE_SETTLED'].includes(projection.state ?? '') || indexed.state !== 0 ? 'Milestone chưa ở trạng thái chờ kích hoạt.'
          : workflow.currentMilestoneIndex !== String(indexed.index) ? 'Milestone hiện tại đã thay đổi. Tải lại dữ liệu.'
            : indexed.deadline === 0n || BigInt(workflow.chainTimestamp) >= indexed.deadline ? 'Đã quá hạn kích hoạt theo chain. Xem bước chốt thất bại/hoàn tiền trên trang công khai.' : '')

  function savePending(value: Pending) { localStorage.setItem(pendingKey, JSON.stringify(value)); setPending(value) }

  async function execute() {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setProgress('Đang đối chiếu campaign và ví tổ chức…')
    try {
      if (!session || !client || !wallet || !account.address || !account.connector) throw new Error('Đăng nhập và kết nối ví đại diện tổ chức.')
      const connectorUid = account.connector.uid
      assertWalletRequestAvailable(connectorUid)
      const expected = { address: account.address, chainId: account.chainId, connectorUid, userId: session.userId }
      function checkWallet() {
        if (!mounted.current) throw new Error('Đã rời trang campaign. Mở lại để đối chiếu giao dịch.')
        const active = getAccount(config)
        assertWalletConnection(expected, { ...active, connectorUid: active.connector?.uid, userId: currentUserId.current })
      }
      checkWallet()
      if (account.chainId !== plan.chainId) {
        setProgress(`Đang chờ ${account.connector.name} chuyển sang mạng ${plan.chainId}…`)
        await requestWalletConfirmation({ connectorUid, request: () => switchChainAsync({ chainId: plan.chainId }) })
        throw new Error('Đã chuyển mạng. Bấm lại để đối chiếu ví trước khi ký.')
      }
      if (account.address.toLowerCase() !== plan.organizer.toLowerCase()
        || (await wallet.getAddresses())[0]?.toLowerCase() !== plan.organizer.toLowerCase()
        || await wallet.getChainId() !== plan.chainId) throw new Error(`Chọn ví đại diện tổ chức ${plan.organizer} trên mạng ${plan.chainId}.`)
      await verifyWalletDeployment(wallet, plan)
      checkWallet()
      const id = BigInt(onchainCampaignId)
      const index = BigInt(indexed.index)
      async function reconcile(value: Pending) {
        setProgress('Đang kiểm tra giao dịch kích hoạt milestone…')
        let cancelled = Boolean(value.cancelled)
        const receipt = await client!.waitForTransactionReceipt({ hash: value.hash, confirmations: plan.confirmations, timeout: 90_000,
          onReplaced: replacement => {
            cancelled ||= replacement.reason === 'cancelled'
            value = { hash: replacement.transaction.hash, cancelled }
            savePending(value)
          } })
        if (cancelled || receipt.status !== 'success') {
          localStorage.removeItem(pendingKey); setPending(null)
          throw new Error(cancelled ? 'Giao dịch đã bị hủy trong ví.' : 'Giao dịch bị revert; milestone chưa được kích hoạt.')
        }
        const found = receipt.logs.some(log => {
          if (log.address.toLowerCase() !== plan.contractAddress.toLowerCase()) return false
          try {
            const event = decodeEventLog({ abi, data: log.data, topics: log.topics })
            const args = event.args as { campaignId?: bigint; milestoneIndex?: bigint; budget?: bigint }
            return event.eventName === 'MilestoneActivated' && args.campaignId === id
              && args.milestoneIndex === index && args.budget === BigInt(plan.budgetUnits[indexed.index])
          } catch { return false }
        })
        if (!found) throw new Error('Receipt không có sự kiện kích hoạt đúng milestone. Cần đối chiếu trước khi thử lại.')
        savePending({ ...value, receiptBlock: receipt.blockNumber.toString() })
        setProgress('Giao dịch đã xác nhận. Đang chờ indexer đồng bộ…')
        onRefresh()
      }
      if (pending) { if (!pending.receiptBlock) await reconcile(pending); else onRefresh(); return }

      const [fresh, publicCampaign] = await Promise.all([getPublication(campaignId), getPublicCampaign(campaignId)])
      if (!fresh.published || fresh.state !== projection.state || !['FUNDED', 'MILESTONE_SETTLED'].includes(fresh.state ?? '')
        || publicCampaign.campaign.onchainCampaignId !== onchainCampaignId
        || publicCampaign.campaign.contractAddress.toLowerCase() !== plan.contractAddress.toLowerCase()
        || publicCampaign.campaign.organizer.toLowerCase() !== plan.organizer.toLowerCase())
        throw new Error('Trạng thái hoặc danh tính campaign đã thay đổi. Tải lại hồ sơ.')
      const block = await client.getBlock({ blockTag: 'latest' })
      const [state, currentIndex, deadline, campaign, milestone, criteria, keyed, gas] = await Promise.all([
        client.readContract({ address: plan.contractAddress, abi, functionName: 'campaignState', args: [id], blockNumber: block.number }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'currentMilestoneIndex', args: [id], blockNumber: block.number }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'activationDeadlines', args: [id], blockNumber: block.number }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'campaigns', args: [id], blockNumber: block.number }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'milestones', args: [id, index], blockNumber: block.number }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'milestoneCriteria', args: [id, index], blockNumber: block.number }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'campaignForDraft', args: [plan.organizer, plan.draftKey], blockNumber: block.number }),
        client.getBalance({ address: account.address, blockNumber: block.number }),
      ])
      const [title, token, goal, bond, organizer, locked, bondAmount] = campaign as [string, Address, bigint, bigint, Address, boolean, bigint]
      const [budget, milestoneState] = milestone as [bigint, number]
      if (keyed !== id + 1n || title !== plan.title || String(token).toLowerCase() !== plan.tokenAddress.toLowerCase()
        || String(organizer).toLowerCase() !== plan.organizer.toLowerCase() || goal !== BigInt(plan.goalUnits)
        || bond !== BigInt(plan.bondUnits) || !locked || bondAmount < budget || budget !== BigInt(plan.budgetUnits[indexed.index])
        || String(criteria).toLowerCase() !== plan.criteriaHashes[indexed.index].toLowerCase())
        throw new Error('Campaign, bond hoặc milestone trên chain không khớp kế hoạch đã chốt.')
      if (![3, 9].includes(Number(state)) || currentIndex !== index || Number(milestoneState) !== 0 || block.timestamp >= (deadline as bigint))
        throw new Error('Milestone chưa sẵn sàng hoặc đã quá hạn kích hoạt.')
      if (gas === 0n) throw new Error('Ví tổ chức chưa có ETH Foundry để trả phí gas.')
      const simulation = await client.simulateContract({ account: plan.organizer, address: plan.contractAddress, abi,
        functionName: 'activateMilestone', args: [id, index], blockNumber: block.number })
      const again = await getPublication(campaignId)
      if (!again.published || again.state !== fresh.state) throw new Error('Trạng thái đã thay đổi trước khi ký. Tải lại hồ sơ.')
      await verifyWalletDeployment(wallet, plan)
      checkWallet()
      if ((await wallet.getAddresses())[0]?.toLowerCase() !== plan.organizer.toLowerCase()
        || await wallet.getChainId() !== plan.chainId) throw new Error('Ví đã thay đổi trước khi ký.')
      if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Block đã thay đổi trước khi ký.')
      setProgress(`Đang chờ ${account.connector.name} ký kích hoạt milestone ${indexed.index + 1}…`)
      setWaitingWallet(true)
      await requestWalletConfirmation({ connectorUid, request: () => { checkWallet(); return wallet.writeContract(simulation.request) },
        onResult: (hash, late) => {
          savePending({ hash })
          if (late) setProgress('Ví vừa trả hash sau thời gian chờ. Bấm tiếp tục kiểm tra; chưa gửi giao dịch khác.')
        } }).then(hash => reconcile({ hash }))
    } catch (cause) {
      setProgress('')
      setError(cause instanceof BaseError
        ? cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
          ? 'Bạn đã từ chối giao dịch trong ví.' : cause.shortMessage
        : getErrorMessage(cause))
    } finally { running.current = false; setBusy(false); setWaitingWallet(false) }
  }

  return <section className="panel" aria-labelledby="milestone-activation-title">
    <h2 id="milestone-activation-title">Kích hoạt milestone {indexed.index + 1}</h2>
    <p>Ngân sách: {formatUnits(BigInt(plan.budgetUnits[indexed.index]), deployment.tokenDecimals)} MockUSDC · ví đại diện: <code>{plan.organizer}</code></p>
    {indexed.deadline > 0n && <p>Hạn kích hoạt: {new Date(Number(indexed.deadline) * 1000).toLocaleString('vi-VN')}</p>}
    <p className="muted">Kích hoạt chỉ bắt đầu thời hạn nộp bằng chứng; chưa giải ngân milestone.</p>
    {(busy || pending) && <TransactionSteps operation={`Kích hoạt milestone ${indexed.index + 1}`}
      stage={confirmed ? 'indexed' : pending?.receiptBlock ? 'receipt' : pending ? 'submitted' : waitingWallet ? 'wallet' : 'idle'}
      hash={pending?.hash} receiptBlock={pending?.receiptBlock} />}
    {confirmed ? <p className="toast toast--success" role="status">Milestone đã kích hoạt và indexer đã đồng bộ. Tổ chức có thể chuẩn bị hồ sơ bằng chứng.</p>
      : <>
        <ConnectButton showBalance={false} />
        {progress && <p role="status">{progress}</p>}
        {pending && <p className="public-wallet-address">Giao dịch: <code>{pending.hash}</code>{pending.receiptBlock ? ` · xác nhận ở block ${pending.receiptBlock}, chờ indexer` : ' · chờ receipt'}</p>}
        {['FUNDED', 'MILESTONE_SETTLED'].includes(projection.state ?? '') || pending
          ? <button className="button button--primary" disabled={Boolean(activationReason)} aria-describedby="activation-reason" onClick={() => void execute()}>
            {busy ? 'Đang xử lý…' : pending ? 'Tiếp tục kiểm tra giao dịch' : `Kích hoạt milestone ${indexed.index + 1} bằng ví tổ chức`}</button>
          : <p>Đang chờ trạng thái milestone được đồng bộ.</p>}
        <p id="activation-reason" className="muted">{activationReason || 'Đủ điều kiện hiển thị. Trước khi mở ví, hệ thống kiểm tra lại quyền, bond, số dư ETH và deadline trên chain.'}</p>
        {walletReason && <a href="#/account">Mở tài khoản và liên kết ví</a>}
      </>}
    {error && <p role="alert">{error}</p>}
  </section>
}
