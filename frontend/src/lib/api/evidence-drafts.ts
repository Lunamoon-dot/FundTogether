import { http } from './http'

export interface EvidenceDraftContent {
  report: {
    summary: string
    performedFrom: string
    performedTo: string
    outcomes: { criterionId: string; description: string; documentIds: string[] }[]
  }
  expenses: {
    expenseId: string
    description: string
    amountMinor: string
    currency: string
    minorUnit: number
    incurredAt: string
    vendorName?: string
    documentIds: string[]
    fundingSource: 'CAMPAIGN' | 'ORGANIZER' | 'OTHER'
  }[]
  documents: {
    documentId: string
    kind:
      | 'REPORT'
      | 'INVOICE'
      | 'RECEIPT'
      | 'PAYMENT_PROOF'
      | 'DELIVERY_RECORD'
      | 'PHOTO'
      | 'OTHER'
    originalName: string
    mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'
    byteSize: number
    sha256: string
    storageObjectId: string
    visibility: 'PUBLIC_REDACTED' | 'RESTRICTED_ORIGINAL'
    relatesToExpenseIds: string[]
    relatesToCriterionIds: string[]
  }[]
}

export interface EvidenceDraft {
  id: string
  campaignMetadataId: string
  milestoneIndex: string
  organizerUserId: string
  evidenceSchemaVersion: '0.1'
  content: EvidenceDraftContent
  revision: number
  createdAt: string
  updatedAt: string
}

const path = (campaignId: string, milestoneIndex: string) =>
  `/campaigns/${campaignId}/milestones/${milestoneIndex}/evidence-draft`

export async function createEvidenceDraft(
  campaignId: string,
  milestoneIndex: string,
  content: EvidenceDraftContent,
  milestoneId: string,
  signal?: AbortSignal,
) {
  const { data } = await http.post<EvidenceDraft>(
    path(campaignId, milestoneIndex),
    { milestoneId, content },
    { signal },
  )
  return data
}

export async function getEvidenceDraft(
  campaignId: string,
  milestoneIndex: string,
  signal?: AbortSignal,
) {
  const { data } = await http.get<EvidenceDraft>(
    path(campaignId, milestoneIndex),
    { signal },
  )
  return data
}

export async function updateEvidenceDraft(
  campaignId: string,
  milestoneIndex: string,
  expectedRevision: number,
  content: EvidenceDraftContent,
  signal?: AbortSignal,
) {
  const { data } = await http.patch<EvidenceDraft>(
    path(campaignId, milestoneIndex),
    { expectedRevision, content },
    { signal },
  )
  return data
}

export async function uploadEvidenceDocument(campaignId: string, milestoneIndex: string,
  expectedRevision: number, kind: EvidenceDraftContent['documents'][number]['kind'], file: File,
  signal?: AbortSignal) {
  const form = new FormData()
  form.append('expectedRevision', String(expectedRevision))
  form.append('kind', kind)
  form.append('file', file)
  const { data } = await http.post<EvidenceDraft>(`${path(campaignId, milestoneIndex)}/documents`, form, {
    signal, headers: { 'Content-Type': undefined },
  })
  return data
}

export async function downloadEvidenceDocument(campaignId: string, milestoneIndex: string, documentId: string,
  signal?: AbortSignal) {
  const { data } = await http.get<Blob>(`${path(campaignId, milestoneIndex)}/documents/${documentId}`, {
    signal, responseType: 'blob',
  })
  return data
}
