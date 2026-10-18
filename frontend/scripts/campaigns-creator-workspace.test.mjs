import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = relative => fs.readFileSync(path.join(root, 'src', 'features', 'campaigns', relative), 'utf8')

test('Creator workspace gates private reads on ownership operations', () => {
  const source = read('creator/CampaignWorkspacePage.tsx')

  assert.match(source, /export interface CreatorCampaignWorkspacePageProps/)
  assert.match(source, /campaignApi\.operations\('creator'/)
  assert.match(source, /campaignId === id/)
  assert.match(source, /enabled: approved && ownsCampaign/)
  assert.match(source, /campaignApi\.evidence\(id, true/)
  assert.match(source, /session\.userId/)
})

test('Creator workspace owns production and funding follow-up actions only', () => {
  const page = read('creator/CampaignWorkspacePage.tsx')
  const actions = read('creator/CampaignActions.tsx')

  assert.match(actions, /ActivationPanel/)
  assert.match(actions, /DisbursementPanel/)
  assert.match(actions, /CompletionSettlementPanel/)
  assert.match(page, /requestCompletion|submitProduction|submitRelease|confirmCampaignCompletion/)
  assert.doesNotMatch(page, /PledgePreflight|claimRefund|claimSurplus|reviewProduction|approveDisbursement|rejectDisbursement|approveCompletion|rejectCompletion/)
})

test('Creator Studio uses the canonical Creator campaign workspace route', () => {
  const source = read('creator/Studio.tsx')

  assert.match(source, /campaignDetailHref\('creator'/)
  assert.doesNotMatch(source, /#\/campaigns\/\$\{c\.id\}\/creator/)
})
