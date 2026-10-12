import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountSession } from '../features/auth/AccountSessionProvider'
import { PublicArea } from '../features/explore/PublicArea'
import { InternalArea } from '../features/review/InternalArea'
import { OrganizationWorkspace } from '../features/organizations/OrganizationWorkspace'
import { HedPublicCampaign } from '../features/explore/HedPublicCampaign'
import { isHed } from '../lib/web3/deployment-context'
import type { AccountSession } from '../lib/api/auth'
import './App.css'

function App() {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || '/')
  const { session, setSession, sessionLoading, sessionError, setSessionError } = useAccountSession()
  const queryClient = useQueryClient()

  useEffect(() => {
    const changed = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])

  function changeSession(next: AccountSession | null) {
    setSessionError('')
    if (next?.userId !== session?.userId) {
      for (const prefix of ['campaigns', 'organizations', 'organization-campaigns', 'organization-campaign',
        'organization-evidence', 'review-access', 'review-campaigns', 'review-campaign',
        'publication-submission', 'campaign-publication']) {
        queryClient.removeQueries({ queryKey: [prefix] })
      }
    }
    setSession(next)
    if (!next) window.location.hash = '/'
  }

  if (path === '/internal' || path.startsWith('/internal/')) {
    return <InternalArea path={path} session={session} sessionLoading={sessionLoading} />
  }

  const hedCampaign = isHed ? /^\/hed\/campaigns\/(\d+)$/.exec(path) : null
  if (hedCampaign) return <HedPublicCampaign campaignId={hedCampaign[1]} />

  const scopedWorkspace = /^\/organizations\/([^/]+)\/workspace(\/.*)?$/.exec(path)
  const workspace = path === '/workspace' || path.startsWith('/workspace/')
  const organizations = path === '/organizations' || /^\/organizations\/[^/]+$/.test(path)
  if (scopedWorkspace || workspace || organizations) {
    return <OrganizationWorkspace key={session?.userId ?? 'anonymous'}
      organizationId={scopedWorkspace?.[1]}
      section={scopedWorkspace ? scopedWorkspace[2] ?? '/campaigns' : organizations ? path : path.slice('/workspace'.length) || '/campaigns'}
      session={session} sessionLoading={sessionLoading} sessionError={sessionError} onSession={changeSession} />
  }

  return <PublicArea path={path} session={session} sessionLoading={sessionLoading}
    error={sessionError} onSession={changeSession} />
}

export default App
