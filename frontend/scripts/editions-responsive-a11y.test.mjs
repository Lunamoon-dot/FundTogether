import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const appCssPath = resolve('src/app/App.css')
const rewardCssPath = resolve('src/features/reward/reward.css')
const publicAreaCssPath = resolve('src/features/explore/PublicArea.css')

test('CSS includes prefers-reduced-motion media query for accessibility', async () => {
  const [appCss, rewardCss, publicCss] = await Promise.all([
    readFile(appCssPath, 'utf8'),
    readFile(rewardCssPath, 'utf8'),
    readFile(publicAreaCssPath, 'utf8'),
  ])
  const combined = appCss + rewardCss + publicCss
  assert.match(combined, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/,
    'Expected prefers-reduced-motion media query in frontend CSS')
})

test('CSS includes visible focus ring styling with :focus-visible', async () => {
  const [appCss, rewardCss, publicCss] = await Promise.all([
    readFile(appCssPath, 'utf8'),
    readFile(rewardCssPath, 'utf8'),
    readFile(publicAreaCssPath, 'utf8'),
  ])
  const combined = appCss + rewardCss + publicCss
  assert.match(combined, /:focus-visible/,
    'Expected :focus-visible styles in frontend CSS')
  assert.match(combined, /outline|box-shadow/,
    'Expected visible outline or box-shadow for focus rings')
})

test('CSS includes mobile responsive breakpoints for master-detail and grids', async () => {
  const rewardCss = await readFile(rewardCssPath, 'utf8')
  assert.match(rewardCss, /@media\s*\(max-width:\s*(?:768|860|640)px\)/,
    'Expected mobile breakpoint media query in reward.css')
  assert.match(rewardCss, /resolver-master-detail|admin-overview__grid|kpi-grid/,
    'Expected responsive grid overrides for mobile')
})

test('CSS includes overflow-wrap or word-break for cryptographic hashes and addresses', async () => {
  const rewardCss = await readFile(rewardCssPath, 'utf8')
  assert.match(rewardCss, /overflow-wrap:\s*break-word|word-break:\s*break-all/,
    'Expected hash and address overflow wrapping in reward.css')
})

test('Backer primary surfaces do not expose raw entitlement codes in primary headings', async () => {
  const editionsCampaign = await readFile(resolve('src/features/reward/EditionsCampaign.tsx'), 'utf8')
  // Assert headings do not format raw codes like <h1>REFUND_ELIGIBLE</h1> or <h2>CLAIMABLE</h2>
  assert.doesNotMatch(editionsCampaign, /<h[1-3][^>]*>\s*\{?[^}]*(?:REFUND_ELIGIBLE|CLAIMABLE|REFUNDED|ORPHANED)[^}]*\}?\s*<\/h[1-3]>/)
})
