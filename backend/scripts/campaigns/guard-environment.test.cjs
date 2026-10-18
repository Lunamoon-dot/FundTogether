const assert = require('node:assert/strict');
const test = require('node:test');
const { guardEnvironment } = require('./guard-environment.cjs');

const valid = {
  FUNDTOGETHER_PROTOCOL: 'CAMPAIGNS',
  PORT: '3002',
  WEB_ORIGIN: 'http://localhost:5175',
  AUTH_DOMAIN: 'localhost:5175',
  AUTH_CHAIN_ID: '31339',
  CHAIN_ID: '31339',
  AUTH_SESSION_COOKIE_NAME: 'ft_session',
  DATABASE_URL: 'postgresql://test:fixture@127.0.0.1:5436/fundtogether',
  FUNDTOGETHER_RPC_URL: 'http://127.0.0.1:9548',
  S3_ENDPOINT: 'http://localhost:9202',
  S3_BUCKET: 'fundtogether-private',
  S3_ACCESS_KEY_ID: 'campaign-test',
  S3_SECRET_ACCESS_KEY: 'storage-secret',
  FUNDTOGETHER_INDEXER_POLL_ENABLED: 'true',
};

test('accepts the isolated FundTogether environment', () => {
  assert.deepEqual(guardEnvironment(valid), { protocolKind: 'CAMPAIGNS', databaseName: 'fundtogether' });
});

for (const [field, value] of [
  ['FUNDTOGETHER_PROTOCOL', 'INVALID'],
  ['DATABASE_URL', 'postgresql://test:fixture@127.0.0.1:5435/fundtogether_hed'],
  ['FUNDTOGETHER_RPC_URL', 'http://127.0.0.1:9547'],
  ['S3_ENDPOINT', 'http://localhost:9200'],
]) {
  test(`rejects invalid ${field}`, () => {
    assert.throws(() => guardEnvironment({ ...valid, [field]: value }));
  });
}
