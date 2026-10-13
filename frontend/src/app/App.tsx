import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountSession } from '../features/auth/AccountSessionProvider'
import { PublicArea } from '../features/explore/PublicArea'
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

  return <PublicArea path={path} session={session} sessionLoading={sessionLoading}
    error={sessionError} onSession={changeSession} />
}

export default App
