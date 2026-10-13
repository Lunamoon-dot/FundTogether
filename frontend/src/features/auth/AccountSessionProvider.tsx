import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import axios from 'axios'
import { useConnections, useDisconnect } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { getSession } from '../../lib/api/auth'
import type { AccountSession } from '../../lib/api/auth'
import { getErrorMessage } from '../../lib/api/error'

interface SessionState {
  session: AccountSession | null
  setSession: (session: AccountSession | null) => void
  sessionLoading: boolean
  sessionError: string
  setSessionError: (error: string) => void
}

const SessionContext = createContext<SessionState | null>(null)

export function AccountSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AccountSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const connections = useConnections()
  const { disconnect } = useDisconnect()
  const previousAccountId = useRef<string | null | undefined>(undefined)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (sessionLoading) return
    const accountId = session?.userId ?? null
    if (previousAccountId.current === accountId) return
    if (previousAccountId.current !== undefined) queryClient.removeQueries({ predicate: q => String(q.queryKey[0]).startsWith('reward-') })
    previousAccountId.current = accountId

    for (const connection of connections) {
      const belongsToAccount = session?.wallets.some(
        (wallet) =>
          wallet.chainId === connection.chainId &&
          connection.accounts.some(
            (address) => address.toLowerCase() === wallet.address.toLowerCase(),
          ),
      )
      if (!belongsToAccount) disconnect({ connector: connection.connector })
    }
  }, [session, sessionLoading, connections, disconnect, queryClient])

  useEffect(() => {
    let active = true
    getSession()
      .then((account) => {
        if (active) setSession(account)
      })
      .catch((cause: unknown) => {
        if (
          active &&
          (!axios.isAxiosError(cause) || cause.response?.status !== 401)
        )
          setSessionError(getErrorMessage(cause))
      })
      .finally(() => {
        if (active) setSessionLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <SessionContext.Provider
      value={{
        session,
        setSession,
        sessionLoading,
        sessionError,
        setSessionError,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

// The hook shares this module with its small provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAccountSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('AccountSessionProvider is required')
  return context
}
