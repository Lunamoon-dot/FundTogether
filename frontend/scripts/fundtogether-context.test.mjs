import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
test('frontend global runtime uses Campaign deployment while historical data stays explicit', () => {
  const vite = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
  const http = readFileSync(resolve(root, 'src/lib/api/http.ts'), 'utf8')
  const context = readFileSync(resolve(root, 'src/lib/web3/deployment-context.ts'), 'utf8')
  const historical = readFileSync(resolve(root, 'src/lib/web3/historical-deployment.ts'), 'utf8')
  assert.match(vite, /\.local\/fundtogether\/generated\/campaigns-deployment\.local\.json/)
  assert.match(vite, /@fundtogether\/deployment/)
  assert.match(context, /FundTogether Campaign/)
  assert.match(historical, /@fundtogether\/historical-deployment/)
  assert.match(http, /VITE_FUNDTOGETHER_API_URL/)
  assert.doesNotMatch(vite + http, /LEGACY_PROTOCOL|\.local\/legacy/i)
})
