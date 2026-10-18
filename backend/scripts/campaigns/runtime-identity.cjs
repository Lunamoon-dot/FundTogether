const fs = require('node:fs');

function assertFundTogetherManifest(manifest, rpcUrl) {
  if (manifest.protocolKind !== 'CAMPAIGNS' || manifest.chainId !== 31339
    || manifest.rpcUrl !== rpcUrl
    || !/^0x(?!0{40}$)[0-9a-f]{40}$/i.test(manifest.contractAddress || '')) {
    throw new Error('FundTogether deployment manifest identity invalid');
  }
}

function assertFundTogetherHealthIdentity(manifest, health) {
  if (health.status !== 'ok' || health.protocolKind !== 'CAMPAIGNS'
    || Number(health.chainId) !== 31339
    || String(health.contractAddress).toLowerCase() !== manifest.contractAddress.toLowerCase()) {
    throw new Error('FundTogether API health identity does not match the current deployment manifest');
  }
}

function isOwnedFundTogetherWeb(manifest, identity, listenerPid, listenerStartedAt) {
  return identity.protocolKind === 'CAMPAIGNS'
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
      assertFundTogetherHealthIdentity(manifest, { status, protocolKind, chainId, contractAddress });
    }
    else if (mode === 'web') {
      const [identityFile, listenerPid, listenerStartedAt] = args;
      const identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
      if (!isOwnedFundTogetherWeb(manifest, identity, listenerPid, listenerStartedAt)) throw new Error('FundTogether web listener identity does not match the current deployment manifest');
    } else throw new Error('FundTogether runtime identity mode invalid');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assertFundTogetherManifest, assertFundTogetherHealthIdentity, isOwnedFundTogetherWeb };
