export function organizationVerificationLabel(status: string) {
  switch (status) {
    case 'unverified': return 'Chưa xác minh'
    case 'verified': return 'Đã xác minh'
    case 'revoked': return 'Đã thu hồi xác minh'
    default: return 'Chưa rõ trạng thái xác minh'
  }
}
