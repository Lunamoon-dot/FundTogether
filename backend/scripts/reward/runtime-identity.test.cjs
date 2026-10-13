const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const {
  assertRewardHealthIdentity,
  assertRewardManifest,
  isOwnedRewardWeb,
} = require('./runtime-identity.cjs');

const manifest = {
  protocolKind: 'REWARD',
  chainId: 31339,
  rpcUrl: 'http://127.0.0.1:9548',
  contractAddress: '0x1111111111111111111111111111111111111111',
};

test('accepts matching Reward manifest and API health identity', () => {
  assert.doesNotThrow(() => assertRewardManifest(manifest, manifest.rpcUrl));
  assert.doesNotThrow(() => assertRewardHealthIdentity(manifest, {
    status: 'ok', protocolKind: 'REWARD', chainId: 31339,
    contractAddress: manifest.contractAddress,
  }));
});

test('health CLI accepts PowerShell-safe scalar identity arguments', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reward-runtime-identity-'));
  const manifestFile = path.join(directory, 'deployment.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));

  try {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, 'runtime-identity.cjs'),
      'health',
      manifestFile,
      'ok',
      'REWARD',
      '31339',
      manifest.contractAddress,
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a placeholder deployment manifest', () => {
  assert.throws(
    () => assertRewardManifest({ ...manifest, contractAddress: `0x${'0'.repeat(40)}` }, manifest.rpcUrl),
    /manifest identity invalid/,
  );
});

test('rejects a health response from another protocol', () => {
  assert.throws(
    () => assertRewardHealthIdentity(manifest, {
      status: 'ok', protocolKind: 'HED', chainId: 31339,
      contractAddress: manifest.contractAddress,
    }),
    /health identity does not match/,
  );
});

test('rejects an API health response for another contract', () => {
  assert.throws(
    () => assertRewardHealthIdentity(manifest, {
      status: 'ok', protocolKind: 'REWARD', chainId: 31339,
      contractAddress: '0x2222222222222222222222222222222222222222',
    }),
    /health identity does not match/,
  );
});

test('reuses only a web listener owned by the current Reward manifest', () => {
  const startedAt = '2026-10-13T12:00:00.000Z';
  assert.equal(isOwnedRewardWeb(manifest, {
    protocolKind: 'REWARD', contractAddress: manifest.contractAddress, pid: 4242, startedAt,
  }, 4242, startedAt), true);
  assert.equal(isOwnedRewardWeb(manifest, {
    protocolKind: 'REWARD', contractAddress: '0x2222222222222222222222222222222222222222', pid: 4242, startedAt,
  }, 4242, startedAt), false);
  assert.equal(isOwnedRewardWeb(manifest, {
    protocolKind: 'REWARD', contractAddress: manifest.contractAddress, pid: 4242, startedAt,
  }, 4242, '2026-10-13T12:01:00.000Z'), false);
});
