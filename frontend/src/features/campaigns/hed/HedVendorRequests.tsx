import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseEventLogs } from 'viem'
import type { Abi } from 'viem'
import deployment from '../../../lib/web3/deployment-context'
import generatedAbi from '../../../../../backend/src/blockchain/generated/hed/fund-together-disbursement.abi.json'
import { listHedVendorRequests } from '../../../lib/api/hed'
import { getErrorMessage } from '../../../lib/api/error'

const abi = generatedAbi as Abi

export function HedVendorRequests() {
  const cache = useQueryClient(), key = ['hed-vendor-requests']
  const requests = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedVendorRequests(signal), retry: false })
  const account = useAccount(), client = usePublicClient({ chainId: deployment.chainId })
  const { data: wallet } = useWalletClient({ account: account.address, connector: account.connector })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function acknowledge(item: { onchainCampaignId: string; onchainRequestId: string; requestHash: `0x${string}`; vendorWallet: `0x${string}` }) { if (busy || !account.address || !client || !wallet) return; setBusy(true); setError(''); try {
    if (account.chainId !== deployment.chainId) throw new Error(`Chuyển ví sang mạng HED ${deployment.chainId} trước khi ký terms.`)
    if (account.address.toLowerCase() !== item.vendorWallet.toLowerCase()) throw new Error('Ví đang kết nối không phải ví vendor đã khóa trong request.')
    const call = await client.simulateContract({ account: account.address, address: deployment.contractAddress, abi, functionName: 'acknowledgeVendor', args: [BigInt(item.onchainCampaignId), BigInt(item.onchainRequestId), item.requestHash] })
    const hash = await wallet.writeContract(call.request), receipt = await client.waitForTransactionReceipt({ hash, confirmations: deployment.confirmations, timeout: 90_000 })
    if (receipt.status !== 'success') throw new Error('Giao dịch vendor acknowledgement bị revert.')
    const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'VendorAcknowledged', strict: true }).find(log => log.address.toLowerCase() === deployment.contractAddress.toLowerCase()) as { args: { campaignId: bigint; requestId: bigint; vendor: string; termsHash: string } } | undefined
    if (!event || event.args.campaignId !== BigInt(item.onchainCampaignId) || event.args.requestId !== BigInt(item.onchainRequestId) || event.args.vendor.toLowerCase() !== account.address.toLowerCase() || event.args.termsHash.toLowerCase() !== item.requestHash.toLowerCase()) throw new Error('Receipt không xác nhận đúng request, recipient và frozen terms.')
    await cache.invalidateQueries({ queryKey: key })
  } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) } }
  if (requests.isPending) return <p role="status">Đang tải request dành cho vendor…</p>
  if (requests.isError) return <section className="panel"><p role="alert">{getErrorMessage(requests.error)}</p><button className="button button--secondary" onClick={() => void requests.refetch()}>Thử lại</button></section>
  return <section className="panel"><h1>Vendor · yêu cầu HED</h1><p>Chỉ ví recipient đã verify mới thấy request. Ký acknowledgement đồng nghĩa chấp nhận đúng frozen request hash; đây chưa phải xác nhận đã nhận tiền.</p>{error && <p className="toast toast--error" role="alert">{error}</p>}
    {requests.data.length === 0 ? <p>Không có request nào gắn với ví đã link của bạn.</p> : requests.data.map(item => <article key={item.requestId} className="panel"><h2>{item.content.purpose}</h2><p>Campaign #{item.onchainCampaignId} · request #{item.onchainRequestId} · {item.content.amount} base units · cọc {item.content.deposit}</p><p>{item.content.terms}</p><p className="advance-hash">{item.requestHash}</p><button className="button button--primary" disabled={busy || !account.address} onClick={() => void acknowledge(item)}>Ký acknowledgement</button></article>)}
  </section>
}
