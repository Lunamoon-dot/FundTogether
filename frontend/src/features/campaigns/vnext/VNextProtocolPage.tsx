import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { VNextActionPanel, VNextMilestoneActions } from './VNextActionPanel';
import { VNextCreateCampaignPanel } from './VNextCreateCampaignPanel';
import { VNextCourtDashboard } from './VNextCourtDashboard';
import { VNextFundingCheckout } from './VNextFundingCheckout';
import { VNextRefundDashboard } from './VNextRefundDashboard';
import { displayVNextTokenAmount } from './vnext-refund-flow';

const campaignStates = ['Chờ publication Judge', 'Đang nhận đóng góp', 'Đã đạt mục tiêu', 'Đang thực hiện milestone', 'Đã hoàn thành', 'Đang hoàn tiền', 'Đang xử lý phần tiền còn lại', 'Đã quyết toán hoàn tiền'];
const milestoneStates = ['Chờ Creator gửi evidence', 'Đã gửi evidence', 'Đang chọn Judge', 'Đang review vòng đầu', 'Chờ review lại', 'Đã có kết quả sơ bộ', 'Đang mở kháng nghị', 'Đã có kết quả cuối', 'Đủ điều kiện payout', 'Đang mở challenge', 'Đã payout', 'Đang correction', 'Đã gửi bản sửa', 'Đã kết thúc'];

export function VNextProtocolPage({ campaignId }: { campaignId?: string }) {
  const { session } = useAccountSession();
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);
  const deployment = useQuery({ queryKey: ['vnext-deployment'], queryFn: campaignApi.vnextDeployment, retry: false });
  const indexer = useQuery({ queryKey: ['vnext-indexer'], queryFn: ({ signal }) => campaignApi.vnextIndexer(signal), retry: false });
  const campaign = useQuery({
    queryKey: ['vnext-campaign', campaignId],
    queryFn: ({ signal }) => campaignApi.vnextCampaign(campaignId!, signal),
    enabled: Boolean(campaignId),
    retry: false,
  });
  const milestones = useQuery({
    queryKey: ['vnext-milestones', campaignId],
    queryFn: ({ signal }) => campaignApi.vnextMilestones(campaignId!, signal),
    enabled: Boolean(campaignId),
    retry: false,
  });
  const reviews = useQuery({
    queryKey: ['vnext-reviews', deployment.data?.juryReview],
    queryFn: ({ signal }) => campaignApi.vnextReviews(signal),
    enabled: Boolean(campaignId && deployment.data?.configured),
    retry: false,
  });
  const selectedMilestone = milestones.data?.find(milestone => milestone.milestoneId === selectedMilestoneId);
  const selectedReview = selectedMilestone?.reviewCaseId
    ? reviews.data?.find(review => review.reviewCaseId.toLowerCase() === selectedMilestone.reviewCaseId?.toLowerCase())
    : undefined;
  const localDemoReady = Boolean(
    deployment.data?.configured
      && indexer.data?.configured
      && indexer.data.status === 'synced'
      && indexer.data.lagBlocks === '0',
  );
  const refreshCampaign = () => {
    void Promise.all([
      indexer.refetch(),
      campaign.refetch(),
      milestones.refetch(),
      reviews.refetch(),
    ]);
  };

  return (
    <div className="campaign-container space-y-4">
      <section className="campaign-hero space-y-3">
        <span className="campaign-eyebrow">FUNDTOGETHER · LOCAL DEMO</span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0">{campaignId ? `Campaign #${campaignId}` : 'Kiểm thử Protocol VNext'}</h1>
          {deployment.data?.configured && <span className="status-pill" role="status">{localDemoReady ? 'Demo sẵn sàng' : 'Đang kiểm tra đồng bộ'}</span>}
        </div>
        {campaignId ? (
          <a className="text-sm underline" href="#/campaigns/vnext">Quay lại trang demo VNext</a>
        ) : (
          <p className="m-0">Creator tự tạo campaign, không cần Resolver/Admin duyệt trước. Judge review quyết định khi nào funding được mở; sau đó bạn có thể thử đóng góp và gửi evidence milestone.</p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>Mạng local · chain 31339</span>
          <span>Token thử nghiệm · MockUSDC</span>
          {indexer.data?.configured && <span data-vnext-read="indexer-status" role="status">
            Indexer: {indexer.data.status === 'synced' && indexer.data.lagBlocks === '0' ? 'đã đồng bộ' : 'đang xử lý'}
            {indexer.data.lagBlocks !== null && indexer.data.lagBlocks !== undefined ? ` · trễ ${indexer.data.lagBlocks} block` : ''}
          </span>}
        </div>
        {deployment.data?.configured ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Thông tin kỹ thuật cho người test</summary>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              <div><dt className="muted">Policy hash</dt><dd className="font-mono break-all">{deployment.data.policyHash}</dd></div>
              <div><dt className="muted">Campaign escrow</dt><dd className="font-mono break-all">{deployment.data.campaignEscrow}</dd></div>
              <div><dt className="muted">Review engine</dt><dd className="font-mono break-all">{deployment.data.juryReview}</dd></div>
              <div><dt className="muted">Indexer checkpoint / head</dt><dd>{indexer.data?.lastBlock ?? '—'} / {indexer.data?.headBlock ?? '—'}</dd></div>
            </dl>
          </details>
        ) : deployment.isPending ? (
          <p role="status" className="muted">Đang kiểm tra cấu hình deployment VNext local…</p>
        ) : (
          <p className="monograph-alert monograph-alert--error">Chưa có manifest/deployment VNext local.</p>
        )}
        {indexer.data?.error && <p role="alert" className="text-sm text-[var(--danger)] m-0">Indexer: {indexer.data.error}</p>}
      </section>

      {!campaignId && <section className="monograph-card space-y-3" aria-labelledby="vnext-test-path-title">
        <div>
          <span className="monograph-card__kicker">LỘ TRÌNH KIỂM THỬ</span>
          <h2 id="vnext-test-path-title" className="monograph-card__title">Từ tạo campaign đến payout</h2>
        </div>
        <ol className="grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label="Các bước kiểm thử VNext">
          <li className="rounded border border-[var(--border-hairline)] p-3 text-sm"><strong>1 · Creator</strong><p className="mb-0 mt-1">Tạo campaign và mở publication Judge case.</p></li>
          <li className="rounded border border-[var(--border-hairline)] p-3 text-sm"><strong>2 · Judge</strong><p className="mb-1 mt-1">Judge được phân công review; final outcome mới mở funding.</p><a href="#/campaigns/vnext/judge" className="underline">Mở Judge workspace</a></li>
          <li className="rounded border border-[var(--border-hairline)] p-3 text-sm"><strong>3 · Backer</strong><p className="mb-0 mt-1">Đóng góp sau khi Judge chấp thuận publication và funding mở.</p></li>
          <li className="rounded border border-[var(--border-hairline)] p-3 text-sm"><strong>4 · Milestone</strong><p className="mb-0 mt-1">Creator gửi evidence; Judge review; payout theo kết quả canonical.</p></li>
        </ol>
      </section>}

      {campaignId && campaign.error && <p role="alert" className="monograph-alert monograph-alert--error">{getErrorMessage(campaign.error)}</p>}
      {campaignId && reviews.error && <p role="alert" className="monograph-alert monograph-alert--error">Không tải được Court projection: {getErrorMessage(reviews.error)}</p>}
      {!campaignId && deployment.data?.configured && <VNextCreateCampaignPanel deployment={deployment.data} />}
      {campaign.data && <>
        <section className="monograph-card space-y-3">
          <span className="monograph-card__kicker">TRẠNG THÁI CAMPAIGN</span>
          <h2 className="monograph-card__title">{campaignStates[campaign.data.state] ?? `Trạng thái ${campaign.data.state}`}</h2>
          <p className="monograph-card__desc">
            Đã nhận {displayVNextTokenAmount(campaign.data.raised, deployment.data?.tokenDecimals)} · Đã payout {displayVNextTokenAmount(campaign.data.paidOut, deployment.data?.tokenDecimals)} · Đã hoàn {displayVNextTokenAmount(campaign.data.refunded, deployment.data?.tokenDecimals)}
          </p>
          <p className="text-xs font-mono break-all">Terms {campaign.data.termsHash} · event gần nhất {campaign.data.lastEventName} · block {campaign.data.lastBlockNumber}</p>
        </section>
        {deployment.data?.configured && campaignId && (
          <VNextFundingCheckout
            campaignId={campaignId}
            userId={session?.userId}
            campaign={campaign.data}
            deployment={deployment.data}
            onRefresh={refreshCampaign}
          />
        )}
        {deployment.data?.configured && campaignId && (
          <VNextRefundDashboard
            campaignId={campaignId}
            userId={session?.userId}
            campaign={campaign.data}
            deployment={deployment.data}
            onRefresh={refreshCampaign}
          />
        )}
        <section className="monograph-card space-y-3">
          <span className="monograph-card__kicker">MILESTONE REVIEW</span>
          {milestones.isPending ? <p className="muted" role="status">Đang tải milestone projection…</p> : milestones.data?.length ? milestones.data.map(milestone => (
            <article key={milestone.milestoneId} className="border-t border-[var(--border-hairline)] pt-3">
              <strong>Milestone {milestone.milestoneId} · {milestoneStates[milestone.state] ?? `Trạng thái ${milestone.state}`}</strong>
              <p className="text-sm text-[var(--ink-subtle)] m-0">Bản evidence {milestone.evidenceRevision} · {milestone.paid ? 'đã payout' : 'chưa payout'}</p>
              {milestone.reviewCaseId && <code className="text-xs break-all">Review case {milestone.reviewCaseId}</code>}
              <div className="mt-2">
                <button
                  type="button"
                  className="button button--secondary"
                  aria-expanded={selectedMilestoneId === milestone.milestoneId}
                  onClick={() => setSelectedMilestoneId(current => current === milestone.milestoneId ? null : milestone.milestoneId)}
                >
                  {selectedMilestoneId === milestone.milestoneId ? 'Đóng bảng điều khiển milestone' : 'Mở bảng điều khiển milestone'}
                </button>
              </div>
            </article>
          )) : <p className="muted">Chưa có milestone projection.</p>}
        </section>
        {selectedMilestone && deployment.data?.configured ? (
          reviews.isPending ? (
            <p role="status" className="muted">Đang tải Court Dashboard…</p>
          ) : (
            <VNextCourtDashboard
              campaignId={campaignId!}
              milestone={selectedMilestone}
              review={selectedReview}
              indexer={indexer.data}
              payoutWallet={campaign.data.payoutWallet}
              onRefresh={refreshCampaign}
            >
              <VNextMilestoneActions
                key={selectedMilestone.milestoneId}
                campaignId={campaignId!}
                campaign={campaign.data}
                milestone={selectedMilestone}
                review={selectedReview}
                deployment={deployment.data}
                userId={session?.userId}
                onRefresh={refreshCampaign}
              />
            </VNextCourtDashboard>
          )
        ) : null}
        {deployment.data?.configured && campaignId && campaign.data && (
          <VNextActionPanel
            campaignId={campaignId!}
            userId={session?.userId}
            campaign={campaign.data}
            deployment={deployment.data}
            onRefresh={refreshCampaign}
          />
        )}
      </>}
    </div>
  );
}
