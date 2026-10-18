import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountSession } from '../features/auth/AccountSessionProvider'
import { PublicArea } from '../features/explore/PublicArea'
import type { AccountSession } from '../lib/api/auth'
import './App.css'

function canonicalHashPath() {
  const path = window.location.hash.slice(1) || '/'
  if (path !== '/campaigns' && !path.startsWith('/campaigns/')) return path

  const suffix = path.slice('/campaigns'.length)
  const canonical = suffix === '/campaigns' || suffix.startsWith('/campaigns/')
    ? `/campaigns${suffix.slice('/campaigns'.length)}`
    : `/campaigns${suffix}`
  window.history.replaceState(null, '', `#${canonical}`)
  return canonical
}

function App() {
  const [path, setPath] = useState(canonicalHashPath)
  const { session, setSession, sessionLoading, sessionError, setSessionError } = useAccountSession()
  const queryClient = useQueryClient()

  useEffect(() => {
    const changed = () => setPath(canonicalHashPath())
    changed()
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])

  function changeSession(next: AccountSession | null) {
    setSessionError('')
    if (next?.userId !== session?.userId) {
      for (const prefix of ['campaigns', 'review-access', 'review-campaigns', 'review-campaign',
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
