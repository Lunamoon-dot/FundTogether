import { useQuery } from '@tanstack/react-query'
import { advanceOrganizationRequest } from '../../lib/api/generated/advance'
import type { AccountSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'
import { VerificationRequestDetails } from '../organizations/OrganizationVerificationRequest'
import { approvedOrganizationRequestKey, validateApprovedOrganizationRequest } from './approved-organization-request'
import type { ApprovalBinding } from './approved-organization-request'

export function ApprovedOrganizationRequest({ session, binding }: { session: AccountSession; binding: ApprovalBinding }) {
  const allowed = session.roles.includes('ADMIN') || session.roles.includes('RESOLVER')
  const query = useQuery({ queryKey: approvedOrganizationRequestKey(session.userId, binding), enabled: allowed, retry: false, staleTime: 0,
    queryFn: ({ signal }) => advanceOrganizationRequest(binding.requestId, { signal }),
    select: request => validateApprovedOrganizationRequest(request, binding) })
  if (!allowed) return <p role="alert">Cần quyền ADMIN hoặc RESOLVER để đọc hồ sơ.</p>
  if (query.isError) return <><p role="alert">{getErrorMessage(query.error)}</p>
    <button className="button button--secondary" onClick={() => void query.refetch()}>Tải lại hồ sơ</button></>
  if (query.isPending || query.isFetching) return <p role="status">Đang kiểm tra quyền đọc hồ sơ đã được duyệt…</p>
  return <section><h3>Hồ sơ tại thời điểm duyệt</h3><VerificationRequestDetails request={query.data} /></section>
}
