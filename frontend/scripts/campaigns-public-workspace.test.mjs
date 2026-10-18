import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = relative => fs.readFileSync(path.join(root, 'src', 'features', 'campaigns', relative), 'utf8')

test('public campaign workspace keeps backer settlement reads separate from resolver actions', () => {
  const source = read('public/CampaignPage.tsx')

  assert.match(source, /export interface PublicCampaignPageProps/)
  assert.match(source, /export function PublicCampaignPage/)
  assert.doesNotMatch(source, /approveCampaign|createCampaign|reviewProduction|approveDisbursement|rejectDisbursement|approveCompletion|rejectCompletion/)
})

test('public workspace keeps public evidence and entitlement reads user-scoped', () => {
  const source = read('public/CampaignPage.tsx')

  assert.match(source, /campaignApi\.evidence\(id, false/)
  assert.match(source, /campaignApi\.entitlements\(signal\)/)
  assert.match(source, /campaignApi\.preview\(id/)
  assert.match(source, /campaignApi\.chain\(id/)
  assert.match(source, /ReviewThread/)
  assert.match(source, /CommunityPanel/)
  assert.match(source, /CompletionSettlementPanel/)
})

test('backer actions own pledge, refund, challenge, and entitlement controls', () => {
  const source = read('backer/CampaignActions.tsx')

  assert.match(source, /export interface BackerCampaignActionsProps/)
  assert.match(source, /PledgePreflight/)
  assert.match(source, /claimRefund/)
  assert.doesNotMatch(source, /approveCampaign|createCampaign|finalizeFunding|startRefunds|cancelCampaign|reviewProduction|approveDisbursement|rejectDisbursement|approveCompletion|rejectCompletion/)
})

test('public detail route dispatches to the public campaign workspace', () => {
  const source = read('../explore/PublicArea.tsx')

  assert.match(source, /PublicCampaignPage/)
  assert.match(source, /campaignDetail\.workspace === 'public'/)
  assert.match(source, /<PublicCampaignPage[\s\S]*initialTab=/)
})
