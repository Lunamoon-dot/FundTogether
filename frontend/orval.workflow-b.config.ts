import { defineConfig } from 'orval'

export default defineConfig({
  advance: {
    input: '../backend/src/advance/generated/openapi.json',
    output: {
      target: './src/lib/api/generated/advance.ts',
      client: 'axios-functions',
      mode: 'single',
      override: { mutator: { path: './src/lib/api/advance-http.ts', name: 'advanceHttp' } },
    },
  },
})
