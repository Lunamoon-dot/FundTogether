import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const campaignManifest = fileURLToPath(new URL('../.local/fundtogether/generated/campaigns-deployment.local.json', import.meta.url))
const historicalManifest = fileURLToPath(new URL('../.local/fundtogether/generated/historical-deployment.local.json', import.meta.url))
const deploymentManifest = existsSync(campaignManifest)
  ? campaignManifest
  : fileURLToPath(new URL('./src/lib/web3/missing-campaign-deployment.json', import.meta.url))
const historicalDeploymentManifest = existsSync(historicalManifest)
  ? historicalManifest
  : fileURLToPath(new URL('./src/lib/web3/missing-historical-deployment.json', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: {
    '@fundtogether/deployment': deploymentManifest,
    '@fundtogether/historical-deployment': historicalDeploymentManifest,
  } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  build: { outDir: 'dist' },
})
