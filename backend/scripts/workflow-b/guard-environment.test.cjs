const { test } = require('node:test');
const assert = require('node:assert/strict');
const { guardEnvironment } = require('./guard-environment.cjs');
const good = { WORKFLOW_PROTOCOL: 'ADVANCE', PORT: '3001', WEB_ORIGIN: 'http://localhost:5174',
  AUTH_DOMAIN: 'localhost:5174', AUTH_CHAIN_ID: '31338', CHAIN_ID: '31338',
  AUTH_SESSION_COOKIE_NAME: 'ft_workflow_b_session', BLOCKCHAIN_RPC_URL: 'http://127.0.0.1:9547',
  DATABASE_URL: 'postgresql://test:fixture@localhost:5434/fundtogether_workflow_b',
  S3_ENDPOINT: 'http://localhost:9100', S3_BUCKET: 'fundtogether-workflow-b-private' };

test('explicit B environment accepts isolated endpoints and identities', () => {
  assert.deepEqual(guardEnvironment(good), { protocolKind: 'ADVANCE', databaseName: 'fundtogether_workflow_b' });
});
test('all A endpoints, cookies, network, missing and external targets fail before I/O', () => {
  for (const delta of [{ WORKFLOW_PROTOCOL: undefined }, { PORT: '3000' }, { AUTH_CHAIN_ID: '31337' },
    { CHAIN_ID: '31337' }, { AUTH_SESSION_COOKIE_NAME: 'ft_session' }, { WEB_ORIGIN: 'http://localhost:5173' },
    { AUTH_DOMAIN: 'localhost:5173' }, { BLOCKCHAIN_RPC_URL: 'http://localhost:8545' },
    { DATABASE_URL: undefined }, { DATABASE_URL: 'postgresql://test:secret@localhost:5434/fundtogether' },
    { DATABASE_URL: 'postgresql://test:secret@localhost:5432/fundtogether_workflow_b' },
    { DATABASE_URL: 'postgresql://test:secret@remote:5434/fundtogether_workflow_b' },
    { S3_ENDPOINT: 'http://localhost:9000' }, { S3_BUCKET: 'fundtogether-private' }]) {
    assert.throws(() => guardEnvironment({ ...good, ...delta }), /Workflow B/);
  }
});
test('guard failures never echo DB credentials or connection strings', () => {
  assert.throws(() => guardEnvironment({ ...good, DATABASE_URL: 'postgresql://private:SECRET@remote:5434/fundtogether' }),
    error => error.message.includes('Workflow B') && !error.message.includes('SECRET') && !error.message.includes('postgresql'));
});
module.exports = { good };
