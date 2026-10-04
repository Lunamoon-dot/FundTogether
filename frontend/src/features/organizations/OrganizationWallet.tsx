import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'
import { bindOrganizationWallet } from '../../lib/api/organizations'
import type { Organization } from '../../lib/api/organizations'

export function OrganizationWallet({ organization, userId }: { organization: Organization; userId: string }) {
  const [selection, setSelection] = useState('')
  const queryClient = useQueryClient()
  const canSelect = organization.createdByUserId === userId && organization.role === 'OWNER'
  const account = useQuery({
    queryKey: ['account-wallets', userId], queryFn: getSession,
    enabled: canSelect && !organization.representativeWallet, retry: false,
  })
  const wallets = account.data?.userId === userId ? account.data.wallets : []
  const walletKey = (wallet: { address: string; chainId: number }) => `${wallet.chainId}:${wallet.address}`
  const choice = selection || (wallets.length === 1 ? walletKey(wallets[0]) : '')
  const wallet = wallets.find(item => walletKey(item) === choice)
  const binding = useMutation({
    mutationFn: (chosen: { address: string; chainId: number }) => bindOrganizationWallet(organization.id, chosen),
    onSuccess: (saved) => {
      queryClient.setQueryData<Organization[]>(['organizations', userId], (current = []) =>
        current.map(item => item.id === organization.id ? { ...item, representativeWallet: saved.representativeWallet } : item))
      void queryClient.invalidateQueries({ queryKey: ['organizations', userId] })
    },
  })

  return (
    <section className="panel" aria-labelledby="organization-wallet-title">
      <h2 id="organization-wallet-title">Ví đại diện tổ chức</h2>
      {organization.representativeWallet ? (
        <>
          <p><code>{organization.representativeWallet.address}</code></p>
          <p className="muted">Mạng {organization.representativeWallet.chainId}</p>
          <p className="muted">Ví đã được chọn cho tổ chức. Đổi ví đang kết nối trong trình duyệt không thay đổi địa chỉ này.</p>
        </>
      ) : (
        <>
          <p>Tổ chức chưa có ví đại diện. Bạn vẫn có thể chuẩn bị bản nháp campaign.</p>
          {canSelect ? (
            <>
              {account.isPending && <p role="status">Đang tải ví đã liên kết…</p>}
              {account.isError && <p role="alert">{getErrorMessage(account.error)}</p>}
              {account.isSuccess && wallets.length === 0 && (
                <p><a href="#/account">Liên kết ví với tài khoản trước</a>, sau đó quay lại chọn ví cho tổ chức.</p>
              )}
              {wallets.length > 0 && (
                <>
                  <label htmlFor="organization-wallet">Chọn ví đã xác thực của bạn</label>
                  <select id="organization-wallet" value={choice} disabled={binding.isPending}
                    onChange={event => { setSelection(event.target.value); binding.reset() }}>
                    <option value="">Chọn ví đại diện</option>
                    {wallets.map(item => <option key={walletKey(item)} value={walletKey(item)}>
                      {item.address} · mạng {item.chainId}
                    </option>)}
                  </select>
                  <p className="muted">Chọn kỹ địa chỉ này. Bước hiện tại chưa hỗ trợ thay ví đại diện sau khi lưu.</p>
                  <button className="button button--primary" disabled={!wallet || binding.isPending}
                    onClick={() => { if (wallet) binding.mutate(wallet) }}>
                    {binding.isPending ? 'Đang lưu…' : 'Xác nhận ví đại diện'}
                  </button>
                </>
              )}
              <button className="button button--secondary" disabled={account.isFetching || binding.isPending}
                onClick={() => void account.refetch()}>Tải lại danh sách ví</button>
              {binding.isError && <p role="alert">{getErrorMessage(binding.error)}</p>}
            </>
          ) : <p className="muted">Người tạo tổ chức có quyền OWNER mới có thể chọn ví đại diện ban đầu.</p>}
        </>
      )}
      <p className="muted">Lưu lựa chọn này chưa tạo campaign hoặc cấp quyền trên blockchain. Khi tạo campaign on-chain, cần dùng đúng ví đại diện để ký.</p>
    </section>
  )
}
