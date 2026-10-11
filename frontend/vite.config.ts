import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@fundtogether/deployment': fileURLToPath(new URL(mode === 'workflow-b'
    ? '../.local/workflow-b/generated/deployment.local.json' : mode === 'hed'
      ? '../.local/hed/generated/deployment.local.json' : '../backend/src/blockchain/generated/deployment.local.json', import.meta.url)) } },
  server: { host: '127.0.0.1', port: mode === 'workflow-b' ? 5174 : mode === 'hed' ? 5175 : 5173, strictPort: true },
  build: { outDir: mode === 'workflow-b' ? 'dist-workflow-b' : mode === 'hed' ? 'dist-hed' : 'dist' },
}))
