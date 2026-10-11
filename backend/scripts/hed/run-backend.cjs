const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { guardEnvironment } = require('./guard-environment.cjs');
const root = path.resolve(__dirname, '../../..');
const envFile = path.join(root, '.local/hed/backend.env');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile, quiet: true });
guardEnvironment(process.env);
const manifestPath = path.join(root, '.local/hed/generated/deployment.local.json');
if (fs.existsSync(manifestPath)) process.env.HED_BLOCKCHAIN_RPC_URL = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).rpcUrl;
const child = spawn(process.execPath, [path.join(root, 'backend/dist/src/disbursement/hed-main.js')], {
  cwd: path.join(root, 'backend'), env: process.env, stdio: 'inherit',
});
child.on('error', () => { console.error('HED backend could not start'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
