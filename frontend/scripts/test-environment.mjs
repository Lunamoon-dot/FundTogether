// Explicit test-only deployment selection. Runtime dev/build commands do not
// load this bootstrap and continue to require a verified local manifest.
process.env.NODE_ENV = 'test';
process.env.FUNDTOGETHER_TEST_DEPLOYMENT = '1';
