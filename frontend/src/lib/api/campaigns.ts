import { http } from './http'

export interface CampaignDraft {
  id: string
  title: string
  description: string | null
  status: string
  createdAt: string
}

export interface CampaignMilestoneDraft {
  id: string
  milestoneIndex: number
  title: string
  description: string | null
  acceptanceCriteria: { criterionId: string; description: string }[]
}

export interface CampaignDraftDetail extends CampaignDraft {
  revision: number
  updatedAt: string
  milestones: CampaignMilestoneDraft[]
}

export async function createCampaignDraft(
  input: {
    title: string
    description: string
    milestones: {
      title: string
      description: string
      acceptanceCriteria: { criterionId: string; description: string }[]
    }[]
  },
  signal?: AbortSignal,
) {
  const { data } = await http.post<CampaignDraftDetail>('/campaigns', input, {
    signal,
  })
  return data
}

export async function listCampaignDrafts() {
  const { data } = await http.get<CampaignDraft[]>('/campaigns')
  return data
}

export async function updateCampaignDraft(
  campaignId: string,
  input: {
    expectedRevision: number
    title: string
    description: string
    milestones: {
      id?: string
      title: string
      description: string
      acceptanceCriteria: { criterionId: string; description: string }[]
    }[]
  },
  signal?: AbortSignal,
) {
  const { data } = await http.patch<CampaignDraftDetail>(
    `/campaigns/${campaignId}`,
    input,
    { signal },
  )
  return data
}

export async function getCampaignDraft(
  campaignId: string,
  signal?: AbortSignal,
) {
  const { data } = await http.get<CampaignDraftDetail>(
    `/campaigns/${campaignId}`,
    { signal },
  )
  return data
}
