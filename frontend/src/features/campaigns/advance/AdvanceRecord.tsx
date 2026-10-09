import { useQuery } from '@tanstack/react-query'
import { sha256, toHex } from 'viem'
import { advanceGetPublicRecord } from '../../../lib/api/generated/advance'
import { getErrorMessage } from '../../../lib/api/error'
import deployment from '../../../lib/web3/deployment-context'

interface Report { actorWallet: string; statement?: { reason: string; limits: string; sources: string[] };
  review?: { reason: string; limits: string; scope: string; sources: { description: string; reference: string }[];
    decision?: { criteria: { criterionId: string; outcome: string; reason: string; limits: string; sources: string[] }[] } } }
export function AdvanceRecord({ hash, title }: { hash: string; title: string }) {
  const record = useQuery({ queryKey: ['advance-public-record', deployment.deploymentId, hash], retry: false,
    queryFn: async ({ signal }) => {
      const r = await advanceGetPublicRecord(hash, { signal })
      if (sha256(toHex(r.recordBytes)) !== hash || r.recordHash !== hash) throw new Error('Bytes quyết định không khớp commitment.')
      return { ...r, report: JSON.parse(r.recordBytes) as Report }
    } })
  return <details><summary>{title}</summary>
    {record.isPending ? <p role="status">Đang tải quyết định đã công khai…</p> : record.isError ? <><p role="alert">{getErrorMessage(record.error)}</p><button className="button button--secondary" onClick={() => void record.refetch()}>Tải lại</button></>
      : <><p className="advance-hash">Người ký: {record.data.report.actorWallet}</p><p>{record.data.report.statement?.reason ?? record.data.report.review?.reason}</p>
        {record.data.report.review?.scope && <p>Phạm vi: {record.data.report.review.scope}</p>}
        <p>Giới hạn: {record.data.report.statement?.limits ?? record.data.report.review?.limits}</p>
        <ul>{record.data.report.statement?.sources.map((s, i) => <li key={i}>{s}</li>)}
          {record.data.report.review?.sources.map((s, i) => <li key={i}>{s.description} · {s.reference}</li>)}</ul>
        {record.data.report.review?.decision?.criteria.map(c => <div key={c.criterionId}><h4>{c.criterionId} · {c.outcome}</h4><p>{c.reason}</p><p>Giới hạn: {c.limits}</p><ul>{c.sources.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
        <p className="advance-hash">Record: {hash} · giao dịch {record.data.transactionHash}</p></>}
  </details>
}
