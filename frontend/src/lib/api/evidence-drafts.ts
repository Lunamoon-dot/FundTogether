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
) {
  const { data } = await http.post<EvidenceDraft>(
    path(campaignId, milestoneIndex),
    { content },
  )
  return data
}

export async function getEvidenceDraft(
  campaignId: string,
  milestoneIndex: string,
) {
  const { data } = await http.get<EvidenceDraft>(
    path(campaignId, milestoneIndex),
  )
  return data
}

export async function updateEvidenceDraft(
  campaignId: string,
  milestoneIndex: string,
  expectedRevision: number,
  content: EvidenceDraftContent,
) {
  const { data } = await http.patch<EvidenceDraft>(
    path(campaignId, milestoneIndex),
    { expectedRevision, content },
  )
  return data
}
