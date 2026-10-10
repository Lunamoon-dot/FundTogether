import { createConfig, http } from 'wagmi'
import type { Chain } from 'viem'

export function createBrowserWalletConfig(chain: Chain, rpcUrl: string) {
  return createConfig({
    chains: [chain],
    // Use each extension's announced provider. A preset with the same rdns
    // would shadow discovery and route MetaMask requests through its SDK.
    connectors: [],
    multiInjectedProviderDiscovery: true,
    transports: { [chain.id]: http(rpcUrl, { timeout: 8_000, retryCount: 0 }) },
  })
}
