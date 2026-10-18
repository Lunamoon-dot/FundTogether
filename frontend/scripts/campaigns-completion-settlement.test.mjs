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
  const page = read('public/Page.tsx')

  assert.match(page, /CompletionSettlementPanel/)
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
