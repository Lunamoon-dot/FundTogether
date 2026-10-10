import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { AccountSessionProvider } from '../../features/auth/AccountSessionProvider'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import deployment, { activeChain } from '../../lib/web3/deployment-context'
import { createBrowserWalletConfig } from '../../lib/web3/wallet-config'

const wagmiConfig = createBrowserWalletConfig(activeChain, deployment.rpcUrl)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AccountSessionProvider>{children}</AccountSessionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
