export interface CampaignDossierListProps {
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
}

function DossierItem({ number, label, children, icon }: { number: string; label: string; children: string; icon: 'outline' | 'budget' | 'evidence' }) {
  return (
    <details className="monograph-dossier">
      <summary className="monograph-dossier__summary">
        <div className="monograph-dossier__left">
          <span className="monograph-dossier__tag">{number}</span>
          {icon === 'outline' && (
            <svg className="monograph-dossier__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="9" x2="15" y2="9" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          )}
          {icon === 'budget' && (
            <svg className="monograph-dossier__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          )}
          {icon === 'evidence' && (
            <svg className="monograph-dossier__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          )}
          <span className="monograph-dossier__label">{label}</span>
        </div>
        <span className="monograph-dossier__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </span>
      </summary>
      <div className="monograph-dossier__content">
        {children || <span className="italic text-[var(--ink-subtle)]">Chưa có nội dung chi tiết.</span>}
      </div>
    </details>
  );
}

export function CampaignDossierList({ contentOutline, budgetPlan, evidencePlan }: CampaignDossierListProps) {
  return (
    <div className="monograph-dossier-stack">
      <DossierItem number="01" label="Đề cương nội dung" icon="outline">{contentOutline}</DossierItem>
      <DossierItem number="02" label="Kế hoạch ngân sách" icon="budget">{budgetPlan}</DossierItem>
      <DossierItem number="03" label="Kế hoạch bằng chứng" icon="evidence">{evidencePlan}</DossierItem>
    </div>
  );
}
