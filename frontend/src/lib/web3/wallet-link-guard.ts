export function getResolverWalletBlockReason({ roles, connectedAddress, resolverAddress }: {
  roles: string[]
  connectedAddress?: string
  resolverAddress: string
}) {
  if (!roles.includes('RESOLVER') || !connectedAddress
    || connectedAddress.toLowerCase() === resolverAddress.toLowerCase()) return null

  return `MetaMask đang kết nối ví ${connectedAddress}, khác ví Resolver ${resolverAddress}. Ứng dụng chưa gửi yêu cầu ký. Ngắt kết nối ví trình duyệt hiện tại hoặc chuyển tài khoản trong MetaMask sang đúng ví Resolver, rồi kết nối lại.`
}
