import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSession } from '../../lib/api/auth'
import { deleteCampaignDraft } from '../../lib/api/campaigns'
import type { CampaignDraft } from '../../lib/api/campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { useAccountSession } from '../auth/AccountSessionProvider'

export function DeleteCampaignDraft({ campaign, userId, onDeleted }: {
  campaign: CampaignDraft
  userId: string
  onDeleted: (id: string) => void
}) {
  const { session } = useAccountSession()
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState<{ revision: number; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const active = useRef(true)
  const currentUserId = useRef(session?.userId)
  useEffect(() => { currentUserId.current = session?.userId }, [session?.userId])
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  async function remove() {
    if (inFlight.current || !campaign.canDelete || !confirmation || campaign.revision !== confirmation.revision || currentUserId.current !== userId) return
    inFlight.current = true
    setBusy(true)
    setError('')
    let requested = false
    const listKey = campaign.organizationId
      ? ['organization-campaigns', userId, campaign.organizationId]
      : ['campaigns', userId]
    try {
      const account = await getSession()
      if (!active.current || account.userId !== userId || currentUserId.current !== userId) {
        throw new Error('Tài khoản đã thay đổi. Tải lại trang trước khi xóa.')
      }
      requested = true
      await deleteCampaignDraft(campaign.id, confirmation.revision)
      const detailKeys = ['organization-campaign', 'organization-evidence']
        .map((prefix) => [prefix, userId, campaign.organizationId, campaign.id])
      if (!campaign.organizationId) detailKeys.push(['campaigns', userId, campaign.id])
      await Promise.all([listKey, ...detailKeys].map((queryKey) => queryClient.cancelQueries({ queryKey })))
      if (active.current && currentUserId.current === userId) {
        queryClient.setQueryData<CampaignDraft[]>(listKey, (items) => items?.filter((item) => item.id !== campaign.id))
        onDeleted(campaign.id)
      }
      for (const queryKey of detailKeys) queryClient.removeQueries({ queryKey })
    } catch (cause) {
      if (active.current && currentUserId.current === userId) {
        setError(`${getErrorMessage(cause)}${requested ? ' Tải lại danh sách để kiểm tra trạng thái trước khi thử lại.' : ''}`)
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: listKey })
      if (active.current) setBusy(false)
      inFlight.current = false
    }
  }

  if (session?.userId !== userId || (!campaign.canDelete && !confirmation)) return null
  return <div className="draft-delete">
    {!confirmation ? <button type="button" className="button button--danger"
      onClick={() => { setConfirmation({ revision: campaign.revision, title: campaign.title }); setError('') }}>Xóa bản nháp</button> : (
      <div className="draft-delete-confirmation" role="group" aria-label={`Xác nhận xóa bản nháp ${confirmation.title}`} aria-busy={busy}>
        <p><strong>Xóa bản nháp “{confirmation.title}” khỏi workspace?</strong></p>
        <p>Dữ liệu và file riêng tư được giữ trong hệ thống. Sau khi xóa, bạn không thể mở hoặc sửa hồ sơ này trong workspace. Không có giao dịch blockchain.</p>
        {(!campaign.canDelete || campaign.revision !== confirmation.revision) && <p role="alert">Hồ sơ đã thay đổi. Đóng phần xác nhận và tải lại danh sách trước khi xóa.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="draft-delete-actions">
          <button type="button" className="button button--secondary" disabled={busy}
            onClick={() => { setConfirmation(null); setError('') }}>Giữ bản nháp</button>
          <button type="button" className="button button--danger" disabled={busy || !campaign.canDelete || campaign.revision !== confirmation.revision}
            onClick={() => void remove()}>{busy ? 'Đang xóa…' : 'Xác nhận xóa bản nháp'}</button>
        </div>
      </div>
    )}
  </div>
}
