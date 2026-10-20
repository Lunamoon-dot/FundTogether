const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function buildVNextRuntime(environment, manifestPath, port) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.protocolKind !== 'FUNDTOGETHER_VNEXT') throw new Error('VNext manifest protocol identity is invalid');
  if (manifest.chainId !== 31339) throw new Error('VNext manifest chain identity is invalid');
  if (!/^https?:\/\//.test(manifest.rpcUrl)) throw new Error('VNext manifest RPC URL is invalid');
  if (!/^0x[0-9a-fA-F]{40}$/.test(manifest.campaignEscrow)) throw new Error('VNext manifest CampaignEscrow address is invalid');
  return {
    ...environment,
    FUNDTOGETHER_PROTOCOL: 'FUNDTOGETHER_VNEXT',
    FUNDTOGETHER_VNEXT_MANIFEST_PATH: manifestPath,
    FUNDTOGETHER_RPC_URL: manifest.rpcUrl,
    CHAIN_ID: String(manifest.chainId),
    AUTH_CHAIN_ID: String(manifest.chainId),
    PORT: String(port),
  };
}

function loadVNextRuntime(root, overrides = process.env) {
  const environment = {
    ...readEnvironment(path.join(root, '.local', 'fundtogether', 'backend.env')),
    ...overrides,
  };
  const manifestPath = environment.FUNDTOGETHER_VNEXT_MANIFEST_PATH
    || path.join(root, '.local', 'fundtogether', 'generated', 'vnext-deployment.local.json');
  const port = environment.FUNDTOGETHER_VNEXT_PORT || environment.PORT || '3002';
  return buildVNextRuntime(environment, manifestPath, port);
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..', '..');
  let runtime;
  try {
    runtime = loadVNextRuntime(root);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const child = spawn(process.execPath, [path.join(root, 'backend', 'dist', 'src', 'main.js')], {
    cwd: path.join(root, 'backend'),
    env: runtime,
    stdio: 'inherit',
  });
  child.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}

module.exports = { buildVNextRuntime, loadVNextRuntime };
