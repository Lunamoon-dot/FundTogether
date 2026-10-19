import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = relative => fs.readFileSync(path.join(root, 'src', 'features', 'campaigns', relative), 'utf8')

test('completion settlement exposes the dossier and exactly two surplus destinations', () => {
  const panel = read('shared/ui/CompletionSettlementPanel.tsx')
  const api = read('api/campaigns.ts')
  const creatorPage = read('creator/CampaignActions.tsx')
  const publicPage = read('public/CampaignPage.tsx')

  assert.match(creatorPage, /CompletionSettlementPanel/)
  assert.match(publicPage, /CompletionSettlementPanel/)
  assert.match(publicPage, /mode="public"/)
  assert.match(publicPage, /DisbursementPanel/)
  assert.match(publicPage, /mode="public".*DisbursementPanel|DisbursementPanel.*mode="public"/s)
  assert.doesNotMatch(publicPage, /ActivationPanel|approveCompletion|rejectCompletion/)
  assert.match(panel, /createCompletionRequest/)
  assert.match(panel, /requestCompletion/)
  assert.match(panel, /approveCompletion/)
  assert.match(panel, /rejectCompletion/)
  assert.match(panel, /claimSurplus/)
  assert.match(panel, /Nhận về ví của tôi/)
  assert.match(panel, /Gửi cho Creator/)
  assert.doesNotMatch(panel, /data\.append\(['"]amount|destination.*input|Admin destination/i)
  assert.match(api, /completionRequests/)
  assert.match(api, /surplusClaims/)
  assert.match(api, /payoutRequests/)
  assert.doesNotMatch(api, /requestPayout|approvePayout|rejectPayout/)
  assert.equal(fs.existsSync(path.join(root, 'src', 'features', 'campaigns', 'shared', 'ui', 'PayoutRequestPanel.tsx')), false)
})

test('completed state is surplus settlement, not a full payout label', () => {
  const source = read('shared/ui/campaignState.ts')
  assert.match(source, /COMPLETION_REQUESTED: 5/)
  assert.match(source, /chờ quyết toán surplus/)
  assert.doesNotMatch(source, /PAYOUT_REQUESTED|Đã giải ngân|requestPayout/)
})

test('disbursement form reports client validation instead of silently blocking submit', () => {
  const panel = read('shared/ui/DisbursementPanel.tsx')

  assert.match(panel, /function validateRequest\(\)/)
  assert.match(panel, /noValidate/)
  assert.match(panel, /Hãy nhập số tiền giải ngân hợp lệ/)
  assert.match(panel, /Hãy đính kèm tài liệu giải thích sử dụng tiền/)
  assert.match(panel, /const validationError = validateRequest\(\)/)
})

test('disbursement draft stays retryable until the request is canonical', () => {
  const panel = read('shared/ui/DisbursementPanel.tsx')

  assert.match(panel, /const draft = latest\?\.status === 'DRAFT' \? latest : undefined/)
  assert.match(panel, /Hồ sơ đã lưu nhưng chưa ký on-chain/)
  assert.match(panel, /Ký lại requestDisbursement/)
  assert.match(panel, /pending && !draft/)
  assert.match(panel, /Đã ghi nhận yêu cầu giải ngân on-chain/)
})
