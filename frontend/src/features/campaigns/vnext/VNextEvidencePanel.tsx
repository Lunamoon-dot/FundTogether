import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';

export function VNextEvidencePanel({ reviewCaseId, enabled = true }: { reviewCaseId: string; enabled?: boolean }) {
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const evidence = useQuery({
    queryKey: ['vnext-case-evidence', reviewCaseId],
    queryFn: ({ signal }) => campaignApi.vnextEvidence(reviewCaseId, signal),
    enabled: enabled && Boolean(reviewCaseId),
    retry: false,
  });

  const upload = async () => {
    if (!file || !summary.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await campaignApi.vnextUploadEvidence(reviewCaseId, summary.trim(), file);
      setFile(null);
      setSummary('');
      await evidence.refetch();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;
  return (
    <section className="border-t border-[var(--border-hairline)] pt-3 space-y-2" data-vnext-evidence-case={reviewCaseId}>
      <span className="monograph-card__kicker">PRIVATE CASE EVIDENCE</span>
      <p className="text-sm text-[var(--ink-subtle)] m-0">Evidence bytes được lưu private; hash phải khớp evidence hash canonical của review case.</p>
      {evidence.data?.access === 'CREATOR' && (
        <>
          <label className="text-sm block" htmlFor={`vnext-evidence-summary-${reviewCaseId}`}>Evidence summary</label>
          <input id={`vnext-evidence-summary-${reviewCaseId}`} value={summary} onChange={event => setSummary(event.target.value)} placeholder="Mô tả ngắn evidence" />
          <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={event => setFile(event.target.files?.[0] ?? null)} />
          <button type="button" className="button button--secondary" disabled={!file || !summary.trim() || busy} onClick={() => void upload()}>Upload private evidence</button>
        </>
      )}
      {evidence.data?.evidence.length ? evidence.data.evidence.map(item => (
        <a key={item.evidenceHash} className="text-sm block font-mono break-all" href={campaignApi.vnextEvidenceFileUrl(reviewCaseId, item.evidenceHash)} download>
          Tải evidence {item.evidenceHash} · {item.sizeBytes} bytes
        </a>
      )) : evidence.isPending ? <p className="text-sm muted m-0">Đang đọc evidence ACL…</p> : <p className="text-sm muted m-0">Chưa có private evidence đã xác minh.</p>}
      {evidence.error && <p className="text-sm text-[var(--ink-subtle)] m-0">Case evidence chỉ hiển thị cho Creator hoặc Judge được assign.</p>}
      {error && <p className="monograph-alert monograph-alert--error" role="alert">{error}</p>}
    </section>
  );
}
