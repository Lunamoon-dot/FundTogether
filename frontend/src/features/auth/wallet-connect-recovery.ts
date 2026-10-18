export const WALLET_CONNECT_WATCHDOG_MS = 20_000

export function isWalletConnectStalled(isConnecting: boolean, startedAt: number | null, now = Date.now()): boolean {
  return isConnecting && startedAt !== null && now - startedAt >= WALLET_CONNECT_WATCHDOG_MS
}
