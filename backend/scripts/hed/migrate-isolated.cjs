const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { guardDatabase } = require('./guard-environment.cjs');
const root = path.resolve(__dirname, '../../..');
function migrate(env = process.env, spawn = spawnSync) {
  guardDatabase(env);
  const result = spawn(process.execPath, [path.join(root, 'backend/node_modules/drizzle-kit/bin.cjs'),
    'migrate', '--config=drizzle.hed.config.ts'], { cwd: path.join(root, 'backend'), env, stdio: 'inherit' });
  if (result.error) throw new Error('HED migration process failed to start');
  if (result.status !== 0) throw new Error(`HED migration failed with exit ${result.status ?? 'unknown'}`);
}
if (require.main === module) {
  const file = path.join(root, '.local/hed/backend.env');
  if (fs.existsSync(file)) require('dotenv').config({ path: file, quiet: true });
  try { migrate(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { migrate };
