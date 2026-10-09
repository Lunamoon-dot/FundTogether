import { defineConfig } from 'drizzle-kit';
const { guardDatabase } = require('./scripts/workflow-b/guard-environment.cjs');
guardDatabase(process.env);
export default defineConfig({
  dialect: 'postgresql', schema: './src/database/schema/*.ts', out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
