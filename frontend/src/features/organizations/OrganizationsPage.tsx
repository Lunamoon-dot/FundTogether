import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { createOrganization, listOrganizations } from '../../lib/api/organizations'
import type { Organization } from '../../lib/api/organizations'
import { getErrorMessage } from '../../lib/api/error'
import { organizationVerificationLabel } from './organization-verification'
import { isAdvance } from '../../lib/web3/deployment-context'
import { OrganizationVerificationBadge } from './OrganizationVerificationRequest'
import './OrganizationsPage.css'

const organizationFormSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên tổ chức.').max(200, 'Tên tối đa 200 ký tự.'),
  description: z.string().trim().min(1, 'Nhập mô tả tổ chức.').max(10000, 'Mô tả tối đa 10.000 ký tự.'),
})

export function OrganizationsPage({ userId }: { userId: string }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validationError, setValidationError] = useState('')
  const [notice, setNotice] = useState('')
  const queryClient = useQueryClient()
  const queryKey = ['organizations', userId]
  const organizations = useQuery({ queryKey, queryFn: listOrganizations, retry: false })
  const creation = useMutation({
    mutationFn: createOrganization,
    onSuccess: (saved) => {
      queryClient.setQueryData<Organization[]>(queryKey, (current = []) => [
        saved,
        ...current.filter((organization) => organization.id !== saved.id),
      ])
      void queryClient.invalidateQueries({ queryKey })
      setCreating(false)
      setName('')
      setDescription('')
      setValidationError('')
      setNotice(`Đã tạo tổ chức “${saved.name}”. Bạn là chủ sở hữu.`)
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creation.isPending) return
    creation.reset()
    setNotice('')
    const parsed = organizationFormSchema.safeParse({ name, description })
    setValidationError(parsed.success ? '' : parsed.error.issues[0].message)
    if (parsed.success) creation.mutate(parsed.data)
  }

  return (
    <div className="organizations-page">
      <div className="feed-heading">
        <h1>Tổ chức của tôi</h1>
        {!creating && (
          <button className="button button--primary" onClick={() => {
            setNotice('')
            creation.reset()
            setCreating(true)
          }}>
            + Tạo tổ chức
          </button>
        )}
      </div>
      {notice && <p className="toast toast--success" role="status">{notice}</p>}
      {creating && (
        <section className="panel organization-create" aria-labelledby="organization-create-title">
          <h2 id="organization-create-title">Tạo tổ chức</h2>
          <form className="organization-form" onSubmit={submit}>
            <label htmlFor="organization-name">Tên tổ chức</label>
            <input id="organization-name" value={name} onChange={(event) => setName(event.target.value)}
              required maxLength={200} disabled={creation.isPending} autoFocus />
            <label htmlFor="organization-description">Mô tả</label>
            <textarea id="organization-description" value={description}
              onChange={(event) => setDescription(event.target.value)} required maxLength={10000}
              rows={4} disabled={creation.isPending} />
            <p className="muted">Bạn sẽ là chủ sở hữu. Tổ chức mới chưa được xác minh.</p>
            {(validationError || creation.isError) && (
              <p className="field-error" role="alert">
                {validationError || getErrorMessage(creation.error)}
              </p>
            )}
            <div className="organization-form-actions">
              <button type="submit" className="button button--primary" disabled={creation.isPending}>
                {creation.isPending ? 'Đang tạo…' : 'Tạo tổ chức'}
              </button>
              <button type="button" className="button button--secondary" disabled={creation.isPending}
                onClick={() => { setCreating(false); setValidationError(''); creation.reset() }}>
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}
      {organizations.isPending && <p role="status" className="muted">Đang tải tổ chức…</p>}
      {organizations.isError && (
        <div className="organization-list-error">
          <p role="alert">Không tải được danh sách: {getErrorMessage(organizations.error)}</p>
          <button className="button button--secondary" onClick={() => void organizations.refetch()}
            disabled={organizations.isFetching}>Thử lại</button>
          <a href="#/account">Kiểm tra tài khoản</a>
        </div>
      )}
      {organizations.isSuccess && organizations.data.length === 0 && (
        <section className="public-empty">
          <h2>Bạn chưa có tổ chức</h2>
          <p>Tạo hồ sơ tổ chức để bắt đầu quản lý hoạt động gây quỹ của bạn.</p>
        </section>
      )}
      {organizations.data && organizations.data.length > 0 && (
        <ul className="organization-list" aria-label="Danh sách tổ chức">
          {organizations.data.map((organization) => (
            <li className="panel organization-card" key={organization.id}>
              <div className="organization-card-heading">
                <h2>{organization.name}</h2>
                <span className="organization-role">Chủ sở hữu</span>
              </div>
              <p className="organization-description">{organization.description}</p>
              <div className="organization-card-meta">
                {isAdvance ? <OrganizationVerificationBadge userId={userId} organizationId={organization.id} /> : <span>{organizationVerificationLabel(organization.verificationStatus)}</span>}
                <span>Tạo ngày {new Intl.DateTimeFormat('vi-VN').format(new Date(organization.createdAt))}</span>
              </div>
              <p className="muted">{organization.representativeWallet
                ? `Ví đại diện: ${organization.representativeWallet.address} · mạng ${organization.representativeWallet.chainId}`
                : 'Chưa có ví đại diện — chọn ví trong hồ sơ tổ chức.'}</p>
              <div className="organization-form-actions">
              <a className="button button--secondary organization-workspace-link"
                href={`#/organizations/${organization.id}`}>Xem hồ sơ</a>
              <a className="button button--primary organization-workspace-link"
                href={`#/organizations/${organization.id}/workspace/campaigns`}
                aria-label={`Quản lý campaign của ${organization.name}`}>
                Quản lý campaign
              </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
