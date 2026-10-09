import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConfig, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { BaseError, UserRejectedRequestError, erc20Abi, formatUnits, keccak256, zeroHash } from 'viem'
import type { Abi, Hash, Hex, Address } from 'viem'
import generatedAbi from '../../../../backend/src/blockchain/generated/fund-together.abi.json'
import deployment from '../../lib/web3/deployment-context'
import { getSubmission, prepareSubmission, syncSubmission } from '../../lib/api/campaign-submission'
import type { SubmissionPlan, SubmissionStatus } from '../../lib/api/campaign-submission'
import type { CampaignDraftDetail } from '../../lib/api/campaigns'
import { listOrganizations } from '../../lib/api/organizations'
import { getErrorMessage } from '../../lib/api/error'
import { waitForSubmissionReceipt } from '../../lib/web3/submission-receipt'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../../lib/web3/wallet-confirmation'
import { assertWalletConnection, verifyWalletDeployment } from '../../lib/web3/wallet-identity'
import { useAccountSession } from '../auth/AccountSessionProvider'

const abi = generatedAbi as Abi
const atomicSubmission = 'atomicSubmission' in deployment && deployment.atomicSubmission === true
const stageLabels: Record<string, string> = {
  prepared: 'Đã chốt kế hoạch, chưa tạo on-chain', created: 'Đã tạo campaign, đang ghi tiêu chí',
  criteria_ready: 'Đã ghi tiêu chí, chưa khóa bond', bond_locked: 'Bond đã khóa, chờ duyệt',
  approved: 'Đã duyệt', published: 'Đã công bố hoặc đã đi tiếp', terminated: 'Campaign đã kết thúc',
}
export function CampaignSubmission({ campaign, ensureCampaign, onBusyChange, onPrepared, onComplete }: {
  campaign?: CampaignDraftDetail
  ensureCampaign?: () => Promise<CampaignDraftDetail | undefined>
  onBusyChange?: (busy: boolean) => void
  onPrepared?: (campaign: CampaignDraftDetail) => void
  onComplete?: (campaignId: string) => void
}) {
  const account = useAccount()
  const config = useConfig()
  const { session } = useAccountSession()
  const currentUserId = useRef(session?.userId ?? null)
  useEffect(() => { currentUserId.current = session?.userId ?? null }, [session?.userId])
  const client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const { switchChainAsync } = useSwitchChain()
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [transaction, setTransaction] = useState<Hash | null>(null)
  const [localPlan, setLocalPlan] = useState<SubmissionPlan | null>(null)
  const [status, setStatus] = useState<SubmissionStatus | null>(null)
  const query = useQuery({ queryKey: ['campaign-submission', session?.userId, campaign?.id], queryFn: () => getSubmission(campaign!.id), enabled: Boolean(campaign && session), retry: false })
  const plan = localPlan ?? query.data
  useEffect(() => {
    if (query.data && campaign?.status === 'draft') onPrepared?.({ ...campaign, status: 'submission_prepared' })
  }, [query.data, campaign, onPrepared])
  const missingBudgets = Boolean(campaign?.milestones.some(item => !item.budgetUnits))
  const done = Boolean((status?.bondLocked && status?.criteriaReady) || status?.stage === 'published' || status?.stage === 'terminated')

  async function refresh() {
    if (!campaign) return
    try { setError(''); setStatus(await syncSubmission(campaign.id)) }
    catch (cause) { setError(getErrorMessage(cause)) }
  }

  async function submit() {
    if (running.current) return
    running.current = true
    setBusy(true); onBusyChange?.(true); setError(''); setProgress('Đang kiểm tra ví và kế hoạch nộp…')
    let currentCampaign = campaign
    try {
      if (!wallet || !client || !account.address || !account.connector || !session) throw new Error('Đăng nhập và kết nối ví đại diện tổ chức trước khi nộp.')
      const connectorUid = account.connector.uid
      assertWalletRequestAvailable(connectorUid)
      const expected = { address: account.address, chainId: account.chainId, connectorUid, userId: session.userId }
      function checkConnection() {
        if (!mounted.current) throw new Error('Đã rời màn hình nộp campaign. Mở lại tiến trình để đối chiếu trước khi ký tiếp.')
        const active = getAccount(config)
        assertWalletConnection(expected, { ...active, connectorUid: active.connector?.uid, userId: currentUserId.current })
      }
      checkConnection()
      if (account.chainId !== deployment.chainId) {
        setProgress(`Đang chờ ${account.connector.name} xác nhận chuyển mạng; mở extension để xử lý.`)
        await requestWalletConfirmation({ connectorUid, request: () => switchChainAsync({ chainId: deployment.chainId }) })
        throw new Error('Đã chuyển mạng. Bấm tiếp tục để dùng kết nối ví mới.')
      }
      // Refuse stale local deployments before freezing the plan or requesting a signature.
      const [genesis, code, tokenCode] = await Promise.all([client.getBlock({ blockNumber: 0n }), client.getCode({ address: deployment.contractAddress as `0x${string}` }), client.getCode({ address: deployment.tokenAddress as `0x${string}` })])
      if (genesis.hash !== deployment.genesisHash || !code || !tokenCode || keccak256(code) !== deployment.contractCodeHash || keccak256(tokenCode) !== deployment.tokenCodeHash) throw new Error('Deployment local đã thay đổi. Tải lại cấu hình trước khi nộp.')
      await verifyWalletDeployment(wallet, { ...deployment, contractAddress: deployment.contractAddress as Address,
        tokenAddress: deployment.tokenAddress as Address, genesisHash: deployment.genesisHash as Hex,
        contractCodeHash: deployment.contractCodeHash as Hex, tokenCodeHash: deployment.tokenCodeHash as Hex })
      checkConnection()
      currentCampaign = plan ? campaign : ensureCampaign ? await ensureCampaign() : campaign
      if (!currentCampaign) throw new Error('Chưa lưu được campaign.')
      if (!plan) {
        const organization = (await listOrganizations()).find(item => item.id === currentCampaign!.organizationId)
        if (!organization?.representativeWallet || organization.representativeWallet.address.toLowerCase() !== account.address.toLowerCase() || organization.representativeWallet.chainId !== deployment.chainId)
          throw new Error('Kết nối đúng ví đại diện tổ chức trên mạng local trước khi nộp.')
      }
      let currentPlan = plan
      if (!currentPlan) {
        const seconds = Math.floor(new Date(deadline).getTime() / 1000)
        if (!Number.isSafeInteger(seconds) || seconds <= Date.now() / 1000) throw new Error('Chọn hạn đóng góp trong tương lai.')
        currentPlan = await prepareSubmission(currentCampaign.id, currentCampaign.revision, seconds)
      }
      setLocalPlan(currentPlan)
      onPrepared?.({ ...currentCampaign, status: 'submission_prepared' })
      if (currentPlan.organizer.toLowerCase() !== account.address.toLowerCase()) throw new Error('Ví đang kết nối không phải ví đại diện tổ chức. Chuyển sang đúng ví để tiếp tục.')
      if (currentPlan.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase() || currentPlan.tokenAddress.toLowerCase() !== deployment.tokenAddress.toLowerCase() || currentPlan.genesisHash !== deployment.genesisHash
        || currentPlan.contractCodeHash !== deployment.contractCodeHash || currentPlan.tokenCodeHash !== deployment.tokenCodeHash
        || currentPlan.deploymentBlockHash !== ('deploymentBlockHash' in deployment ? deployment.deploymentBlockHash : undefined)) throw new Error('Kế hoạch nộp thuộc deployment khác.')
      const pendingKey = `ft-submission:${currentPlan.genesisHash}:${currentPlan.contractAddress}:${currentCampaign.id}${currentPlan.deploymentBlockHash ? `:${currentPlan.deploymentBlockHash}` : ''}`
      async function wait(hash: Hash) {
        setTransaction(hash); setProgress('Đã gửi giao dịch. Đang chờ receipt và xác nhận…')
        await waitForSubmissionReceipt(hash, {
          wait: (pendingHash, onReplaced) => client!.waitForTransactionReceipt({ hash: pendingHash, confirmations: currentPlan!.confirmations, timeout: 90_000, onReplaced }),
          savePending: (replacement, cancelled) => { localStorage.setItem(pendingKey, replacement)
            localStorage.setItem(`${pendingKey}:cancelled`, String(cancelled)); setTransaction(replacement) },
          clearPending: () => { localStorage.removeItem(pendingKey); localStorage.removeItem(`${pendingKey}:cancelled`) },
          cancelled: localStorage.getItem(`${pendingKey}:cancelled`) === 'true',
        })
        checkConnection()
        setProgress('Giao dịch đã xác nhận. Đang đối chiếu trạng thái on-chain…')
      }
      const pending = localStorage.getItem(pendingKey)
      if (pending) await wait(pending as Hash)
      async function checkWallet() {
        checkConnection()
        const addresses = await wallet!.getAddresses()
        if (addresses[0]?.toLowerCase() !== currentPlan!.organizer.toLowerCase() || await wallet!.getChainId() !== currentPlan!.chainId) throw new Error('Ví hoặc mạng đã thay đổi. Kết nối lại ví đại diện để tiếp tục.')
        checkConnection()
      }
      async function send(functionName: string, args: unknown[], token = false) {
        // Re-check the active wallet at every prompt; an account switch must stop the journey.
        await checkWallet()
        setProgress('Đang mô phỏng giao dịch trước khi ký…')
        const simulation = await client!.simulateContract({ account: currentPlan!.organizer, address: token ? currentPlan!.tokenAddress : currentPlan!.contractAddress, abi: (token ? erc20Abi : abi) as Abi, functionName, args })
        await verifyWalletDeployment(wallet!, currentPlan!)
        await checkWallet()
        setProgress(`Đang chờ ${account.connector!.name} xác nhận ${token ? 'quyền dùng token' : 'giao dịch campaign'}; mở extension để ký hoặc từ chối. Giới hạn chờ 90 giây.`)
        const hash = await requestWalletConfirmation({
          connectorUid,
          request: () => { checkConnection(); return wallet!.writeContract(simulation.request) },
          onResult: (hash, late) => {
            localStorage.setItem(pendingKey, hash)
            localStorage.removeItem(`${pendingKey}:cancelled`)
            setTransaction(hash)
            if (late) { setError(''); setProgress('Ví vừa trả hash sau thời gian chờ. Bấm tiếp tục để kiểm tra giao dịch; chưa gửi thêm giao dịch.') }
          },
        })
        await wait(hash)
      }
      const read = (functionName: string, args: unknown[]) => client!.readContract({ address: currentPlan!.contractAddress, abi, functionName, args })
      let synced = await syncSubmission(currentCampaign.id)
      checkConnection()
      setStatus(synced)
      if (synced.stage === 'published') { setProgress('Campaign đã publish hoặc đã đi tiếp trong giao thức.'); onComplete?.(currentCampaign.id); return }
      if (synced.stage === 'terminated') throw new Error('Campaign đã kết thúc. Không thể tiếp tục nộp.')
      if (!synced.bondLocked) {
        const amount = BigInt(currentPlan.bondUnits)
        const balance = await client.readContract({ address: currentPlan.tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [currentPlan.organizer] })
        if (balance < amount) throw new Error(`Chưa nộp hoàn tất. Bond cần ${formatUnits(amount, 6)} MockUSDC; ví có ${formatUnits(balance, 6)}, thiếu ${formatUnits(amount - balance, 6)}. Chưa gửi thêm giao dịch.`)
      }
      if (synced.onchainCampaignId === null) {
        if (atomicSubmission) {
          const amount = BigInt(currentPlan.bondUnits)
          const allowance = await client.readContract({ address: currentPlan.tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [currentPlan.organizer, currentPlan.contractAddress] })
          if (allowance < amount) {
            setProgress('Cấp quyền dùng token để khóa bond…')
            await send('approve', [currentPlan.contractAddress, amount], true)
          }
          setProgress('Tạo campaign, ghi tiêu chí và khóa bond trong một giao dịch…')
          await send('submitCampaignForDraft', [currentPlan.draftKey, currentPlan.title, BigInt(currentPlan.fundingDeadline), currentPlan.budgetUnits.map(BigInt), currentPlan.criteriaHashes])
        } else {
          setProgress('Tạo campaign trên deployment cũ…')
          await send('createCampaignForDraft', [currentPlan.draftKey, currentPlan.title, BigInt(currentPlan.fundingDeadline), currentPlan.budgetUnits.map(BigInt)])
        }
        synced = await syncSubmission(currentCampaign.id); setStatus(synced)
      }
      if (synced.onchainCampaignId === null) throw new Error('Chưa xác nhận được campaign on-chain. Thử đối chiếu lại.')
      const id = BigInt(synced.onchainCampaignId)
      for (let i = 0; i < currentPlan.criteriaHashes.length; i++) {
        const hash = await read('milestoneCriteria', [id, BigInt(i)])
        if (hash === currentPlan.criteriaHashes[i]) continue
        if (hash !== zeroHash) throw new Error('Tiêu chí on-chain khác kế hoạch đã chốt.')
        setProgress(`Ghi tiêu chí milestone ${i + 1}…`)
        await send('configureMilestoneCriteria', [id, BigInt(i), currentPlan.criteriaHashes[i]])
      }
      synced = await syncSubmission(currentCampaign.id); setStatus(synced)
      if (!synced.bondLocked) {
        const amount = BigInt(currentPlan.bondUnits)
        const balance = await client.readContract({ address: currentPlan.tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [currentPlan.organizer] })
        if (balance < amount) throw new Error(`Ví cần ít nhất ${formatUnits(amount, 6)} MockUSDC để khóa bond.`)
        const allowance = await client.readContract({ address: currentPlan.tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [currentPlan.organizer, currentPlan.contractAddress] })
        if (allowance < amount) await send('approve', [currentPlan.contractAddress, amount], true)
        await send('lockBond', [id])
      }
      synced = await syncSubmission(currentCampaign.id); setStatus(synced)
      if (!synced.bondLocked || !synced.criteriaReady) throw new Error('Bond chưa được contract xác nhận. Đối chiếu lại trước khi tiếp tục.')
      checkConnection()
      setProgress('Bond đã khóa trong escrow. Campaign đang chờ resolver duyệt.')
      onComplete?.(currentCampaign.id)
    } catch (cause) {
      setProgress('')
      setError(cause instanceof BaseError
        ? cause.walk(error => error instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
          ? 'Bạn đã từ chối giao dịch trong ví. Tiến trình được giữ để tiếp tục sau.'
          : cause.shortMessage
        : getErrorMessage(cause))
      if (currentCampaign) void query.refetch()
    } finally { running.current = false; setBusy(false); onBusyChange?.(false) }
  }

  return <section className="panel wizard-panel" aria-labelledby="submission-title">
    <h2 id="submission-title">Nộp campaign & khóa bond</h2>
    <ConnectButton showBalance={false} />
    {!plan && <label>Hạn đóng góp <input type="datetime-local" value={deadline} disabled={busy} onChange={event => setDeadline(event.target.value)} /></label>}
    {plan ? <><p>Ví đại diện: <code>{plan.organizer}</code></p><p>Bond: {formatUnits(BigInt(plan.bondUnits), 6)} MockUSDC · mạng {plan.chainId}</p><p>Hạn đóng góp: {new Date(plan.fundingDeadline * 1000).toLocaleString('vi-VN')}</p></> : <p>Nộp sẽ chốt nội dung, ngân sách và hạn đóng góp.</p>}
    <p>{atomicSubmission
      ? 'Campaign mới cần tối đa hai giao dịch: cấp quyền dùng token nếu cần, rồi tạo campaign, ghi toàn bộ tiêu chí và khóa bond trong một giao dịch. Campaign đã tạo dở dùng các bước còn thiếu để tiếp tục.'
      : 'Deployment cũ dùng giao dịch tạo campaign, ghi tiêu chí từng milestone và khóa bond riêng. Chế độ nộp gộp cần deployment contract mới.'}</p>
    {query.isError && <p role="alert">{getErrorMessage(query.error)}</p>}
    {progress && <p role="status">{progress}</p>}
    {transaction && <p className="muted">Giao dịch: <code>{transaction}</code></p>}
    {status && <p>Trạng thái on-chain: {stageLabels[status.stage] ?? status.stage} · campaign ID: {status.onchainCampaignId ?? 'chưa tạo'}</p>}
    {error && <p role="alert">{error}</p>}
    {missingBudgets && <p role="alert">Bổ sung ngân sách cho tất cả milestones trước khi nộp.</p>}
    {!done && <button type="button" className="button button--primary" disabled={busy || missingBudgets || query.isFetching || !account.address || (!plan && !deadline)} onClick={() => void submit()}>{busy ? 'Đang xử lý…' : plan ? 'Tiếp tục nộp & khóa bond' : 'Nộp campaign & khóa bond'}</button>}
    {plan && campaign && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void refresh()}>Đối chiếu on-chain</button>}
    <p className="muted">Khóa bond thành công chưa công bố campaign. Resolver phải duyệt trước khi organizer publish.</p>
  </section>
}
