import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const rewardManifest = fileURLToPath(new URL('../.local/reward/generated/deployment.local.json', import.meta.url))
const deploymentManifest = existsSync(rewardManifest)
  ? rewardManifest
  : fileURLToPath(new URL('./src/lib/web3/missing-reward-deployment.json', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@fundtogether/deployment': deploymentManifest } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  build: { outDir: 'dist' },
})
