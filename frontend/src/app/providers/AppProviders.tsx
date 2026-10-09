import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { AccountSessionProvider } from '../../features/auth/AccountSessionProvider'
import {
  connectorsForWallets,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit'
import {
  braveWallet,
  metaMaskWallet,
  rabbyWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { WagmiProvider, createConfig, http } from 'wagmi'
import deployment, { activeChain } from '../../lib/web3/deployment-context'

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Browser wallets',
      wallets: [braveWallet, metaMaskWallet, rabbyWallet],
    },
  ],
  {
    appName: 'FundTogether',
    // Required by RainbowKit's connector helper; WalletConnect is not enabled here.
    projectId: 'fundtogether-local',
  },
)

const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors,
  transports: { [activeChain.id]: http(deployment.rpcUrl, { timeout: 8_000, retryCount: 0 }) },
})

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
