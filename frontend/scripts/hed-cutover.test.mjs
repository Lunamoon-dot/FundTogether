import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)))
const workspace = fs.readFileSync(new URL('../src/features/organizations/OrganizationWorkspace.tsx', import.meta.url), 'utf8')
const navigation = fs.readFileSync(new URL('../src/features/organizations/organization-navigation.ts', import.meta.url), 'utf8')
const publicCampaign = fs.readFileSync(new URL('../src/features/explore/HedPublicCampaign.tsx', import.meta.url), 'utf8')
const deploymentPolicy = fs.readFileSync(new URL('../src/lib/web3/deployment-policy.ts', import.meta.url), 'utf8')
const hedStyles = fs.readFileSync(new URL('../src/features/campaigns/hed/hed.css', import.meta.url), 'utf8')
const publicStyles = fs.readFileSync(new URL('../src/features/explore/PublicArea.css', import.meta.url), 'utf8')
const appStyles = fs.readFileSync(new URL('../src/app/App.css', import.meta.url), 'utf8')
const organizationProfile = fs.readFileSync(new URL('../src/features/organizations/OrganizationProfile.tsx', import.meta.url), 'utf8')
const organizationsPage = fs.readFileSync(new URL('../src/features/organizations/OrganizationsPage.tsx', import.meta.url), 'utf8')
const legacyPaths = [
  '../src/lib/api/generated/advance.ts', '../src/lib/api/advance-http.ts',
  '../src/lib/web3/advance-action.ts', '../src/features/explore/AdvanceCampaignDetail.tsx',
  '../src/features/review/AdvanceReview.tsx', '../src/features/organizations/OrganizationVerificationRequest.tsx',
]

test('default frontend commands run the HED deployment', () => {
  assert.match(packageJson.scripts.dev, /--mode hed/)
  assert.match(packageJson.scripts.build, /--mode hed/)
  assert.equal(packageJson.scripts['dev:workflow-b'], undefined)
})

test('HED workspace exposes only the request-based campaign flow', () => {
  assert.match(workspace, /const sections = \[\{ path: '\/campaigns', label: 'Campaign' \}\]/)
  assert.match(workspace, /<HedOrganizationCampaigns/)
  assert.doesNotMatch(workspace, /AdvanceOrganizationCampaigns|isAdvance/)
  assert.match(navigation, /if \(isHed\) return `\/organizations\/\$\{id\}\/workspace\/campaigns`/)
})

test('frontend ships no executable Workflow B modules', () => {
  for (const path of legacyPaths) assert.equal(fs.existsSync(new URL(path, import.meta.url)), false, path)
})

test('HED frontend has no legacy protocol compatibility or styling names', () => {
  for (const source of [deploymentPolicy, hedStyles, publicStyles, appStyles]) {
    assert.doesNotMatch(source, /BASELINE|ADVANCE|assertAdvanceArtifacts|advance-|milestone-/)
  }
})

test('organization pages do not duplicate the Campaign sidebar destination', () => {
  for (const source of [organizationProfile, organizationsPage]) {
    assert.doesNotMatch(source, /workspace\/campaigns|Quản lý campaign/)
  }
})

test('HED final and outcome controls use the indexed chain clock', () => {
  assert.match(publicCampaign, /const checkpointTime = BigInt\(data\.checkpoint\.chainTimestamp\) \* 1000n/)
  assert.doesNotMatch(publicCampaign, /Date\.now\(\)/)
})
