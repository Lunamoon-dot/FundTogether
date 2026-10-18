export function getResolverWalletBlockReason({ roles, connectedAddress, resolverAddress, backupResolverAddress }: {
  roles: string[]
  connectedAddress?: string
  resolverAddress: string
  backupResolverAddress?: string
}) {
  const allowedAddresses = [resolverAddress]
  if (backupResolverAddress) allowedAddresses.push(backupResolverAddress)
  if (!roles.includes('RESOLVER') || !connectedAddress
    || allowedAddresses.some(address => connectedAddress.toLowerCase() === address.toLowerCase())) return null

  return `MetaMask đang kết nối ví ${connectedAddress}, khác các ví Resolver ${allowedAddresses.join(' hoặc ')}. Ứng dụng chưa gửi yêu cầu ký. Ngắt kết nối ví trình duyệt hiện tại hoặc chuyển tài khoản trong MetaMask sang đúng ví Resolver, rồi kết nối lại.`
}
