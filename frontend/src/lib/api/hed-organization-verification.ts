import { http } from './http'

export type OrganizationVerificationContent = { legalName: string; registrationNumber: string; contactName: string; contactEmail: string; address: string; activitySummary: string; declaration: true }
export type OrganizationVerificationRequest = { id: string; status: string; content: OrganizationVerificationContent; reviewNote: string | null; submittedAt: string | null; createdAt: string }
export type OrganizationVerificationQueueItem = { id: string; organizationId: string; organizationName: string; content: OrganizationVerificationContent; submittedAt: string; createdBy: string }

export async function listOrganizationVerificationRequests(organizationId: string) { const { data } = await http.get<OrganizationVerificationRequest[]>(`/v1/disbursement/organization-verification/organizations/${organizationId}`); return data }
export async function saveOrganizationVerification(organizationId: string, content: OrganizationVerificationContent) { const { data } = await http.post<OrganizationVerificationRequest>(`/v1/disbursement/organization-verification/organizations/${organizationId}`, content); return data }
export async function submitOrganizationVerification(requestId: string) { const { data } = await http.post<OrganizationVerificationRequest>(`/v1/disbursement/organization-verification/requests/${requestId}/submit`); return data }
export async function uploadOrganizationVerificationDocument(requestId: string, file: File) { const body = new FormData(); body.append('file', file); const { data } = await http.post(`/v1/disbursement/organization-verification/requests/${requestId}/documents`, body, { headers: { 'Content-Type': 'multipart/form-data' } }); return data }
export async function listOrganizationVerificationQueue() { const { data } = await http.get<OrganizationVerificationQueueItem[]>('/v1/disbursement/organization-verification/internal/queue'); return data }
export async function decideOrganizationVerification(requestId: string, input: { decision: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT'; note: string; validUntil?: string }) { const { data } = await http.post(`/v1/disbursement/organization-verification/internal/requests/${requestId}/decision`, input); return data }
