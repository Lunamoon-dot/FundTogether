import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listHedVendorVerifications, verifyHedVendor } from '../../lib/api/hed'
import type { HedVendorVerificationInput } from '../../lib/api/hed'
import { getErrorMessage } from '../../lib/api/error'

const initial = (): HedVendorVerificationInput => ({ vendorWallet: '' as `0x${string}`, legalName: '', contact: '', categories: [''], relatedPartyDeclaration: false, validUntil: '' })

export function HedVendorVerification() {
  const cache = useQueryClient(), key = ['hed-vendor-verifications']
  const vendors = useQuery({ queryKey: key, queryFn: ({ signal }) => listHedVendorVerifications(signal), retry: false })
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setSaved('')
    try {
      await verifyHedVendor({ ...form, vendorWallet: form.vendorWallet.toLowerCase() as `0x${string}`, categories: form.categories.map(value => value.trim()).filter(Boolean), validUntil: new Date(form.validUntil).toISOString() })
      setForm(initial()); setSaved('Đã lưu hồ sơ vendor VERIFIED; organization chỉ có thể chọn vendor còn hiệu lực.')
      await cache.invalidateQueries({ queryKey: key })
    } catch (cause) { setError(getErrorMessage(cause)) } finally { setBusy(false) }
  }
  return <section className="panel"><h1>HED · xác thực vendor</h1><p>ADMIN xác minh recipient trước khi request được chốt. Đây là hồ sơ off-chain; không chuyển tiền và không thay thế terms do vendor ký trên chain.</p>
    {error && <p className="toast toast--error" role="alert">{error}</p>}{saved && <p className="toast toast--success" role="status">{saved}</p>}
    <form className="advance-plan-form" onSubmit={submit}><label>Ví vendor<input required pattern="0x[0-9a-fA-F]{40}" value={form.vendorWallet} onChange={event => setForm(value => ({ ...value, vendorWallet: event.target.value as `0x${string}` }))} /></label><label>Tên pháp lý<input required minLength={2} value={form.legalName} onChange={event => setForm(value => ({ ...value, legalName: event.target.value }))} /></label><label>Liên hệ<input required minLength={3} value={form.contact} onChange={event => setForm(value => ({ ...value, contact: event.target.value }))} /></label><label>Nhóm hàng/dịch vụ (mỗi dòng một nhóm)<textarea required value={form.categories.join('\n')} onChange={event => setForm(value => ({ ...value, categories: event.target.value.split('\n') }))} /></label><label>Còn hiệu lực đến<input required type="datetime-local" value={form.validUntil} onChange={event => setForm(value => ({ ...value, validUntil: event.target.value }))} /></label><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Đang lưu…' : 'Xác thực vendor'}</button></form>
    <h2>Hồ sơ đã xác thực</h2>{vendors.isPending ? <p role="status">Đang tải vendor…</p> : vendors.isError ? <p role="alert">{getErrorMessage(vendors.error)}</p> : vendors.data.length === 0 ? <p>Chưa có vendor HED.</p> : <ul className="organization-list">{vendors.data.map(vendor => <li className="panel" key={vendor.id}><strong>{vendor.content.legalName}</strong><p>{vendor.vendorWallet} · hiệu lực đến {new Date(vendor.validUntil).toLocaleString('vi-VN')}</p><p>{vendor.content.categories.join(', ')}</p></li>)}</ul>}
  </section>
}
