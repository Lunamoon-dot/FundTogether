module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Keep discovery independent of an absolute Windows worktree path. Jest can
  // otherwise escape a leading dot directory (for example `.codex`) as text.
  testMatch: ['**/src/**/*.spec.ts'],
};
