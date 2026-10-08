import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useConfig, usePublicClient, useWalletClient } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { formatUnits } from 'viem'
import type { Abi, Hash } from 'viem'
import abiJson from '../../../../backend/src/blockchain/generated/fund-together-mvp.abi.json'
import { milestoneActionReason } from '../../../../backend/src/modules/evidence/milestone-policy'
import type { MilestoneAction } from '../../../../backend/src/modules/evidence/milestone-policy'
import { getMilestoneDetail, prepareMilestoneAction, downloadMilestoneDocument, downloadPublicEvidenceManifest, getResolverOriginal, downloadResolverOriginal } from '../../lib/api/milestone-workflow'
import type { MilestoneDetail, PreparedMilestoneAction } from '../../lib/api/milestone-workflow'
import { getErrorMessage } from '../../lib/api/error'
import { assertWalletConnection, verifyWalletDeployment } from '../../lib/web3/wallet-identity'
import { requestWalletConfirmation } from '../../lib/web3/wallet-confirmation'
import { matchesMilestoneReceipt, milestoneCallArgs } from '../../lib/web3/milestone-action'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { TransactionSteps } from './TransactionSteps'

const abi = abiJson as Abi
const labels: Record<MilestoneAction, string> = { submit: 'Ký nộp bằng chứng', admit: 'Tiếp nhận · mở review 72 giờ', reject: 'Yêu cầu sửa hồ sơ',
  challenge: 'Phản đối bằng chứng', material: 'Bổ sung vào case', respond: 'Chốt giải trình', continue: 'Tiếp tục với hồ sơ hiện tại',
  resubmit: 'Yêu cầu nộp phiên bản mới', stop: 'Dừng và mở hoàn tiền', expire: 'Chốt quá hạn tiếp nhận', timeout: 'Chốt quá hạn xử lý',
  settle: 'Giải ngân milestone', bond: 'Nhận bond được trả' }
type Pending = { hash: Hash; action: MilestoneAction; call: PreparedMilestoneAction; receiptBlock?: string; cancelled?: boolean }
type Supported = Extract<MilestoneDetail, { supported: true }>
const when = (value: string) => BigInt(value) > 0n ? new Date(Number(value) * 1000).toLocaleString('vi-VN') : 'Chưa bắt đầu'
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function MilestoneWorkflow({ campaignId, index }: { campaignId: string; index: string }) {
  const { session } = useAccountSession()
  const detail = useQuery({ queryKey: ['milestone-workflow', session?.userId, campaignId, index],
    queryFn: ({ signal }) => getMilestoneDetail(campaignId, index, signal), enabled: Boolean(session), retry: false, refetchInterval: 10_000 })
  if (!session) return <section className="panel"><h2>Hoàn tất milestone</h2><p><a href="#/account">Đăng nhập</a> để đọc bằng chứng và thực hiện theo quyền của bạn.</p></section>
  if (detail.isPending) return <section className="panel"><p role="status">Đang đối chiếu milestone…</p></section>
  if (detail.isError) return <section className="panel"><p role="alert">{getErrorMessage(detail.error)}</p>
    <button className="button button--secondary" onClick={() => void detail.refetch()}>Thử lại</button></section>
  if (!detail.data.supported) return <section className="panel"><h2>Hoàn tất milestone</h2><p>{detail.data.reason}</p></section>
  return <MilestoneActions key={`${session.userId}:${campaignId}:${index}`} campaignId={campaignId} index={index}
    detail={detail.data} refresh={() => void detail.refetch()} userId={session.userId} />
}

function MilestoneActions({ campaignId, index, detail: d, refresh, userId }: {
  campaignId: string; index: string; detail: Supported; refresh: () => void; userId: string
}) {
  const account = useAccount(), config = useConfig()
  const client = usePublicClient({ chainId: d.plan.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const { session } = useAccountSession()
  const activeUser = useRef(session?.userId ?? null)
  useEffect(() => { activeUser.current = session?.userId ?? null }, [session?.userId])
  const alive = useRef(true), running = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const dossierKey = `${d.version}:${d.evidenceHash}`
  const [reviewInput, setReviewInput] = useState({ key: dossierKey, reason: '', acknowledged: false })
  const reason = reviewInput.key === dossierKey ? reviewInput.reason : ''
  const acknowledged = reviewInput.key === dossierKey && reviewInput.acknowledged
  const setReason = (value: string) => setReviewInput(v => ({ key: dossierKey, reason: value, acknowledged: v.key === dossierKey && v.acknowledged }))
  const setAcknowledged = (value: boolean) => setReviewInput(v => ({ key: dossierKey, reason: v.key === dossierKey ? v.reason : '', acknowledged: value }))
  const [publicationChoice, setPublicationChoice] = useState('')
  const [busy, setBusy] = useState(false), [waitingWallet, setWaitingWallet] = useState(false), [error, setError] = useState('')
  const pendingKey = `ft-milestone:${d.plan.genesisHash}:${d.plan.contractAddress}:${d.plan.deploymentBlockHash ?? ''}:${userId}:${campaignId}:${index}`
  const [pending, setPending] = useState<Pending | null>(() => {
    try { const value = JSON.parse(localStorage.getItem(pendingKey) ?? 'null') as Pending | null
      return value && /^0x[\da-f]{64}$/i.test(value.hash) && value.call.contractAddress.toLowerCase() === d.plan.contractAddress.toLowerCase() ? value : null
    } catch { return null }
  })
  const indexed = Boolean(pending?.receiptBlock && d.events.some(e => e.hash.toLowerCase() === pending.hash.toLowerCase()
    && e.name === pending.call.event && BigInt(e.block) >= BigInt(pending.receiptBlock!)
    && Object.entries(pending.call.expected).every(([key, value]) => String(e.args[key]).toLowerCase() === value.toLowerCase()))
    && (!pending.call.proof || d.events.some(e => e.hash.toLowerCase() === pending.hash.toLowerCase() && e.name === pending.call.proof!.event
      && Object.entries(pending.call.proof!.expected).every(([key, value]) => String(e.args[key]).toLowerCase() === value.toLowerCase()))))
  useEffect(() => { if (indexed) localStorage.removeItem(pendingKey) }, [indexed, pendingKey])
  const actor = d.roles.wallets.find(w => w.address.toLowerCase() === account.address?.toLowerCase())
  const selectedPublication = d.prepared.find(p => p.hash === publicationChoice) ?? d.prepared[0]
  const context = { state: d.state, timestamp: BigInt(d.chainTimestamp), version: d.version, evidenceDeadline: BigInt(d.evidenceDeadline),
    admissionDeadline: BigInt(d.admissionDeadline), reviewEnd: BigInt(d.reviewEnd), ...d.dispute,
    responseDeadline: BigInt(d.dispute.responseDeadline), resolutionDeadline: BigInt(d.dispute.resolutionDeadline), bond: BigInt(d.bondUnits),
    linked: Boolean(actor), organizer: Boolean(actor?.organizer), reviewer: Boolean(actor?.reviewer), donor: Boolean(actor?.donor), readable: Boolean(d.publication) }
  const donorAccount = d.roles.wallets.some(w => w.donor)
  const candidates: MilestoneAction[] = d.state === 6 ? d.roles.organizerAccount ? ['submit'] : []
    : d.state === 11 ? [...(d.roles.reviewer ? ['admit', 'reject'] as const : []), 'expire']
      : d.state === 7 ? [...(donorAccount ? ['challenge'] as const : []), 'settle']
        : d.state === 8 ? [...(donorAccount ? ['material'] as const : []), ...(d.roles.organizerAccount ? ['respond'] as const : []),
          ...(d.roles.reviewer ? ['continue', 'resubmit', 'stop'] as const : []), 'timeout'] : []
  if (d.roles.organizerAccount && BigInt(d.bondUnits) > 0n) candidates.push('bond')
  const needsReason = (a: MilestoneAction) => ['admit', 'reject', 'challenge', 'material', 'respond', 'continue', 'resubmit', 'stop'].includes(a)
  function blocker(action: MilestoneAction) {
    return busy ? 'Đang xử lý yêu cầu hiện tại.' : pending && !indexed ? 'Đang có giao dịch chưa đối chiếu xong; tiếp tục kiểm tra trước.'
      : !wallet || !client ? 'Kết nối ví để thực hiện.' : account.chainId !== d.plan.chainId ? `Chuyển ví sang mạng ${d.plan.chainId}.`
        : d.currentMilestoneIndex !== index && action !== 'bond' ? 'Milestone này không còn là milestone hiện tại.'
          : milestoneActionReason(action, context) || (action === 'submit' && !selectedPublication ? 'Chốt và chọn gói công khai trước khi ký nộp.'
            : needsReason(action) && (!acknowledged || reason.trim().length < 10) ? 'Nhập nhận xét ít nhất 10 ký tự và xác nhận đã kiểm tra.' : '')
  }
  function persist(value: Pending | null) {
    if (value) localStorage.setItem(pendingKey, JSON.stringify(value)); else localStorage.removeItem(pendingKey)
    if (alive.current) setPending(value)
  }
  async function execute(action?: MilestoneAction) {
    if (running.current || !client) return
    running.current = true; setBusy(true); setError('')
    try {
      const reconcile = async (value: Pending) => {
        let latest = value
        const receipt = await client.waitForTransactionReceipt({ hash: value.hash, confirmations: d.plan.confirmations, timeout: 90_000,
          onReplaced: replacement => {
            latest = { ...latest, hash: replacement.transaction.hash, cancelled: latest.cancelled || replacement.reason === 'cancelled' }
            persist(latest)
          } })
        if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Receipt thuộc block đã thay đổi; chờ đối chiếu lại.')
        if (receipt.status === 'reverted' || latest.cancelled) { persist(null); throw new Error('Giao dịch bị revert hoặc đã hủy. Quyền và trạng thái chưa đổi; tải lại để thử tiếp.') }
        if (!matchesMilestoneReceipt(receipt, abi, latest.call)) throw new Error('Receipt không có đúng sự kiện. Giữ hash để đối chiếu; không gửi lại.')
        persist({ ...latest, receiptBlock: String(receipt.blockNumber) }); refresh()
      }
      if (pending && !indexed) { await reconcile(pending); return }
      if (!action || !wallet || !account.address || !account.connector || blocker(action)) return
      persist(null)
      const expected = { address: account.address, chainId: d.plan.chainId, connectorUid: account.connector.uid, userId }
      const check = () => {
        if (!alive.current) throw new Error('Màn hình hoặc tài khoản đã thay đổi; mở lại để đối chiếu trước khi ký.')
        const current = getAccount(config); assertWalletConnection(expected, {
        address: current.address, chainId: current.chainId, connectorUid: current.connector?.uid, userId: activeUser.current }) }
      check()
      const call = await prepareMilestoneAction(campaignId, index, { action, wallet: account.address, expectedVersion: d.version,
        expectedEvidenceHash: d.evidenceHash, reason: needsReason(action) ? reason.trim() : labels[action], acknowledged: true,
        ...(action === 'submit' ? { publicationHash: selectedPublication?.hash } : {}) })
      if (call.contractAddress.toLowerCase() !== d.plan.contractAddress.toLowerCase() || call.wallet.toLowerCase() !== account.address.toLowerCase())
        throw new Error('Ví hoặc deployment trong kế hoạch đã thay đổi.')
      const args = milestoneCallArgs(abi, action, call, d.onchainCampaignId, index)
      await verifyWalletDeployment(wallet, d.plan)
      check()
      const simulation = await client.simulateContract({ account: account.address, address: d.plan.contractAddress, abi, functionName: call.functionName, args })
      if ((await client.getBlock({ blockNumber: BigInt(call.checkedBlock) })).hash !== call.checkedBlockHash) throw new Error('Block đối chiếu đã thay đổi.')
      if ((await wallet.getAddresses())[0]?.toLowerCase() !== account.address.toLowerCase() || await wallet.getChainId() !== d.plan.chainId) throw new Error('Ví đã đổi trước khi ký.')
      check(); setWaitingWallet(true)
      await requestWalletConfirmation({ connectorUid: account.connector.uid, request: () => { check(); return wallet.writeContract(simulation.request) },
        onResult: hash => persist({ hash, action, call }) }).then(hash => reconcile({ hash, action, call }))
      setReason(''); setAcknowledged(false)
    } catch (cause) { if (alive.current) setError(getErrorMessage(cause)) }
    finally { running.current = false; if (alive.current) { setBusy(false); setWaitingWallet(false) } }
  }
  async function download(hash: string, documentId: string, name: string, original = false, expectedHash = '') {
    try { setError(''); saveBlob(original ? await downloadResolverOriginal(campaignId, index, documentId)
      : await downloadMilestoneDocument(campaignId, index, hash, documentId, expectedHash), name) } catch (cause) { setError(getErrorMessage(cause)) }
  }
  const [originalRead, setOriginalRead] = useState<{ hash: string; documents: { documentId: string; originalName: string }[] } | null>(null)
  const originals = originalRead?.hash === d.evidenceHash ? originalRead.documents : null
  const needActor = d.state === 6 ? 'Organizer chuẩn bị và ký nộp bằng chứng' : d.state === 11 ? 'Resolver kiểm tra và tiếp nhận; bất kỳ ví chốt khi quá hạn'
    : d.state === 7 ? 'Donor đọc hồ sơ và phản đối trong 72 giờ; bất kỳ ví giải ngân sau hạn'
      : d.state === 8 ? BigInt(d.chainTimestamp) < BigInt(d.dispute.responseDeadline) ? 'Organizer giải trình và donor bổ sung trong 7 ngày'
        : BigInt(d.chainTimestamp) < BigInt(d.dispute.resolutionDeadline) ? 'Resolver đối chiếu và ra quyết định cuối'
          : 'Bất kỳ ví chốt quá hạn để mở hoàn tiền' : d.state === 10 ? 'Campaign hoàn tất; organizer nhận bond còn được trả' : 'Xem trạng thái campaign và phần hoàn tiền'
  return <section className="panel">
    <h2>Milestone {Number(index) + 1} · bằng chứng và giải ngân</h2>
    <p><strong>Đang chờ:</strong> {needActor}.</p>
    <p>Phiên bản {d.version}/3 · thời gian chain: {when(d.chainTimestamp)} · block {d.checkedBlock}.</p>
    <p>Ví tổ chức: <code>{d.plan.organizer}</code><br />Resolver MVP: <code>{d.roles.resolver}</code></p>
    <p>Hạn nộp: {when(d.evidenceDeadline)} · tiếp nhận: {when(d.admissionDeadline)} · donor review: {when(d.reviewEnd)}.</p>
    {BigInt(d.dispute.responseDeadline) > 0n && <p>Hạn giải trình: {when(d.dispute.responseDeadline)} · hạn xử lý: {when(d.dispute.resolutionDeadline)} · kết quả case: {['Chờ xử lý', 'Tiếp tục', 'Nộp lại', 'Dừng', 'Quá hạn'][d.dispute.resolution]}.</p>}
    <p>Ngân sách giải ngân: {formatUnits(BigInt(d.plan.budgetUnits[Number(index)]), d.tokenDecimals)} MockUSDC về ví tổ chức.
      Bond có thể nhận riêng: {formatUnits(BigInt(d.bondUnits), d.tokenDecimals)} MockUSDC.</p>
    {d.publication ? <div><h3>Bằng chứng đã nộp · phiên bản {d.version}</h3><p>{d.publication.manifest.summary}</p>
      <ul>{d.publication.manifest.outcomes.map(o => <li key={o.criterionId}>{o.criterionId}: {o.description}</li>)}</ul>
      <p>Hash bản công khai: <code>{d.publication.hash}</code> · commitment bản gốc: <code>{d.publication.manifest.privateCommitment}</code></p>
      {d.publication.manifest.documents.map(doc => <button key={doc.id} className="button button--secondary" onClick={() => void download(d.publication!.hash, doc.id, doc.name, false, doc.sha256)}>Tải {doc.name}</button>)}
      <button className="button button--secondary" onClick={() => {
        void downloadPublicEvidenceManifest(campaignId, index, d.publication!.hash).then(blob => saveBlob(blob, `public-evidence-v${d.version}.json`)).catch(cause => setError(getErrorMessage(cause)))
      }}>Tải manifest công khai · kiểm tra SHA-256</button>
    </div> : d.version > 0 && <p role="alert">Không tìm thấy bản công khai khớp hash on-chain. Không thể tiếp nhận bằng chứng.</p>}
    {actor?.reviewer && d.publication && <div><button className="button button--secondary" onClick={() => {
      void getResolverOriginal(campaignId, index).then(value => setOriginalRead({ hash: d.evidenceHash, documents: value.manifest.documents })).catch(cause => setError(getErrorMessage(cause)))
    }}>Kiểm tra tài liệu gốc riêng tư</button>
      {originals?.map(doc => <button key={doc.documentId} className="button button--secondary" onClick={() => void download('', doc.documentId, doc.originalName, true)}>Tải bản gốc {doc.originalName}</button>)}
      <p className="muted">Truy cập bản gốc được ghi nhận; bản gốc không công khai cho donor.</p></div>}
    {d.records.length > 0 && <div><h3>Nhận xét và giải trình đã index</h3><ul>{d.records.map(r => <li key={r.hash}>
      {r.unavailable ? 'Chưa lấy được nội dung khớp commitment' : `${labels[r.action as MilestoneAction] ?? r.action} · phiên bản ${r.version}: ${r.reason}`}<br /><code>{r.hash}</code>
    </li>)}</ul></div>}
    {d.history.filter(p => p.hash !== d.publication?.hash).map(p => <details key={p.hash}><summary>Bằng chứng phiên bản {p.version} đã nộp trước đó</summary>
      <p>{p.manifest.summary}</p><code>{p.hash}</code>
      {p.manifest.documents.map(doc => <button key={doc.id} className="button button--secondary"
        onClick={() => void download(p.hash, doc.id, doc.name, false, doc.sha256)}>Tải {doc.name}</button>)}
    </details>)}
    {d.state === 6 && actor?.organizer && <p>{d.prepared.length ? `Đã chốt bản công khai cho lần nộp ${d.version + 1}.` : 'Mở Bằng chứng trong workspace để đóng băng và tạo bản công khai.'}</p>}
    {d.state === 6 && actor?.organizer && d.prepared.length > 0 && <div><label>Bản công khai sẽ ký nộp
      <select value={selectedPublication?.hash ?? ''} disabled={busy} onChange={e => setPublicationChoice(e.target.value)}>
        {d.prepared.map(p => <option key={p.hash} value={p.hash}>{p.manifest.summary.slice(0, 80)} · {p.hash}</option>)}
      </select></label>
      {selectedPublication && <><p>{selectedPublication.manifest.summary}</p><p>Commitment: <code>{selectedPublication.hash}</code></p>
        {selectedPublication.manifest.documents.map(doc => <button key={doc.id} className="button button--secondary"
          onClick={() => void download(selectedPublication.hash, doc.id, doc.name, false, doc.sha256)}>Xem lại {doc.name} trước khi ký</button>)}</>}
    </div>}
    {candidates.length > 0 && <>
      <ConnectButton showBalance={false} />
      {d.roles.resolverAccount && d.roles.conflict && <p>Bạn có quan hệ với campaign hoặc đã đóng góp; không thể ký với tư cách resolver.</p>}
      {candidates.some(needsReason) && <><label>Nhận xét, phản đối hoặc giải trình công khai
        <textarea value={reason} maxLength={8000} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e => setAcknowledged(e.target.checked)} />
          Tôi đã kiểm tra hồ sơ, tiêu chí và nội dung này có thể công khai. Quyết định cuối trong MVP không có kháng nghị.</label></>}
      {candidates.map(a => <div key={a}><button className="button button--primary" disabled={Boolean(blocker(a))}
        onClick={() => void execute(a)}>{labels[a]}</button><p className="muted">{blocker(a) || 'Đủ điều kiện đối chiếu trước khi mở ví; contract kiểm tra lại khi thực thi.'}</p></div>)}
    </>}
    {(busy || pending) && <TransactionSteps operation={pending ? labels[pending.action] : 'Xử lý milestone'}
      stage={indexed ? 'indexed' : pending?.receiptBlock ? 'receipt' : pending ? 'submitted' : waitingWallet ? 'wallet' : 'idle'}
      hash={pending?.hash} receiptBlock={pending?.receiptBlock} />}
    {pending && !indexed && <button className="button button--secondary" disabled={busy} onClick={() => void execute()}>Tiếp tục kiểm tra giao dịch</button>}
    {error && <p role="alert">{error}</p>}
  </section>
}
