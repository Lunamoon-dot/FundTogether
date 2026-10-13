const assert = require('node:assert/strict');
const test = require('node:test');
const { guardEnvironment } = require('./guard-environment.cjs');

const valid = {
  REWARD_PROTOCOL: 'REWARD',
  PORT: '3002',
  WEB_ORIGIN: 'http://localhost:5175',
  AUTH_DOMAIN: 'localhost:5175',
  AUTH_CHAIN_ID: '31339',
  CHAIN_ID: '31339',
  AUTH_SESSION_COOKIE_NAME: 'ft_reward_session',
  DATABASE_URL: 'postgresql://test:fixture@127.0.0.1:5436/fundtogether_reward',
  REWARD_RPC_URL: 'http://127.0.0.1:9548',
  S3_ENDPOINT: 'http://localhost:9202',
  S3_BUCKET: 'fundtogether-reward-private',
  S3_ACCESS_KEY_ID: 'reward-test',
  S3_SECRET_ACCESS_KEY: 'storage-secret',
  REWARD_PII_ENCRYPTION_KEY: 'test_reward_pii_encryption_key_32bytes_safe!!',
  REWARD_INDEXER_POLL_ENABLED: 'true',
};

test('accepts the isolated Reward environment', () => {
  assert.deepEqual(guardEnvironment(valid), { protocolKind: 'REWARD', databaseName: 'fundtogether_reward' });
});

for (const [field, value] of [
  ['REWARD_PROTOCOL', 'HED'],
  ['DATABASE_URL', 'postgresql://test:fixture@127.0.0.1:5435/fundtogether_hed'],
  ['REWARD_RPC_URL', 'http://127.0.0.1:9547'],
  ['S3_ENDPOINT', 'http://localhost:9200'],
  ['REWARD_PII_ENCRYPTION_KEY', 'short'],
]) {
  test(`rejects invalid ${field}`, () => {
    assert.throws(() => guardEnvironment({ ...valid, [field]: value }));
  });
}
