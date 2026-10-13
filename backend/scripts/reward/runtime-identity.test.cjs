const assert = require('node:assert/strict');
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
  assert.equal(isOwnedRewardWeb(manifest, {
    protocolKind: 'REWARD', contractAddress: manifest.contractAddress, pid: 4242,
  }, 4242), true);
  assert.equal(isOwnedRewardWeb(manifest, {
    protocolKind: 'REWARD', contractAddress: '0x2222222222222222222222222222222222222222', pid: 4242,
  }, 4242), false);
});
