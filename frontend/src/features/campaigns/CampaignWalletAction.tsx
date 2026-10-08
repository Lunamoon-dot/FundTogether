import { useEffect, useRef, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConfig, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { BaseError, UserRejectedRequestError, keccak256 } from 'viem'
import type { Abi, Address, Hash } from 'viem'
import generatedAbi from '../../../../backend/src/blockchain/generated/fund-together.abi.json'
import deployment from '../../../../backend/src/blockchain/generated/deployment.local.json'
import type { SubmissionPlan } from '../../lib/api/campaign-submission'
import { getErrorMessage } from '../../lib/api/error'
import { assertCampaignActionIdentity, campaignActionIdentityKey, isCampaignActionIndexed, runCampaignAction, verifyCampaignActionSnapshot } from '../../lib/web3/campaign-action'
import type { CampaignAction, CampaignActionIdentity } from '../../lib/web3/campaign-action'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../../lib/web3/wallet-confirmation'
import { assertWalletConnection, verifyWalletDeployment } from '../../lib/web3/wallet-identity'
import { useAccountSession } from '../auth/AccountSessionProvider'

const abi = generatedAbi as Abi

export function CampaignWalletAction({ action, campaignId, onchainCampaignId, plan, actor, projection, authorize, onRefresh }: {
  action: CampaignAction
  campaignId: string
  onchainCampaignId: string
  plan: SubmissionPlan
  actor: Address
  projection: { state: string | null; indexedBlock: string | null }
  authorize: () => Promise<CampaignActionIdentity>
  onRefresh: () => void
}) {
  const account = useAccount()
  const config = useConfig()
  const { session } = useAccountSession()
  const currentUserId = useRef(session?.userId ?? null)
  useEffect(() => { currentUserId.current = session?.userId ?? null }, [session?.userId])
  const client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const { switchChainAsync } = useSwitchChain()
  const pendingKey = `ft-${action}:${plan.genesisHash}:${plan.contractAddress}:${campaignId}${plan.deploymentBlockHash ? `:${plan.deploymentBlockHash}` : ''}`
  const [transaction, setTransaction] = useState<Hash | null>(() => localStorage.getItem(pendingKey) as Hash | null)
  const [receiptBlock, setReceiptBlock] = useState<bigint>()
  const [reconciledIdentity, setReconciledIdentity] = useState<string>()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const identity = { plan, onchainCampaignId, actor }
  const identityKey = campaignActionIdentityKey(identity)
  const indexed = (!transaction || reconciledIdentity === identityKey) && isCampaignActionIndexed(action, projection, receiptBlock)

  useEffect(() => {
    if (indexed) { localStorage.removeItem(pendingKey); localStorage.removeItem(`${pendingKey}:cancelled`) }
  }, [indexed, pendingKey])

  async function execute(discardPending = false) {
    if (running.current) return
    running.current = true
    setBusy(true); setError(''); setProgress('Đang đối chiếu quyền và trạng thái campaign…')
    try {
      if (!client || !wallet || !account.address || !account.connector || !session) throw new Error('Đăng nhập và kết nối ví để tiếp tục.')
      const connectorUid = account.connector.uid
      assertWalletRequestAvailable(connectorUid)
      const expected = { address: account.address, chainId: account.chainId, connectorUid, userId: session.userId }
      function checkConnection() {
        if (!mounted.current) throw new Error('Đã rời màn hình campaign. Mở lại hồ sơ để đối chiếu trước khi ký tiếp.')
        const active = getAccount(config)
        assertWalletConnection(expected, { ...active, connectorUid: active.connector?.uid, userId: currentUserId.current })
      }
      checkConnection()
      if (account.chainId !== plan.chainId) {
        setProgress(`Đang chờ ${account.connector.name} xác nhận chuyển mạng; mở extension để xử lý.`)
        await requestWalletConfirmation({ connectorUid, request: () => switchChainAsync({ chainId: plan.chainId }) })
        throw new Error('Đã chuyển mạng. Bấm tiếp tục để đối chiếu lại kết nối ví.')
      }
      async function authorizeFresh() { assertCampaignActionIdentity(identity, await authorize()) }
      await authorizeFresh()
      if (plan.chainId !== deployment.chainId || plan.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase() || plan.tokenAddress.toLowerCase() !== deployment.tokenAddress.toLowerCase() || plan.genesisHash !== deployment.genesisHash || plan.contractCodeHash !== deployment.contractCodeHash || plan.tokenCodeHash !== deployment.tokenCodeHash)
        throw new Error('Kế hoạch thuộc deployment khác. Tải lại cấu hình trước khi ký.')
      const [chainId, genesis, code, tokenCode, resolver] = await Promise.all([
        client.getChainId(), client.getBlock({ blockNumber: 0n }),
        client.getCode({ address: plan.contractAddress }), client.getCode({ address: plan.tokenAddress }),
        client.readContract({ address: plan.contractAddress, abi, functionName: 'resolver' }),
      ])
      if (chainId !== plan.chainId || genesis.hash !== plan.genesisHash || !code || !tokenCode || keccak256(code) !== plan.contractCodeHash || keccak256(tokenCode) !== plan.tokenCodeHash)
        throw new Error('RPC hoặc deployment đã thay đổi. Chưa thể ký giao dịch.')
      if (action === 'approve' && String(resolver).toLowerCase() !== actor.toLowerCase())
        throw new Error('Resolver trên chain không khớp quyền duyệt do backend xác nhận.')
      const snapshot = () => verifyCampaignActionSnapshot(identity, action, {
        getBlock: options => client.getBlock(options),
        read: (functionName, args, blockNumber) => client.readContract({ address: plan.contractAddress, abi, functionName, args, blockNumber }),
      })
      async function checkWallet() {
        checkConnection()
        const addresses = await wallet!.getAddresses()
        if (addresses[0]?.toLowerCase() !== actor.toLowerCase() || await wallet!.getChainId() !== plan.chainId)
          throw new Error(`Ví hoặc mạng chưa đúng. Dùng ví ${action === 'approve' ? 'resolver' : 'đại diện tổ chức'} ${actor} trên mạng ${plan.chainId}.`)
        checkConnection()
      }
      if (discardPending) {
        await checkWallet()
        await snapshot()
        localStorage.removeItem(pendingKey); localStorage.removeItem(`${pendingKey}:cancelled`); setTransaction(null)
      }
      const result = await runCampaignAction(action, {
        authorize: authorizeFresh,
        readState: async () => (await snapshot()).state,
        loadPending: () => localStorage.getItem(pendingKey) as Hash | null,
        savePending: hash => { localStorage.setItem(pendingKey, hash); setTransaction(hash) },
        clearPending: () => { localStorage.removeItem(pendingKey); localStorage.removeItem(`${pendingKey}:cancelled`); setTransaction(null) },
        send: async () => {
          await checkWallet()
          const checked = await snapshot()
          const simulation = await client.simulateContract({ account: actor, address: plan.contractAddress, abi,
            functionName: action === 'approve' ? 'approveCampaign' : action === 'cancel' ? 'cancelCampaign' : 'publishCampaign', args: [BigInt(onchainCampaignId)], blockNumber: checked.blockNumber })
          await authorizeFresh()
          await verifyWalletDeployment(wallet, plan)
          await checkWallet()
          if ((await client.getBlock({ blockNumber: checked.blockNumber })).hash !== checked.blockHash)
            throw new Error('Block đã thay đổi trước khi ký. Tải lại hồ sơ để đối chiếu.')
          setProgress(`Đang chờ ${account.connector!.name} xác nhận giao dịch; mở extension để ký hoặc từ chối. Giới hạn chờ 90 giây.`)
          return requestWalletConfirmation({
            connectorUid,
            request: () => { checkConnection(); return wallet.writeContract(simulation.request) },
            onResult: (hash, late) => {
              localStorage.setItem(pendingKey, hash)
              localStorage.removeItem(`${pendingKey}:cancelled`)
              setTransaction(hash)
              if (late) { setError(''); setProgress('Ví vừa trả hash sau thời gian chờ. Bấm tiếp tục kiểm tra giao dịch để đối chiếu; chưa gửi giao dịch khác.') }
            },
          })
        },
        wait: async hash => {
          setTransaction(hash)
          setProgress('Giao dịch đã gửi. Đang chờ receipt và xác nhận…')
          let cancelled = localStorage.getItem(`${pendingKey}:cancelled`) === 'true'
          const receipt = await client.waitForTransactionReceipt({ hash, confirmations: plan.confirmations, timeout: 90_000,
            onReplaced: replacement => {
              cancelled ||= replacement.reason === 'cancelled'
              localStorage.setItem(pendingKey, replacement.transaction.hash); setTransaction(replacement.transaction.hash)
              localStorage.setItem(`${pendingKey}:cancelled`, String(cancelled))
            } })
          return { status: cancelled ? 'cancelled' : receipt.status, blockNumber: receipt.blockNumber }
        },
      })
      if (!mounted.current) return
      setReceiptBlock(result.receiptBlock)
      setReconciledIdentity(campaignActionIdentityKey(identity))
      setProgress(result.receiptBlock !== undefined
        ? 'Giao dịch đã xác nhận. Đang chờ indexer đồng bộ; chưa hoàn tất trên ứng dụng.'
        : 'Chain đã ghi nhận thao tác này. Đang đối chiếu dữ liệu indexer.')
      onRefresh()
    } catch (cause) {
      setProgress('')
      setError(cause instanceof BaseError
        ? cause.walk(item => item instanceof UserRejectedRequestError) instanceof UserRejectedRequestError
          ? 'Bạn đã từ chối giao dịch trong ví. Có thể tiếp tục khi sẵn sàng.'
          : `Không thực hiện được giao dịch: ${cause.shortMessage}. Nếu đã có hash, tiến trình sẽ tiếp tục chờ receipt khi thử lại.`
        : getErrorMessage(cause))
      onRefresh()
    } finally { running.current = false; setBusy(false) }
  }

  return <div className="campaign-wallet-action">
    <ConnectButton showBalance={false} />
    <p>Ví {action === 'approve' ? 'resolver' : 'đại diện'}: <code>{actor}</code> · mạng {plan.chainId}</p>
    {indexed ? <p className="toast toast--success" role="status">{action === 'cancel' ? 'Đã hủy và đồng bộ. Bond được contract trả về ví organizer.' : action === 'approve' && projection.state === 'APPROVED' ? 'Đã duyệt và đồng bộ. Organizer có thể công bố campaign.' : 'Campaign đã được công bố và đồng bộ vào dữ liệu công khai.'}</p>
      : <>
        {progress && <p role="status">{progress}</p>}
        <button className="button button--primary" disabled={busy || !account.address} onClick={() => void execute()}>
          {busy ? 'Đang xử lý…' : transaction ? 'Tiếp tục kiểm tra giao dịch' : action === 'approve' ? 'Duyệt campaign bằng ví resolver' : action === 'cancel' ? 'Hủy campaign và nhận lại bond' : 'Công bố campaign bằng ví tổ chức'}
        </button>
        {transaction && <><p className="muted">Nếu hash cũ không còn receipt, có thể bỏ theo dõi và đối chiếu để thử lại. Giao dịch cũ vẫn có thể được mine; giao dịch còn lại có thể revert và tốn thêm phí. Có thể hủy hoặc thay thế giao dịch trong ví trước.</p>
          <button className="button button--secondary" disabled={busy || !account.address} onClick={() => void execute(true)}>Bỏ theo dõi hash và thử lại (có thể tốn thêm phí)</button></>}
      </>}
    {transaction && <p className="public-wallet-address">Hash: <code>{transaction}</code></p>}
    {error && <p role="alert">{error}</p>}
    {!indexed && <p className="muted">Receipt thành công vẫn cần indexer xác nhận trạng thái và block tương ứng.</p>}
  </div>
}
