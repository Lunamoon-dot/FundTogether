import { http } from './http'

export interface WalletSession {
  userId: string
  address: string
  chainId: number
}

export async function getSession() {
  const { data } = await http.get<WalletSession>('/auth/session')
  return data
}

export async function getNonce() {
  const { data } = await http.get<{ nonce: string }>('/auth/nonce')
  return data.nonce
}

export async function verifySiwe(message: string, signature: string) {
  const { data } = await http.post<WalletSession>('/auth/verify', {
    message,
    signature,
  })
  return data
}

export async function logout() {
  await http.post('/auth/logout')
}
