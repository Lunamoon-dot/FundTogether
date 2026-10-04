import { http } from './http'

export interface Organization {
  id: string
  name: string
  description: string
  createdByUserId: string
  verificationStatus: string
  createdAt: string
  updatedAt: string
  role: 'OWNER'
  representativeWallet: { address: string; chainId: number } | null
}

export interface CreateOrganizationInput {
  name: string
  description: string
}

export async function listOrganizations() {
  const { data } = await http.get<Organization[]>('/organizations')
  return data
}

export async function createOrganization(input: CreateOrganizationInput) {
  const { data } = await http.post<Organization>('/organizations', input)
  return data
}

export async function bindOrganizationWallet(organizationId: string, wallet: { address: string; chainId: number }) {
  const { data } = await http.put<{ organizationId: string; representativeWallet: { address: string; chainId: number } }>(
    `/organizations/${organizationId}/wallet`, wallet,
  )
  return data
}
