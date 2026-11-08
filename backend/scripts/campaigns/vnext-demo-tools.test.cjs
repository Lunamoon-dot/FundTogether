const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parse } = require('dotenv');
const { initializeEnvironment } = require('./initialize-vnext-demo.cjs');
const { assertVNextDemoDatabaseTarget } = require('./migrate-isolated.cjs');

test('VNext demo initialization writes unique local credentials without replacing a file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-vnext-demo-'));
  try {
    const file = path.join(directory, 'demo.env');
    const config = initializeEnvironment(file, { database: 15437, minio: 19204, minioConsole: 19205, rpc: 19548, api: 13002, web: 15187 });
    const environment = parse(fs.readFileSync(file, 'utf8'));
    assert.equal(config.database, 'fundtogether_vnext_demo');
    assert.equal(environment.POSTGRES_PORT, '15437');
    assert.equal(environment.FUNDTOGETHER_RPC_URL, 'http://127.0.0.1:19548');
    assert.notEqual(environment.POSTGRES_PASSWORD, '');
    assert.notEqual(environment.S3_SECRET_ACCESS_KEY, '');
    assert.throws(() => initializeEnvironment(file), /already exists|EEXIST/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('VNext demo migrations accept only the declared isolated loopback database', () => {
  const valid = { databaseUrl: 'postgresql://demo:secret@127.0.0.1:15436/fundtogether_vnext_browser_a1b2', expectedDatabaseName: 'fundtogether_vnext_browser_a1b2', expectedPort: 15436 };
  assert.doesNotThrow(() => assertVNextDemoDatabaseTarget(valid));
  for (const override of [
    { databaseUrl: valid.databaseUrl.replace('127.0.0.1', 'db') },
    { databaseUrl: valid.databaseUrl.replace('15436', '5432') },
    { databaseUrl: valid.databaseUrl.replace('fundtogether_vnext_browser_a1b2', 'postgres') },
    { databaseUrl: 'not-a-url' },
  ]) assert.throws(() => assertVNextDemoDatabaseTarget({ ...valid, ...override }));
});
