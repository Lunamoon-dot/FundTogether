import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { advanceGetPublic, advanceGetRefunds, advanceListRefunds } from '../../lib/api/generated/advance'
import type { AdvanceRefundsItemsItem, AdvanceSnapshot } from '../../lib/api/generated/advance'
import { getErrorMessage } from '../../lib/api/error'
import deployment from '../../lib/web3/deployment-context'
import { useAccountSession } from '../auth/AccountSessionProvider'
import { AdvanceWalletAction, AdvanceTransactionHistory } from '../campaigns/advance/AdvanceWalletAction'
import { advanceStateLabels, publicActionInput } from '../campaigns/advance/advance-journey'
import { refundPosition } from './advance-refund'

export function AdvanceRefundPanel({ snapshot, metadataId, onRefresh }: { snapshot: AdvanceSnapshot; metadataId: string | null; onRefresh: () => void }) {
  const { session } = useAccountSession(), account = useAccount()
  const rights = useQuery({ queryKey: ['advance-refunds', deployment.deploymentId, session?.userId, account.address, snapshot.campaignId], enabled: Boolean(session), retry: false,
    queryFn: ({ signal }) => advanceGetRefunds(snapshot.campaignId, { signal }), refetchInterval: 5000 })
  if (!snapshot.campaign.refundSnapshotted) return null
  return <section className="panel"><h2>Hoàn tiền sau kết thúc</h2><p>{advanceStateLabels[snapshot.campaign.state]}. Kết quả campaign và nghĩa vụ refund được theo dõi riêng.</p>
    <p>Base pool P0: {formatUnits(BigInt(snapshot.campaign.basePool), 6)} USDC · khoản trả muộn tích lũy S: {formatUnits(BigInt(snapshot.campaign.supplementPool), 6)} USDC.</p>
    <p>Escrow {formatUnits(BigInt(snapshot.campaign.custody), 6)} USDC còn giữ gồm nghĩa vụ chưa claim và phần làm tròn. Không gọi toàn bộ số dư này là dust; không có sweep hoặc hạn hết quyền.</p>
    {!session ? <p><a href="#/account">Đăng nhập và liên kết ví đã góp</a> để xem quyền hoàn tiền.</p>
      : rights.isPending ? <p role="status">Đang đối chiếu quyền từng ví…</p> : rights.isError ? <><p role="alert">{getErrorMessage(rights.error)}</p><button className="button button--secondary" onClick={() => void rights.refetch()}>Thử lại</button></>
        : rights.data.items.length === 0 ? <p>Chưa tìm thấy contribution từ các ví B đã liên kết với tài khoản này.</p>
          : rights.data.items.map(right => <RefundRight key={`${session.userId}:${right.wallet}:${right.campaignId}`} right={right} snapshot={snapshot} metadataId={metadataId}
            onRefresh={() => { void rights.refetch(); onRefresh() }} />)}
  </section>
}
function RefundRight({ right, snapshot, metadataId, onRefresh }: { right: AdvanceRefundsItemsItem; snapshot: AdvanceSnapshot; metadataId: string | null; onRefresh: () => void }) {
  let p
  try { p = refundPosition(snapshot, right) } catch (cause) { return <p role="alert">{getErrorMessage(cause)}</p> }
  return <div><p className="advance-hash">Ví donor nhận cố định: {right.wallet}</p><p>Đã góp {formatUnits(BigInt(right.contribution), 6)} USDC.</p>
    <dl className="advance-financials"><div><dt>Quyền base</dt><dd>{formatUnits(BigInt(p.baseEntitlement), 6)}</dd></div><div><dt>Base đã nhận</dt><dd>{formatUnits(BigInt(p.basePaid), 6)}</dd></div>
      <div><dt>Supplement đã nhận</dt><dd>{formatUnits(BigInt(p.supplementPaid), 6)}</dd></div><div><dt>Có thể nhận hiện tại</dt><dd>{formatUnits(BigInt(p.claimable), 6)} USDC</dd></div></dl>
    {p.claimable === '0' && <p>Hiện không có token để nhận. Quyền supplement có thể tăng nếu tổ chức thực trả thêm về escrow.</p>}
    {p.consumeZeroBase && <p>Base hiện bằng 0; vẫn có thể ghi nhận đã xử lý quyền base một lần, tốn gas nhưng không nhận token. Quyền supplement tương lai được giữ.</p>}
    {metadataId ? <AdvanceWalletAction metadataId={metadataId} requiredWallet={right.wallet} label={p.consumeZeroBase ? 'Ghi nhận quyền base bằng 0' : `Nhận ${formatUnits(BigInt(p.claimable), 6)} USDC refund`}
      input={publicActionInput(snapshot, 'CLAIM_REFUND')} display={{ snapshot, refund: { base: right.base, supplement: right.supplement } }} onRefresh={onRefresh}
      disabledReason={!right.claimable ? 'Chưa có quyền refund mới ở checkpoint hiện tại.' : undefined} />
      : <p>Không có liên kết metadata đúng deployment để chuẩn bị giao dịch; cần đối chiếu lại campaign.</p>}
  </div>
}
export function AdvanceContributions() {
  const { session } = useAccountSession(), account = useAccount()
  const query = useQuery({ queryKey: ['advance-my-contributions', deployment.deploymentId, session?.userId, account.address], enabled: Boolean(session), retry: false,
    queryFn: ({ signal }) => advanceListRefunds({ signal }), refetchInterval: 5000 })
  if (!session) return <section className="panel"><h1>Đóng góp của tôi</h1><a href="#/account">Đăng nhập để xem ví đã liên kết</a></section>
  return <><h1>Đóng góp và quyền hoàn tiền</h1><p>Các ví đã liên kết SIWE với tài khoản trên mạng B {deployment.chainId}.</p>
    {query.isPending ? <p role="status">Đang tải contribution/claimable…</p> : query.isError ? <section className="panel"><p role="alert">{getErrorMessage(query.error)}</p><button className="button button--secondary" onClick={() => void query.refetch()}>Tải lại</button></section>
      : !query.data.items.length ? <section className="panel"><p>Chưa có đóng góp được index từ các ví đã liên kết.</p><a href="#/">Khám phá campaign</a></section>
        : [...new Set(query.data.items.map(item => item.campaignId))].map(id => <ContributionCampaign key={`${session.userId}:${id}`} campaignId={id} onRefresh={() => void query.refetch()} />)}
  </>
}
function ContributionCampaign({ campaignId, onRefresh }: { campaignId: string; onRefresh: () => void }) {
  const { session } = useAccountSession()
  const query = useQuery({ queryKey: ['advance-contribution-detail', deployment.deploymentId, session?.userId, campaignId], retry: false,
    queryFn: ({ signal }) => advanceGetPublic(campaignId, { signal }), refetchInterval: 5000 })
  if (query.isPending) return <p role="status">Đang tải campaign {campaignId}…</p>
  if (query.isError) return <p role="alert">{getErrorMessage(query.error)}</p>
  const d = query.data, refresh = () => { void query.refetch(); onRefresh() }
  return <section><h2><a href={`#/campaigns/${campaignId}`}>{d.title ?? `Campaign ${campaignId}`}</a></h2><p>{advanceStateLabels[d.snapshot.campaign.state]}</p>
    {d.snapshot.campaign.refundSnapshotted ? <AdvanceRefundPanel snapshot={d.snapshot} metadataId={d.metadataId} onRefresh={refresh} />
      : <p>Chưa chốt pool hoàn tiền. Theo dõi tiền và hồ sơ trong trang campaign.</p>}
    {d.metadataId && <AdvanceTransactionHistory metadataId={d.metadataId} onRefresh={refresh} />}
  </section>
}
