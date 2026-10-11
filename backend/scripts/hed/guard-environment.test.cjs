const assert = require('node:assert/strict');
const { test } = require('node:test');
const { guardEnvironment } = require('./guard-environment.cjs');
const good = { HED_PROTOCOL: 'HED', PORT: '3002', WEB_ORIGIN: 'http://localhost:5175', AUTH_DOMAIN: 'localhost:5175',
  AUTH_CHAIN_ID: '31339', CHAIN_ID: '31339', AUTH_SESSION_COOKIE_NAME: 'ft_hed_session', HED_INDEXER_ENABLED: 'true',
  DATABASE_URL: 'postgresql://test:fixture@127.0.0.1:5435/fundtogether_hed', HED_BLOCKCHAIN_RPC_URL: 'http://127.0.0.1:9548',
  S3_ENDPOINT: 'http://127.0.0.1:9200', S3_BUCKET: 'fundtogether-hed-private', S3_ACCESS_KEY_ID: 'local', S3_SECRET_ACCESS_KEY: 'local' };

test('HED runtime permits only its isolated local resources', () => {
  assert.doesNotThrow(() => guardEnvironment(good));
  for (const patch of [{ DATABASE_URL: 'postgresql://test:fixture@localhost:5434/fundtogether_workflow_b' },
    { HED_BLOCKCHAIN_RPC_URL: 'http://127.0.0.1:9547' }, { S3_ENDPOINT: 'http://localhost:9100' }, { PORT: '3001' }])
    assert.throws(() => guardEnvironment({ ...good, ...patch }));
});
