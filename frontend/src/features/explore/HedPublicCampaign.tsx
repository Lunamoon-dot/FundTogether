import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { keccak256, parseEventLogs, toHex } from 'viem'
import type { Abi } from 'viem'
import deployment from '../../lib/web3/deployment-context'
import disbursementAbiJson from '../../../../backend/src/blockchain/generated/hed/fund-together-disbursement.abi.json'
import tokenAbiJson from '../../../../backend/src/blockchain/generated/hed/mock-usdc.abi.json'
import { getHedPublicCampaign, listHedPublicCampaigns } from '../../lib/api/hed'
import type { HedRiskProjection } from '../../lib/api/hed'
import { getErrorMessage } from '../../lib/api/error'

const abi = disbursementAbiJson as Abi, tokenAbi = tokenAbiJson as Abi
const hasReport = (hash?: `0x${string}`) => Boolean(hash && !/^0x0{64}$/i.test(hash))

export function HedRiskMeter({ risk }: { risk?: HedRiskProjection }) {
  if (!risk) return null
  const finPct = (risk.financialExposureRatioBps / 100).toFixed(1)
  const outPct = (risk.outcomeExposureRatioBps / 100).toFixed(1)

  return (
    <section className="panel" style={{ background: '#f8fafc', borderLeft: '4px solid #0284c7', margin: '1rem 0' }}>
      <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Giám sát Rủi ro Kép (Dual-Exposure Risk Meter)</span>
      </h3>
      <p className="muted" style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
        Hệ thống tự động kiểm soát 2 tầng rủi ro tài chính trên smart contract trước khi cho phép giải ngân tiếp:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <strong>1. Financial Exposure</strong>
            <span style={{ color: Number(finPct) >= 100 ? '#ef4444' : '#0284c7', fontWeight: 600 }}>{finPct}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', margin: '0.5rem 0' }}>
            <div style={{ width: `${Math.min(100, Number(finPct))}%`, height: '100%', background: Number(finPct) >= 100 ? '#ef4444' : '#0284c7', transition: 'width 0.3s' }} />
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Hiện tại: <strong>{risk.financialExposure}</strong> / Trần: <strong>{risk.financialExposureLimit}</strong> (25% Goal)
          </p>
          <p className="muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
            Tiền đã rời Escrow nhưng chưa được đối chiếu chứng từ chi tiêu.
          </p>
        </div>

        <div style={{ background: '#ffffff', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <strong>2. Outcome Exposure</strong>
            <span style={{ color: Number(outPct) >= 100 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{outPct}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', margin: '0.5rem 0' }}>
            <div style={{ width: `${Math.min(100, Number(outPct))}%`, height: '100%', background: Number(outPct) >= 100 ? '#ef4444' : '#10b981', transition: 'width 0.3s' }} />
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Hiện tại: <strong>{risk.outcomeExposure}</strong> / Trần: <strong>{risk.outcomeExposureLimit}</strong> (50% Goal)
          </p>
          <p className="muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
            Tiền đã đối chiếu hóa đơn nhưng chưa xác minh kết quả thiện nguyện thực tế.
          </p>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <span>Trần mỗi Request: <strong>{risk.maxRequestCap}</strong></span>
        <span>Yêu cầu đang mở: <strong>{risk.hasOpenRequest ? 'Có (Chặn mở thêm)' : 'Không (Sẵn sàng)'}</strong></span>
        <span>Hoạt động đang mở: <strong>{risk.hasOpenActivity ? '1 Activity đang thực hiện' : 'Chưa có'}</strong></span>
      </div>
    </section>
  )
}

export function HedCampaignFeed() {
  const campaigns = useQuery({ queryKey: ['hed-public-campaigns'], queryFn: ({ signal }) => listHedPublicCampaigns(signal), retry: false, refetchInterval: 10_000 })
  if (campaigns.isPending) return <p role="status">Đang tải campaign HED…</p>
  if (campaigns.isError) return <section className="panel"><p role="alert">{getErrorMessage(campaigns.error)}</p><button className="button button--secondary" onClick={() => void campaigns.refetch()}>Thử lại</button></section>
  return <><div className="feed-heading"><h1>Campaign giải ngân theo yêu cầu</h1></div><p>Đủ goal trước khi giải ngân. 4 giai đoạn xác thực, không dùng milestone cấp vốn trước.</p>
    {campaigns.data.length === 0 ? <section className="panel"><h2>Chưa có campaign HED</h2><p>Campaign sẽ xuất hiện sau khi đã ghi nhận trên chain và indexer bắt kịp.</p></section>
      : <ul className="organization-list">{campaigns.data.map(campaign => <li className="panel" key={campaign.campaignId}><h2>Campaign HED #{campaign.campaignId}</h2><p>{campaign.campaign.state} · goal {campaign.campaign.goal} · đã góp {campaign.campaign.contributed}</p><p>Đang giữ {campaign.campaign.reserved} · đã giải ngân {campaign.campaign.grossPaid}</p><a className="button button--secondary" href={`#/hed/campaigns/${campaign.campaignId}`}>Xem campaign</a></li>)}</ul>}</>
}

export function HedPublicCampaign({ campaignId }: { campaignId: string }) {
  const view = useQuery({ queryKey: ['hed-public-campaign', campaignId], queryFn: ({ signal }) => getHedPublicCampaign(campaignId, signal), retry: false, refetchInterval: 10_000 })
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const contribution = useQuery({ queryKey: ['hed-contribution', campaignId, account.address], enabled: Boolean(client && account.address), retry: false,
    queryFn: () => client!.readContract({ address: deployment.contractAddress, abi, functionName: 'contributions', args: [BigInt(campaignId), account.address!] }) as Promise<bigint> })
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function transaction(fn: () => Promise<void>) { if (busy || !account.address || !client || !wallet) return; setBusy(true); setError(''); try { if (account.chainId !== deployment.chainId) throw new Error(`Chuyển ví sang mạng HED ${deployment.chainId} trước.`); await fn(); await view.refetch() } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  async function donate() { await transaction(async () => { const value = BigInt(amount); if (value <= 0n) throw new Error('Số tiền đóng góp phải lớn hơn 0.'); const approve = await client!.simulateContract({ account: account.address!, address: deployment.tokenAddress, abi: tokenAbi, functionName: 'approve', args: [deployment.contractAddress, value] }); const approvalHash = await wallet!.writeContract(approve.request); const approval = await client!.waitForTransactionReceipt({ hash: approvalHash, confirmations: deployment.confirmations, timeout: 90_000 }); if (approval.status !== 'success') throw new Error('Approve MockUSDC bị revert.'); const call = await client!.simulateContract({ account: account.address!, address: deployment.contractAddress, abi, functionName: 'donate', args: [BigInt(campaignId), value] }); const hash = await wallet!.writeContract(call.request), receipt = await client!.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 }); const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'Donated', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()); if (receipt.status !== 'success' || !event) throw new Error('Receipt không xác nhận đóng góp HED.') }) }
  async function final(requestId: number) { await transaction(async () => { const call = await client!.simulateContract({ account: account.address!, address: deployment.contractAddress, abi, functionName: 'finalizeExpenditure', args: [BigInt(campaignId), BigInt(requestId)] }); const hash = await wallet!.writeContract(call.request), receipt = await client!.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 }); const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'ExpenditureFinalized', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()); if (receipt.status !== 'success' || !event) throw new Error('Receipt không xác nhận quyết toán chi tiêu.') }) }
  async function challenge(requestId: number) { await transaction(async () => { if (reason.trim().length < 10) throw new Error('Nêu lý do challenge tối thiểu 10 ký tự.'); const call = await client!.simulateContract({ account: account.address!, address: deployment.contractAddress, abi, functionName: 'openExpenditureCase', args: [BigInt(campaignId), BigInt(requestId), keccak256(toHex(reason.trim()))] }); const hash = await wallet!.writeContract(call.request), receipt = await client!.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 }); const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'ExpenditureCaseOpened', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()); if (receipt.status !== 'success' || !event) throw new Error('Receipt không xác nhận expenditure case.') }) }
  async function verifyOutcome(activityId: number) { await transaction(async () => { const reportHash = view.data?.activities[activityId]?.outcomeReportHash; if (!reportHash) throw new Error('Không tìm thấy report hash của outcome candidate.'); const call = await client!.simulateContract({ account: account.address!, address: deployment.contractAddress, abi, functionName: 'verifyOutcome', args: [BigInt(campaignId), BigInt(activityId), reportHash] }); const hash = await wallet!.writeContract(call.request), receipt = await client!.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 }); const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'OutcomeVerified', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()); if (receipt.status !== 'success' || !event) throw new Error('Receipt không xác nhận outcome verified.') }) }
  async function challengeOutcome(activityId: number) { await transaction(async () => { if (reason.trim().length < 10) throw new Error('Nêu lý do challenge tối thiểu 10 ký tự.'); const call = await client!.simulateContract({ account: account.address!, address: deployment.contractAddress, abi, functionName: 'openOutcomeCase', args: [BigInt(campaignId), BigInt(activityId), keccak256(toHex(reason.trim()))] }); const hash = await wallet!.writeContract(call.request), receipt = await client!.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 }); const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'OutcomeCaseOpened', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()); if (receipt.status !== 'success' || !event) throw new Error('Receipt không xác nhận outcome case.') }) }
  async function claimRefund() { await transaction(async () => { const call = await client!.simulateContract({ account: account.address!, address: deployment.contractAddress, abi, functionName: 'claimRefund', args: [BigInt(campaignId)] }); const hash = await wallet!.writeContract(call.request), receipt = await client!.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 }); const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'RefundClaimed', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()); if (receipt.status !== 'success' || !event) throw new Error('Receipt không xác nhận refund claim.') }) }
  if (view.isPending) return <p role="status">Đang tải campaign HED…</p>
  if (view.isError) return <section className="panel"><p role="alert">{getErrorMessage(view.error)}</p><button className="button button--secondary" onClick={() => void view.refetch()}>Thử lại</button></section>
  const data = view.data
  const checkpointTime = BigInt(data.checkpoint.chainTimestamp) * 1000n
  return <><a className="public-back" href="#/">← Khám phá campaign</a><section className="panel"><h1>Campaign HED #{data.campaignId}</h1><p>State: {data.campaign.state} · checkpoint block {data.checkpoint.blockNumber}</p><p>Goal {data.campaign.goal} · đã góp {data.campaign.contributed} · còn giữ tự do {data.campaign.available} · reserve {data.campaign.reserved} · đã giải ngân {data.campaign.grossPaid}</p>{account.address && <p>Đóng góp của ví đang kết nối: {contribution.isPending ? 'đang đối chiếu…' : contribution.data?.toString() ?? 'không đọc được'}</p>}{error && <p className="toast toast--error" role="alert">{error}</p>}{data.campaign.state === 'FUNDING' && <form className="hed-plan-form" onSubmit={event => { event.preventDefault(); void donate() }}><label>Đóng góp MockUSDC (base units)<input required inputMode="numeric" pattern="[1-9][0-9]*" value={amount} onChange={event => setAmount(event.target.value)} /></label><button className="button button--primary" disabled={busy || !account.address} type="submit">Approve rồi đóng góp</button></form>}{data.campaign.refundSnapshotted && <section><p>Refund snapshot: base {data.campaign.basePool} · supplement tích lũy {data.campaign.supplementPool}. Chỉ donor đã góp có thể claim phần của mình.</p><button className="button button--primary" disabled={busy || !account.address} onClick={() => void claimRefund()}>Claim refund</button></section>}</section><HedRiskMeter risk={data.riskProjection} /><section className="panel"><h2>Requests</h2>{data.requests.length === 0 ? <p>Chưa có request.</p> : data.requests.map((request, id) => <article className="panel" key={id}><p>Request #{id} · {request.state} · Q={request.approvedAmount} · đã giải ngân={request.grossPaid ?? '0'} · V={request.acceptedExpenditure ?? '0'}</p>{hasReport(request.expenditureReportHash) && ['EXPENDITURE_CANDIDATE', 'FINANCIALLY_SETTLED'].includes(request.state) && <p><a href={`/v1/disbursement/public/campaigns/${campaignId}/evidence/${request.expenditureReportHash}`}>Tải bản chứng từ chi tiêu công khai đã che PII</a></p>}{request.state === 'EXPENDITURE_CANDIDATE' && <><p>Challenge kết thúc: {new Date(Number(request.challengeEnd) * 1000).toLocaleString('vi-VN')}</p><label>Lý do challenge chi tiêu (chỉ donor đã góp)<textarea value={reason} minLength={10} onChange={event => setReason(event.target.value)} /></label><button className="button button--secondary" disabled={busy || !account.address} onClick={() => void challenge(id)}>Mở khiếu nại chi tiêu</button><button className="button button--primary" disabled={busy || !account.address || BigInt(request.challengeEnd) * 1000n > checkpointTime} onClick={() => void final(id)}>Quyết toán khi hết challenge</button></>}</article>)}</section><section className="panel"><h2>Outcome</h2>{data.activities.length === 0 ? <p>Chưa có activity.</p> : data.activities.map((activity, id) => <article className="panel" key={id}><p>Activity #{id} · {activity.state} · trần {activity.ceiling} · đã phê duyệt {activity.approved}</p>{hasReport(activity.outcomeReportHash) && ['OUTCOME_CANDIDATE', 'VERIFIED'].includes(activity.state) && <p><a href={`/v1/disbursement/public/campaigns/${campaignId}/evidence/${activity.outcomeReportHash}`}>Tải bản outcome công khai đã che PII</a></p>}{activity.state === 'OUTCOME_CANDIDATE' && <><p>Challenge kết thúc: {new Date(Number(activity.challengeEnd) * 1000).toLocaleString('vi-VN')}</p><label>Lý do challenge outcome (chỉ donor đã góp)<textarea value={reason} minLength={10} onChange={event => setReason(event.target.value)} /></label><button className="button button--secondary" disabled={busy || !account.address} onClick={() => void challengeOutcome(id)}>Mở outcome case</button><button className="button button--primary" disabled={busy || !account.address || BigInt(activity.challengeEnd) * 1000n > checkpointTime} onClick={() => void verifyOutcome(id)}>Resolver xác nhận outcome</button></>}</article>)}</section></>
}
