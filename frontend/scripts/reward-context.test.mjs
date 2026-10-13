import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
test('frontend runtime uses only Reward deployment and API configuration', () => {
  const vite = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
  const http = readFileSync(resolve(root, 'src/lib/api/http.ts'), 'utf8')
  assert.match(vite, /\.local\/reward\/generated\/deployment\.local\.json/)
  assert.match(http, /VITE_REWARD_API_URL/)
  assert.doesNotMatch(vite + http, /LEGACY_PROTOCOL|\.local\/legacy/i)
})
