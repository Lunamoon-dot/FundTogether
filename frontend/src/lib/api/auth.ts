import { http } from './http'

export interface AccountSession {
  userId: string
  email: string | null
  roles: ('ADMIN' | 'RESOLVER')[]
  wallets: { address: string; chainId: number }[]
}

export interface WalletChallenge {
  nonce: string
  chainId: number
  domain: string
  uri: string
}

export async function getSession() {
  const { data } = await http.get<AccountSession>('/auth/session')
  return data
}

export async function register(email: string, password: string) {
  const { data } = await http.post<AccountSession>('/auth/register', {
    email,
    password,
  })
  return data
}

export async function login(email: string, password: string) {
  const { data } = await http.post<AccountSession>('/auth/login', {
    email,
    password,
  })
  return data
}

export async function getNonce() {
  const { data } = await http.get<WalletChallenge>('/auth/nonce')
  return data
}

export async function getLinkNonce() {
  const { data } = await http.post<WalletChallenge>('/auth/wallets/nonce')
  return data
}

export async function verifySiwe(message: string, signature: string) {
  const { data } = await http.post<AccountSession>('/auth/verify', {
    message,
    signature,
  })
  return data
}

export async function linkWallet(message: string, signature: string) {
  const { data } = await http.post<AccountSession>('/auth/wallets/link', {
    message,
    signature,
  })
  return data
}


export async function logout() {
  await http.post('/auth/logout')
}

export async function unlinkWallet(address: string, chainId: number, password: string) {
  const { data } = await http.post<AccountSession>('/auth/wallets/unlink', { address, chainId, password })
  return data
}
