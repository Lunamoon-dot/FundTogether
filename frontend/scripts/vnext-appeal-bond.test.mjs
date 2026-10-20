import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close() })
const appeal = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-appeal-bond.ts')

test('appeal approval is required only when allowance is below the exact bond', () => {
  assert.equal(appeal.vnextAppealBondApprovalRequired(0n, 1n), true)
  assert.equal(appeal.vnextAppealBondApprovalRequired(1n, 1n), false)
  assert.equal(appeal.vnextAppealBondApprovalRequired(2n, 1n), false)
  assert.equal(appeal.vnextAppealBondApprovalRequired(0n, 0n), false)
})
