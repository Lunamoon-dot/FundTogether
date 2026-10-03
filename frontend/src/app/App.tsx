import { useEffect, useState } from 'react'

import axios from 'axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { WalletSignIn } from '../features/auth/WalletSignIn'
import { CampaignWizard } from '../features/campaigns/CampaignWizard'
import { getSession } from '../lib/api/auth'
import type { WalletSession } from '../lib/api/auth'
import { getCampaignDraft, listCampaignDrafts } from '../lib/api/campaigns'
import type { CampaignDraft, CampaignDraftDetail } from '../lib/api/campaigns'
import { getErrorMessage } from '../lib/api/error'
import './App.css'

function App() {
  const [page, setPage] = useState<
    'overview' | 'campaigns' | 'campaign-detail' | 'evidence'
  >('overview')
  const [session, setSession] = useState<WalletSession | null>(null)
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [campaign, setCampaign] = useState<CampaignDraftDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const campaignsQuery = useQuery({
    queryKey: ['campaigns', session?.userId],
    queryFn: listCampaignDrafts,
    enabled: Boolean(session),
    retry: false,
  })

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch((cause: unknown) => {
        if (!axios.isAxiosError(cause) || cause.response?.status !== 401) {
          setError(getErrorMessage(cause))
        }
      })
      .finally(() => setSessionLoading(false))
  }, [])

  async function loadCampaign(campaignId: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const loaded = await getCampaignDraft(campaignId)
      setCampaign(loaded)
      setPage('campaign-detail')
      setNotice('Campaign draft opened.')
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function campaignSaved(saved: CampaignDraftDetail) {
    queryClient.setQueryData<CampaignDraft[]>(
      ['campaigns', session?.userId],
      (current) => {
        const list = current ?? []
        return list.some((item) => item.id === saved.id)
          ? list.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...list]
      },
    )
    void queryClient.invalidateQueries({
      queryKey: ['campaigns', session?.userId],
    })
    setCampaign(saved)
    setCreatingCampaign(false)
    setEditingCampaign(false)
    setPage(editingCampaign ? 'campaign-detail' : 'campaigns')
    setError('')
    setNotice('Đã lưu campaign và milestones. Hồ sơ chưa được nộp xét duyệt.')
  }

  function changeSession(next: WalletSession | null) {
    queryClient.removeQueries({ queryKey: ['campaigns'] })
    setSession(next)
    setCreatingCampaign(false)
    setEditingCampaign(false)
    setCampaign(null)
    setNotice('')
    setError('')
    setPage('overview')
  }

  function navigate(next: typeof page) {
    setEditingCampaign(false)
    setPage(next)
    setNotice('')
    setError('')
  }

  const brand = (
    <a className="brand" href="/" aria-label="FundTogether home">
      <span className="brand-mark">F</span>
      <span>FundTogether</span>
    </a>
  )
  const feedback = (notice || error) && (
    <div
      className={`toast ${error ? 'toast--error' : 'toast--success'}`}
      role={error ? 'alert' : 'status'}
    >
      {error || notice}
    </div>
  )

  if (!session) {
    return (
      <main className="app-shell">
        <header className="site-header">
          {brand}
          <span className="environment-badge">
            <span /> Local development
          </span>
        </header>
        <section className="intro">
          <p className="eyebrow">ORGANIZER WORKSPACE</p>
          <h1>
            Good work starts
            <br />
            with a clear plan.
          </h1>
          <p className="intro-copy">
            Prepare your campaign and keep milestone evidence in one private
            workspace.
          </p>
        </section>
        {sessionLoading ? (
          <section className="panel">Checking your session…</section>
        ) : (
          <WalletSignIn session={null} onSession={changeSession} />
        )}
        {feedback}
      </main>
    )
  }

  const pageLabels = {
    overview: 'Overview',
    campaigns: 'Recent campaigns',
    evidence: 'Evidence',
    'campaign-detail': 'Campaign details',
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {brand}
          <span className="workspace-label">Organizer workspace</span>
        </div>
        <nav className="dashboard-nav" aria-label="Workspace navigation">
          {(['overview', 'campaigns', 'evidence'] as const).map(
            (item, index) => (
              <button
                key={item}
                className={`nav-item${page === item || (item === 'campaigns' && page === 'campaign-detail') ? ' nav-item--active' : ''}`}
                onClick={() => navigate(item)}
                aria-current={
                  page === item ||
                  (item === 'campaigns' && page === 'campaign-detail')
                    ? 'page'
                    : undefined
                }
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  {index === 0 ? (
                    <>
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </>
                  ) : index === 1 ? (
                    <>
                      <path d="M3 7h7l2-3h9v16H3z" />
                      <path d="M3 9h18" />
                    </>
                  ) : (
                    <>
                      <path d="M6 3h9l4 4v14H6z" />
                      <path d="M14 3v5h5M9 12h7M9 16h5" />
                    </>
                  )}
                </svg>
                {pageLabels[item]}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-account">
          <WalletSignIn session={session} onSession={changeSession} />
        </div>
      </aside>

      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <span>
            Workspace /{' '}
            <strong>
              {page === 'campaigns' && creatingCampaign
                ? 'Create campaign'
                : pageLabels[page]}
            </strong>
          </span>
          <span className="environment-badge">
            <span /> Local development · 31337
          </span>
        </header>
        <main className="dashboard-content">
          {feedback}
          <div hidden={page !== 'campaigns' || !creatingCampaign}>
            <CampaignWizard
              key={session.userId}
              onClose={() => setCreatingCampaign(false)}
              onSaved={campaignSaved}
            />
          </div>

          {page === 'overview' && (
            <>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Current draft</h2>
                    <span className="state-pill">
                      {campaign ? 'Draft' : 'No draft open'}
                    </span>
                  </div>
                  {campaign ? (
                    <>
                      <h3>{campaign.title}</h3>
                      <p className="muted">
                        {campaign.description || 'No description added yet.'}
                      </p>
                      <button
                        className="button button--secondary"
                        onClick={() => navigate('campaign-detail')}
                      >
                        View campaign →
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="muted">
                        Open a saved campaign draft to prepare its evidence.
                      </p>
                      <button
                        className="button button--secondary"
                        onClick={() => navigate('campaigns')}
                      >
                        Open campaigns →
                      </button>
                    </>
                  )}
                </section>
                <section className="panel">
                  <h2>Before publishing</h2>
                  <ul className="journey-list">
                    <li>
                      <span>01</span> Prepare campaign details
                    </li>
                    <li>
                      <span>02</span> Define milestones and criteria
                    </li>
                    <li>
                      <span>03</span> Lock bond and publish on chain
                    </li>
                  </ul>
                  <p className="small-copy">
                    Milestone setup and publishing are not available yet.
                  </p>
                </section>
              </div>
            </>
          )}

          {page === 'campaigns' && !creatingCampaign && (
            <>
              <section
                className="campaign-start"
                aria-label="Create a campaign"
              >
                <h2>Start a new campaign</h2>
                <button
                  type="button"
                  className="new-campaign-tile"
                  disabled={busy}
                  onClick={() => {
                    setCreatingCampaign(true)
                    setNotice('')
                    setError('')
                  }}
                >
                  <span className="new-campaign-preview">
                    <svg
                      width="54"
                      height="54"
                      viewBox="0 0 54 54"
                      aria-hidden="true"
                    >
                      <path
                        d="M27 8v38M8 27h38"
                        stroke="currentColor"
                        strokeWidth="7"
                      />
                    </svg>
                  </span>
                  <span>Create campaign</span>
                </button>
              </section>
              <section
                className="campaign-gallery"
                aria-busy={campaignsQuery.isFetching}
              >
                <div className="panel-heading">
                  <h2>Recent campaigns</h2>
                  <div className="campaign-list-actions">
                    <button
                      className="button button--quiet"
                      disabled={busy || campaignsQuery.isFetching}
                      onClick={() => void campaignsQuery.refetch()}
                    >
                      {campaignsQuery.isFetching ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                </div>
                {campaignsQuery.isPending ? (
                  <p className="muted" role="status">
                    Loading your campaign drafts…
                  </p>
                ) : campaignsQuery.isError ? (
                  <div className="toast toast--error" role="alert">
                    <p>
                      Could not load your drafts:{' '}
                      {getErrorMessage(campaignsQuery.error)}
                    </p>
                    <button
                      className="button button--secondary"
                      disabled={campaignsQuery.isFetching}
                      onClick={() => void campaignsQuery.refetch()}
                    >
                      Try again
                    </button>
                  </div>
                ) : campaignsQuery.data.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-symbol" aria-hidden="true">
                      ≡
                    </span>
                    <h2>No saved campaigns yet</h2>
                    <p>Your saved campaign drafts will appear here.</p>
                  </div>
                ) : (
                  <ul className="campaign-card-grid">
                    {campaignsQuery.data.map((draft) => (
                      <li key={draft.id}>
                        <button
                          className={`campaign-card${campaign?.id === draft.id ? ' campaign-card--selected' : ''}`}
                          disabled={busy}
                          onClick={() => void loadCampaign(draft.id)}
                          aria-label={`Open draft: ${draft.title}`}
                        >
                          <span
                            className="campaign-card-preview"
                            aria-hidden="true"
                          >
                            <span className="campaign-paper">
                              <strong>{draft.title}</strong>
                              <span>
                                {draft.description ||
                                  'No description added yet.'}
                              </span>
                            </span>
                          </span>
                          <span className="campaign-card-info">
                            <strong
                              className="campaign-card-title"
                              title={draft.title}
                            >
                              {draft.title}
                            </strong>
                            <span className="campaign-card-meta">
                              <span className="state-pill">Private draft</span>
                              <span>
                                {new Date(draft.createdAt).toLocaleDateString()}
                              </span>
                            </span>
                            {campaign?.id === draft.id && (
                              <span className="campaign-card-current">
                                Currently open
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {page === 'campaign-detail' && campaign && editingCampaign && (
            <CampaignWizard
              key={campaign.id}
              initialCampaign={campaign}
              onClose={() => setEditingCampaign(false)}
              onSaved={campaignSaved}
            />
          )}

          {page === 'campaign-detail' && campaign && !editingCampaign && (
            <>
              <div className="wizard-toolbar">
                <button
                  className="button button--quiet"
                  onClick={() => navigate('campaigns')}
                >
                  ← Recent campaigns
                </button>
                <span className="state-pill">Private draft</span>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>{campaign.title}</h2>
                  {campaign.status === 'draft' && (
                    <button
                      className="button button--secondary"
                      onClick={() => {
                        setEditingCampaign(true)
                        setNotice('')
                        setError('')
                      }}
                    >
                      Chỉnh sửa
                    </button>
                  )}
                </div>
                <p className="review-description">{campaign.description}</p>
              </section>
              <section className="panel">
                <h2>Milestones ({campaign.milestones.length})</h2>
                {campaign.milestones.length === 0 ? (
                  <p className="muted">
                    Campaign này chưa có milestones đã lưu.
                  </p>
                ) : (
                  campaign.milestones.map((milestone) => (
                    <article key={milestone.id} className="review-milestone">
                      <h3>
                        {milestone.milestoneIndex + 1}. {milestone.title}
                      </h3>
                      <p className="review-description">
                        {milestone.description}
                      </p>
                      <ul>
                        {milestone.acceptanceCriteria.map((criterion) => (
                          <li key={criterion.criterionId}>
                            {criterion.description}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))
                )}
              </section>
            </>
          )}

          {page === 'evidence' &&
            (!campaign ? (
              <section className="panel empty-state">
                <span className="empty-symbol" aria-hidden="true">
                  ≡
                </span>
                <h2>Choose a campaign first</h2>
                <p>Open a campaign draft to prepare its evidence.</p>
                <button
                  className="button button--primary"
                  onClick={() => navigate('campaigns')}
                >
                  Go to campaigns
                </button>
              </section>
            ) : (
              <>
                <div className="campaign-context">
                  <div>
                    <span className="eyebrow">CURRENT CAMPAIGN</span>
                    <strong>{campaign.title}</strong>
                  </div>
                  <button
                    className="button button--quiet"
                    disabled={busy}
                    onClick={() => navigate('campaigns')}
                  >
                    Change campaign
                  </button>
                </div>
                <section className="panel">
                  <h2>Milestone evidence</h2>
                  <p className="muted">
                    Hồ sơ bằng chứng sẽ được mở từ từng milestone của campaign.
                    Danh sách milestones đã lưu hiện chưa khả dụng.
                  </p>
                </section>
              </>
            ))}
          <footer className="site-footer">
            <span>FundTogether</span>
            <span>Private drafts · Not published on chain</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

export default App
