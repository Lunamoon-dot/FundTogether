import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)))
const workspace = fs.readFileSync(new URL('../src/features/organizations/OrganizationWorkspace.tsx', import.meta.url), 'utf8')

test('default frontend commands run the HED deployment', () => {
  assert.match(packageJson.scripts.dev, /--mode hed/)
  assert.match(packageJson.scripts.build, /--mode hed/)
  assert.match(packageJson.scripts['dev:workflow-b'], /--mode workflow-b/)
})

test('HED workspace exposes only the request-based campaign flow', () => {
  assert.match(workspace, /const sections = isHed \? \[\{ path: '\/campaigns', label: 'Campaign' \}\] : legacySections/)
  assert.match(workspace, /isHed \? <HedOrganizationCampaigns/)
  assert.match(workspace, /isAdvance \? <AdvanceOrganizationCampaigns/)
})
