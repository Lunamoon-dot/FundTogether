const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('./migrate-isolated.cjs');
test('migration refuses missing/A/remote URLs before spawning and never uses generic config', () => {
  let calls = 0;
  const spawn = () => { calls++; return { status: 0 }; };
  for (const DATABASE_URL of [undefined, 'postgresql://user:secret@localhost:5432/fundtogether',
    'postgresql://user:secret@localhost:5434/fundtogether', 'postgresql://user:secret@remote:5434/fundtogether_workflow_b']) {
    assert.throws(() => migrate({ DATABASE_URL }, spawn), /Workflow B/);
  }
  assert.equal(calls, 0);
  migrate({ DATABASE_URL: 'postgresql://user:fixture@127.0.0.1:5434/fundtogether_workflow_b' }, (_exe, args) => {
    assert.ok(args.includes('--config=drizzle.workflow-b.config.ts'));
    return { status: 0 };
  });
});
test('migration preserves failure status and launch errors', () => {
  const env = { DATABASE_URL: 'postgresql://user:fixture@localhost:5434/fundtogether_workflow_b' };
  assert.throws(() => migrate(env, () => ({ status: 7 })), /exit 7/);
  assert.throws(() => migrate(env, () => ({ error: new Error('private detail') })), /failed to start/);
});
