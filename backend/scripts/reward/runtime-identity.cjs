const fs = require('node:fs');

function assertRewardManifest(manifest, rpcUrl) {
  if (manifest.protocolKind !== 'REWARD' || manifest.chainId !== 31339
    || manifest.rpcUrl !== rpcUrl
    || !/^0x(?!0{40}$)[0-9a-f]{40}$/i.test(manifest.contractAddress || '')) {
    throw new Error('Reward deployment manifest identity invalid');
  }
}

function assertRewardHealthIdentity(manifest, health) {
  if (health.status !== 'ok' || health.protocolKind !== 'REWARD'
    || Number(health.chainId) !== 31339
    || String(health.contractAddress).toLowerCase() !== manifest.contractAddress.toLowerCase()) {
    throw new Error('Reward API health identity does not match the current deployment manifest');
  }
}

function isOwnedRewardWeb(manifest, identity, listenerPid, listenerStartedAt) {
  return identity.protocolKind === 'REWARD'
    && String(identity.contractAddress).toLowerCase() === manifest.contractAddress.toLowerCase()
    && Number(identity.pid) === Number(listenerPid)
    && identity.startedAt === listenerStartedAt;
}

if (require.main === module) {
  try {
    const [mode, manifestFile, ...args] = process.argv.slice(2);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (mode === 'health') {
      const [status, protocolKind, chainId, contractAddress] = args;
      assertRewardHealthIdentity(manifest, { status, protocolKind, chainId, contractAddress });
    }
    else if (mode === 'web') {
      const [identityFile, listenerPid, listenerStartedAt] = args;
      const identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
      if (!isOwnedRewardWeb(manifest, identity, listenerPid, listenerStartedAt)) throw new Error('Reward web listener identity does not match the current deployment manifest');
    } else throw new Error('Reward runtime identity mode invalid');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assertRewardManifest, assertRewardHealthIdentity, isOwnedRewardWeb };
