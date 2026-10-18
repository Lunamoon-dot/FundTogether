import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = relative => fs.readFileSync(path.join(root, 'src', 'features', 'campaigns', relative), 'utf8')

test('Admin campaign workspace is a read-only operational projection', () => {
  const page = read('admin/CampaignOperationsPage.tsx')
  const router = fs.readFileSync(path.join(root, 'src', 'features', 'explore', 'PublicArea.tsx'), 'utf8')

  assert.match(page, /campaignApi\.operations\('admin'/)
  assert.match(page, /operation\.campaignId === id/)
  assert.match(page, /Admin workspace chỉ đọc projection vận hành/)
  assert.doesNotMatch(page, /useTransaction|PledgePreflight|DisbursementPanel|CompletionSettlementPanel|campaignApi\.evidence\(/)
  assert.match(router, /campaignDetail\.workspace === 'admin'/)
  assert.match(router, /<CampaignOperationsPage/)
})

test('Admin operational links use the Admin workspace and never the Resolver signing route', () => {
  const consoleSource = read('admin/AdminConsole.tsx')

  assert.match(consoleSource, /campaignDetailHref\('admin'/)
  assert.doesNotMatch(consoleSource, /#\/campaigns\/\$\{c\.campaignId\}\/resolver/)
  assert.equal(fs.existsSync(path.join(root, 'src', 'features', 'campaigns', 'resolver', 'AdminConsole.tsx')), false)
})
