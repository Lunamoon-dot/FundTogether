import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import deployment from '../../../../backend/src/blockchain/generated/deployment.local.json'
import type { AccountSession } from '../../lib/api/auth'
import { getMyRefunds, listMyContributions } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { IndexerNotice } from './PublicCampaigns'

export function MyContributions({ session }: { session: AccountSession | null }) {
  const history = useQuery({ queryKey: ['my-contributions', session?.userId],
    queryFn: ({ signal }) => listMyContributions(signal), enabled: Boolean(session), retry: false, refetchInterval: 10_000 })
  const refunds = useQuery({ queryKey: ['my-refunds', session?.userId], queryFn: ({ signal }) => getMyRefunds(undefined, signal),
    enabled: Boolean(session), retry: false, refetchInterval: 10_000 })
  if (!session) return <section className="panel public-empty"><h1>Đóng góp của tôi</h1>
    <p>Đăng nhập và liên kết ví đã đóng góp để xem lịch sử.</p>
    <a className="button button--primary" href="#/account">Đăng nhập</a></section>
  return <section className="panel">
    <div className="feed-heading"><h1>Đóng góp của tôi</h1>
      <button className="button button--secondary" disabled={history.isFetching || refunds.isFetching} onClick={() => { void history.refetch(); void refunds.refetch() }}>Tải lại</button></div>
    <h2>Quyền hoàn tiền và lịch sử nhận</h2>
    {refunds.isPending ? <p role="status">Đang tải quyền nhận…</p> : refunds.isError ? <p role="alert">{getErrorMessage(refunds.error)}</p>
      : <><IndexerNotice sync={refunds.data.sync} />
        {refunds.data.items.length === 0 ? <p>Chưa có đóng góp từ ví liên kết để đối chiếu hoàn tiền.</p>
          : <ul className="organization-list">{refunds.data.items.flatMap(item => item.wallets.filter(w => BigInt(w.contributionUnits) > 0n).map(w => <li className="panel" key={`${item.campaign.id}:${w.donor}`}>
            <h3><a href={`#/campaigns/${item.campaign.id}`}>{item.campaign.title}</a></h3>
            <p className="public-wallet-address">Ví nhận: <code>{w.donor}</code></p>
            <p>{w.claimed ? `Đã nhận ${formatUnits(BigInt(w.entitlementUnits), deployment.tokenDecimals)} MockUSDC và đồng bộ`
              : item.snapshotted ? `Được nhận ${formatUnits(BigInt(w.claimableUnits), deployment.tokenDecimals)} MockUSDC`
                : item.canFinalizeFunding ? 'Hết hạn; cần chốt gây quỹ thất bại để mở hoàn tiền'
                  : item.canFinalizeMilestone ? 'Milestone quá hạn; cần chốt thất bại để mở hoàn tiền' : 'Chưa mở hoàn tiền'} · {item.campaign.state}</p>
            {w.transactionHash && <p className="public-wallet-address">Giao dịch nhận: <code>{w.transactionHash}</code> · block {w.blockNumber}</p>}
            {!w.claimed && <a className="button button--secondary" href={`#/campaigns/${item.campaign.id}`}>Mở campaign để đối chiếu và nhận</a>}
          </li>))}</ul>}</>}
    <h2>Lịch sử đóng góp</h2>
    {history.isPending ? <p role="status">Đang tải lịch sử…</p>
      : history.isError ? <p role="alert">{getErrorMessage(history.error)}</p>
        : <><IndexerNotice sync={history.data.sync} />
          {history.data.items.length === 0 ? <p>Chưa có giao dịch đóng góp đã đồng bộ từ ví liên kết.</p>
            : <ul className="organization-list">{history.data.items.map(item => <li className="panel" key={`${item.transactionHash}:${item.logIndex}`}>
              <h2><a href={`#/campaigns/${item.id}`}>{item.title}</a></h2>
              <p>{item.organization} · {formatUnits(BigInt(item.amountUnits), deployment.tokenDecimals)} MockUSDC</p>
              <p className="public-wallet-address">Ví: <code>{item.donor}</code> · block {item.blockNumber}</p>
              <p className="public-wallet-address">Giao dịch: <code>{item.transactionHash}</code></p>
            </li>)}</ul>}</>}
  </section>
}
