import { useQuery } from '@tanstack/react-query'
import { advanceOrganizationRequests } from '../../lib/api/generated/advance'
import deployment from '../../lib/web3/deployment-context'

export const requestLabels = { DRAFT: 'Bản nháp', UNDER_REVIEW: 'Đang xét duyệt', CHANGES_REQUESTED: 'Cần bổ sung',
  APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy yêu cầu' }
export const organizationLabels = { UNVERIFIED: 'Chưa xác minh', VERIFIED: 'Đã xác minh hồ sơ tổ chức', EXPIRED: 'Xác minh đã hết hạn', SUSPENDED: 'Đã đình chỉ xác minh' }
export const profileFields = [
  ['legalName', 'Tên pháp nhân / tên nhóm', 200], ['registrationNumber', 'Số đăng ký · bắt buộc với tổ chức đã đăng ký', 200],
  ['address', 'Địa chỉ hoạt động', 2000], ['activityScope', 'Phạm vi hoạt động', 4000],
  ['representativeName', 'Người đại diện', 200], ['representativeRole', 'Vai trò người đại diện', 500],
  ['authorityBasis', 'Căn cứ đại diện / ủy quyền', 4000], ['identitySource', 'Nguồn đối chiếu danh tính tổ chức', 2000],
  ['activityEvidence', 'Hoạt động đã thực hiện và căn cứ kiểm tra', 4000], ['contact', 'Thông tin liên hệ để kiểm tra', 1000],
] as const
export const organizationRequestsKey = (userId: string, id: string) => ['organization-requests', deployment.deploymentId, userId, id]
export function organizationRequestRefreshInterval(query: { state: { status: string; data?: { requests: { status: string }[] } } }) {
  return query.state.status === 'success' && query.state.data?.requests[0]?.status === 'UNDER_REVIEW' ? 10_000 : false
}
export function useOrganizationRequests(userId: string, id: string) {
  return useQuery({ queryKey: organizationRequestsKey(userId, id), queryFn: ({ signal }) => advanceOrganizationRequests(id, { signal }), retry: false,
    staleTime: 0, refetchInterval: organizationRequestRefreshInterval })
}
