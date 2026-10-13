const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { loadRewardRuntime } = require('./run-backend.cjs');

const root = path.resolve(__dirname, '..', '..', '..');

test('Reward service launcher is valid PowerShell syntax', () => {
  const launcher = path.join(__dirname, 'start-services.ps1');
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-Command',
    '$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:REWARD_LAUNCHER_UNDER_TEST, [ref]$null, [ref]$errors); if ($errors.Count) { $errors | ForEach-Object { $_.Message }; exit 1 }',
  ], {
    encoding: 'utf8',
    env: { ...process.env, REWARD_LAUNCHER_UNDER_TEST: launcher },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('loads a verified Reward runtime identity for the backend process', () => {
  const runtime = loadRewardRuntime(root);
  assert.equal(runtime.REWARD_PROTOCOL, 'REWARD');
  assert.equal(runtime.REWARD_RPC_URL, 'http://127.0.0.1:9548');
  assert.match(runtime.REWARD_CONTRACT_ADDRESS, /^0x[0-9a-f]{40}$/i);
});

test('Reward service launcher uses only the Reward runtime sequence', () => {
  const launcher = fs.readFileSync(path.join(__dirname, 'start-services.ps1'), 'utf8');
  for (const requirement of [
    'initialize-environment.cjs', 'infra\\reward\\compose.yaml',
    'start-chain.ps1', 'migrate-isolated.cjs', 'run-backend.cjs',
    'Invoke-RestMethod', 'npm.cmd', '.local\\reward',
  ]) assert.match(launcher, new RegExp(requirement.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
  assert.doesNotMatch(launcher, /workflow-b|\bhed\b/i);
});
