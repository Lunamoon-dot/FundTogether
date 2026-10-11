const fail = field => { throw new Error(`HED isolated ${field} configuration required`); };
function localUrl(value, field, protocol, port, pathname) {
  let url;
  try { url = new URL(value); } catch { fail(field); }
  if (!protocol.includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.port !== port || url.pathname !== pathname || url.search || url.hash) fail(field);
  return url;
}
function guardDatabase(env) {
  localUrl(env.DATABASE_URL, 'database', ['postgres:', 'postgresql:'], '5435', '/fundtogether_hed');
  return 'fundtogether_hed';
}
function guardEnvironment(env) {
  for (const [field, expected] of Object.entries({ HED_PROTOCOL: 'HED', PORT: '3002', WEB_ORIGIN: 'http://localhost:5175',
    AUTH_DOMAIN: 'localhost:5175', AUTH_CHAIN_ID: '31339', CHAIN_ID: '31339', AUTH_SESSION_COOKIE_NAME: 'ft_hed_session',
    S3_BUCKET: 'fundtogether-hed-private', HED_INDEXER_ENABLED: 'true' })) if (env[field] !== expected) fail(field);
  const databaseName = guardDatabase(env);
  for (const [field, port] of [['HED_BLOCKCHAIN_RPC_URL', '9548'], ['S3_ENDPOINT', '9200']]) {
    const url = localUrl(env[field], field, ['http:'], port, '/');
    if (url.username || url.password) fail(field);
  }
  return { protocolKind: 'HED', databaseName };
}
module.exports = { guardEnvironment, guardDatabase };
