import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { downloadEvidenceDocument, uploadEvidenceDocument } from '../../lib/api/evidence-drafts'
import type { EvidenceDraft, EvidenceDraftContent } from '../../lib/api/evidence-drafts'
import { getErrorMessage } from '../../lib/api/error'

const kinds = {
  REPORT: 'Báo cáo', INVOICE: 'Hóa đơn', RECEIPT: 'Biên nhận', PAYMENT_PROOF: 'Chứng từ thanh toán',
  DELIVERY_RECORD: 'Biên bản bàn giao', PHOTO: 'Ảnh', OTHER: 'Khác',
}

export function EvidenceDocuments({ campaignId, draft, draftKey, disabled, onBusy, onConflict }: {
  campaignId: string
  draft: EvidenceDraft
  draftKey: (string | undefined)[]
  disabled: boolean
  onBusy: (busy: boolean) => void
  onConflict: () => void
}) {
  const [kind, setKind] = useState<EvidenceDraftContent['documents'][number]['kind']>('REPORT')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  useEffect(() => () => controllerRef.current?.abort(), [])

  function selectFile(file?: File) {
    setError('')
    setSelectedFile(null)
    if (!file) return
    if (!file.size || file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setError('Chọn PDF, JPEG hoặc PNG, tối đa 10 MiB/file.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setSelectedFile(file)
  }

  async function upload() {
    if (!selectedFile || disabled || controllerRef.current || draft.content.documents.length >= 20) return
    setError('')
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    onBusy(true)
    try {
      const saved = await uploadEvidenceDocument(campaignId, draft.milestoneIndex, draft.revision, kind, selectedFile, controller.signal)
      if (!controller.signal.aborted) {
        setSelectedFile(null)
        if (inputRef.current) inputRef.current.value = ''
        queryClient.setQueryData(draftKey, saved)
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (axios.isAxiosError(cause) && cause.response?.status === 409) onConflict()
        setError(getErrorMessage(cause))
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        onBusy(false)
      }
      controllerRef.current = null
    }
  }

  async function download(document: EvidenceDraftContent['documents'][number]) {
    if (controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const blob = await downloadEvidenceDocument(campaignId, draft.milestoneIndex, document.documentId, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.originalName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      if (!controller.signal.aborted) setError('Không tải được tài liệu. Kiểm tra phiên đăng nhập và thử lại.')
    } finally {
      if (!controller.signal.aborted) { setBusy(false); onBusy(false) }
      controllerRef.current = null
    }
  }

  return (
    <section className="panel" aria-labelledby="evidence-documents-heading">
      <h2 id="evidence-documents-heading">Tài liệu ({draft.content.documents.length}/20)</h2>
      <p className="muted">PDF, JPEG, PNG · tối đa 10 MiB/file. Bản gốc chỉ được tải bởi người có quyền quản lý hồ sơ.</p>
      <div className="organization-form">
        <label htmlFor="evidence-document-kind">Loại tài liệu</label>
        <select id="evidence-document-kind" value={kind} disabled={disabled || busy}
          onChange={(event) => setKind(event.target.value as typeof kind)}>
          {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label htmlFor="evidence-document-file">Chọn tài liệu</label>
        <input ref={inputRef} id="evidence-document-file" type="file" accept="application/pdf,image/jpeg,image/png"
          disabled={disabled || busy || draft.content.documents.length >= 20}
          aria-describedby="evidence-upload-help"
          onChange={(event) => selectFile(event.target.files?.[0])} />
        <p id="evidence-upload-help" className="muted">Chọn loại và file, rồi bấm “Thêm chứng cứ” để tải lên. Có thể thêm lần lượt tối đa 20 tài liệu.</p>
        <div className="organization-form-actions">
          <button type="button" className="button button--primary"
            disabled={!selectedFile || disabled || busy || draft.content.documents.length >= 20}
            onClick={() => void upload()}>Thêm chứng cứ</button>
        </div>
        {disabled && <p className="muted">Lưu thay đổi hoặc tải bản mới nhất trước khi thêm tài liệu.</p>}
        {busy && <p role="status">Đang xử lý tài liệu…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <ul className="organization-list">{draft.content.documents.map((document) => (
        <li key={document.documentId} className="organization-card-heading">
          <div><strong>{document.originalName}</strong>
            <p className="muted">{kinds[document.kind]} · {(document.byteSize / 1024).toFixed(1)} KiB · Bản gốc riêng tư</p></div>
          <button type="button" className="button button--secondary" disabled={busy}
            onClick={() => void download(document)}>Tải về</button>
        </li>
      ))}</ul>
    </section>
  )
}
