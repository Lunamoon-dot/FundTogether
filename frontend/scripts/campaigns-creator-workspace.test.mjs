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

test('Creator workspace keeps payout requests in production and funding follow-up actions separate', () => {
  const page = read('creator/CampaignWorkspacePage.tsx')
  const actions = read('creator/CampaignActions.tsx')
  const overviewStart = page.indexOf("{activeTab === 'overview'")
  const productionStart = page.indexOf("{activeTab === 'production'")

  assert.match(actions, /ActivationPanel/)
  assert.doesNotMatch(actions, /DisbursementPanel/)
  assert.match(actions, /CompletionSettlementPanel/)
  assert.match(page, /requestCompletion|submitProduction|submitRelease|confirmCampaignCompletion/)
  assert.ok(overviewStart >= 0)
  assert.ok(productionStart > overviewStart)
  assert.doesNotMatch(page.slice(overviewStart, productionStart), /DisbursementPanel/)
  assert.match(page.slice(productionStart), /DisbursementPanel/)
  assert.match(page, /InternalCampaignFrame/)
  assert.doesNotMatch(page, /CampaignDetailFrame|CampaignOverview|CampaignLedger/)
  assert.doesNotMatch(page, /PledgePreflight|claimRefund|claimSurplus|reviewProduction|approveDisbursement|rejectDisbursement|approveCompletion|rejectCompletion/)
})

test('Creator workspace separates production evidence from final PDF upload', () => {
  const page = read('creator/CampaignWorkspacePage.tsx')

  assert.match(page, /BigInt\(state\.creatorPaid \?\? '0'\) > 0n/)
  assert.match(page, /Chưa có giải ngân được Resolver duyệt/)
  assert.match(page, /disabled=\{busy \|\| !file \|\| !productionFunded\}/)
  assert.match(page, /!state\.productionApproved \|\| BigInt\(state\.releaseDeadline\) > 0n/)
  assert.match(page, /state\.productionApproved \? 'PDF cuối riêng tư' : 'Bằng chứng sản xuất riêng tư'/)
  assert.match(page, /Gửi PDF cuối để Resolver duyệt/)
  assert.match(page, /Gửi bằng chứng sản xuất để Resolver duyệt/)
})

test('production evidence action exposes its wallet preflight result beside the action', () => {
  const page = read('creator/CampaignWorkspacePage.tsx')

  assert.match(page, /productionTransactionMessage/)
  assert.match(page, /type="button"[^>]*onClick=\{\(\) => void tx\.send\(/)
  assert.match(page, /disabled=\{busy \|\| !productionFunded \|\| activeId === null\}/)
})

test('Creator Studio uses the canonical Creator campaign workspace route', () => {
  const source = read('creator/Studio.tsx')

  assert.match(source, /campaignDetailHref\('creator'/)
  assert.doesNotMatch(source, /#\/campaigns\/\$\{c\.id\}\/creator/)
})
