import { sha256, toHex } from 'viem'
import type { OrganizationRequest } from '../../lib/api/generated/advance'
import deployment from '../../lib/web3/deployment-context'

export type ApprovalBinding = { organizationId: string; verificationRecordId: string; requestId: string; snapshotHash: string }
export const approvedOrganizationRequestKey = (userId: string, binding: ApprovalBinding) =>
  ['approved-organization-request', deployment.deploymentId, userId, binding.organizationId, binding.verificationRecordId, binding.requestId, binding.snapshotHash]

export function validateApprovedOrganizationRequest(request: OrganizationRequest, binding: ApprovalBinding) {
  if (request.id !== binding.requestId || request.organizationId !== binding.organizationId || request.status !== 'APPROVED'
    || request.verificationRecordId !== binding.verificationRecordId || request.snapshotHash !== binding.snapshotHash
    || !request.snapshotBytes || sha256(toHex(request.snapshotBytes)) !== binding.snapshotHash) {
    throw new Error('Hồ sơ không khớp với quyết định xác thực. Cần tải lại lịch sử trước khi tiếp tục.')
  }
  return request
}
