import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listHistoricalCampaigns } from '../../../lib/api/historical-campaigns';
import type { CampaignRecord } from '../../../lib/api/historical-campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import '../shared/styles.css';

export function HistoricalFeed() {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const { data: campaigns, isPending, isError, error, refetch } = useQuery({
    queryKey: ['campaign-public-campaigns'],
    queryFn: ({ signal }) => listHistoricalCampaigns(signal),
    refetchInterval: 10_000,
  });

  if (isPending) {
    return (
      <div className="campaign-container">
        <p role="status" className="muted">Đang tải danh sách dự án Truyện tranh & Artbook…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="campaign-container">
        <section className="panel">
          <p role="alert" className="toast toast--error">{getErrorMessage(error)}</p>
          <button className="button button--secondary" onClick={() => void refetch()}>Thử lại</button>
        </section>
      </div>
    );
  }

  const filtered = (campaigns || []).filter(c =>
    selectedCategory === 'ALL' ? true : c.category === selectedCategory
  );

  return (
    <div className="campaign-container">
      <a className="public-back" href="#/campaigns" style={{ margin: '16px 0 24px', display: 'inline-block' }}>← Về trang campaign</a>

      {/* Category filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>Thể loại:</span>
        {(['ALL', 'COMICS', 'ARTBOOK', 'ILLUSTRATION'] as const).map(cat => (
          <button
            key={cat}
            className={`button ${selectedCategory === cat ? 'button--primary' : 'button--secondary'}`}
            style={{ fontSize: '12px', padding: '6px 12px' }}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === 'ALL' ? 'Tất cả' : cat === 'COMICS' ? 'Truyện tranh (Comics)' : cat === 'ARTBOOK' ? 'Artbook / Sách ảnh' : 'Tranh minh họa'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <section className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h2>Chưa có dự án nào trong mục này</h2>
          <p className="muted">Không có hồ sơ lịch sử trong mục này.</p>
          <a className="button button--primary" href="#/campaigns" style={{ marginTop: '12px' }}>
            Về campaign
          </a>
        </section>
      ) : (
        <div className="campaign-campaigns-grid">
          {filtered.map(c => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignRecord }) {
  const goalNum = Number(campaign.goal) / 1e6;
  const pledgedTotal = (campaign.tiers || []).reduce((acc, t) => {
    return acc + (Number(t.price) * t.pledgedQuantity) / 1e6;
  }, 0);
  const pct = goalNum > 0 ? Math.min(100, Math.round((pledgedTotal / goalNum) * 100)) : 0;

  return (
    <article className="campaign-card">
      <div className="campaign-card-cover">
        <span className="campaign-pill-digital">
          {campaign.category === 'COMICS' ? 'Truyện tranh' : campaign.category === 'ARTBOOK' ? 'Artbook' : 'Minh họa'}
        </span>
        <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}>
          {campaign.status === 'PUBLISHED' || campaign.status === 'ACTIVE'
            ? 'Đang gây quỹ'
            : campaign.status === 'PRODUCTION_VERIFIED'
            ? 'Đã nghiệm thu in'
            : campaign.status === 'COMPLETED'
            ? 'Đã hoàn thành'
            : 'Bản thảo'}
        </span>
      </div>
      <div className="campaign-card-body">
        <h3 className="campaign-card-title">{campaign.title}</h3>
        <p className="campaign-card-pitch">{campaign.pitch}</p>

        <div className="campaign-progress-bar">
          <div className="campaign-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="campaign-meta-row">
          <span>Đã góp: <strong>{pledgedTotal.toLocaleString()} USDC</strong></span>
          <span>{pct}% của {goalNum.toLocaleString()} USDC</span>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {campaign.tiers?.length ?? 0} gói quà tặng
          </span>
          <a className="button button--secondary" href={`#/campaigns/${campaign.id}`}>
            Xem chi tiết & Ủng hộ
          </a>
        </div>
      </div>
    </article>
  );
}
