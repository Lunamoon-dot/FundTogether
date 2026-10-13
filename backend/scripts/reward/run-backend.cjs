const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { guardEnvironment } = require('./guard-environment.cjs');

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function loadRewardRuntime(root) {
  const environment = readEnvironment(path.join(root, '.local', 'reward', 'backend.env'));
  guardEnvironment(environment);
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, '.local', 'reward', 'generated', 'deployment.local.json'),
    'utf8',
  ));
  if (manifest.protocolKind !== 'REWARD' || manifest.chainId !== 31339
    || manifest.rpcUrl !== environment.REWARD_RPC_URL
    || !/^0x(?!0{40}$)[0-9a-f]{40}$/i.test(manifest.contractAddress || '')) {
    throw new Error('Reward deployment manifest identity invalid');
  }
  return {
    ...environment,
    REWARD_RPC_URL: manifest.rpcUrl,
    REWARD_CONTRACT_ADDRESS: manifest.contractAddress,
  };
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..', '..');
  let runtime;
  try {
    runtime = loadRewardRuntime(root);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const child = spawn(process.execPath, [path.join(root, 'backend', 'dist', 'src', 'main.js')], {
    cwd: path.join(root, 'backend'),
    env: { ...process.env, ...runtime },
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}

module.exports = { loadRewardRuntime };
