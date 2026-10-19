import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const appCssPath = resolve('src/app/App.css')
const campaignCssPath = resolve('src/features/campaigns/shared/styles.css')
const publicAreaCssPath = resolve('src/features/explore/PublicArea.css')

test('CSS includes prefers-reduced-motion media query for accessibility', async () => {
  const [appCss, campaignCss, publicCss] = await Promise.all([
    readFile(appCssPath, 'utf8'),
    readFile(campaignCssPath, 'utf8'),
    readFile(publicAreaCssPath, 'utf8'),
  ])
  const combined = appCss + campaignCss + publicCss
  assert.match(combined, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/,
    'Expected prefers-reduced-motion media query in frontend CSS')
})

test('CSS includes visible focus ring styling with :focus-visible', async () => {
  const [appCss, campaignCss, publicCss] = await Promise.all([
    readFile(appCssPath, 'utf8'),
    readFile(campaignCssPath, 'utf8'),
    readFile(publicAreaCssPath, 'utf8'),
  ])
  const combined = appCss + campaignCss + publicCss
  assert.match(combined, /:focus-visible/,
    'Expected :focus-visible styles in frontend CSS')
  assert.match(combined, /outline|box-shadow/,
    'Expected visible outline or box-shadow for focus rings')
})

test('CSS includes mobile responsive breakpoints for master-detail and grids', async () => {
  const campaignCss = await readFile(campaignCssPath, 'utf8')
  assert.match(campaignCss, /@media\s*\(max-width:\s*(?:768|860|640)px\)/,
    'Expected mobile breakpoint media query in Campaign styles')
  assert.match(campaignCss, /resolver-master-detail|admin-overview__grid|kpi-grid/,
    'Expected responsive grid overrides for mobile')
})

test('CSS includes overflow-wrap or word-break for cryptographic hashes and addresses', async () => {
  const campaignCss = await readFile(campaignCssPath, 'utf8')
  assert.match(campaignCss, /overflow-wrap:\s*break-word|word-break:\s*break-all/,
    'Expected hash and address overflow wrapping in Campaign styles')
})

test('Backer primary surfaces do not expose raw entitlement codes in primary headings', async () => {
  const campaignPageSource = await readFile(resolve('src/features/campaigns/public/CampaignPage.tsx'), 'utf8')
  // Assert headings do not format raw codes like <h1>REFUND_ELIGIBLE</h1> or <h2>CLAIMABLE</h2>
  assert.doesNotMatch(campaignPageSource, /<h[1-3][^>]*>\s*\{?[^}]*(?:REFUND_ELIGIBLE|CLAIMABLE|REFUNDED|ORPHANED)[^}]*\}?\s*<\/h[1-3]>/)
})
