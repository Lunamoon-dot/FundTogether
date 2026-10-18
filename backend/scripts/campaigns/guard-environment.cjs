const fail = field => { throw new Error(`FundTogether ${field} configuration required`); };

function localUrl(value, field, port) {
  let url;
  try { url = new URL(value); } catch { fail(field); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.port !== port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) fail(field);
}

function guardEnvironment(env) {
  for (const [field, expected] of Object.entries({
    FUNDTOGETHER_PROTOCOL: 'CAMPAIGNS', PORT: '3002', WEB_ORIGIN: 'http://localhost:5175',
    AUTH_DOMAIN: 'localhost:5175', AUTH_CHAIN_ID: '31339', CHAIN_ID: '31339',
    AUTH_SESSION_COOKIE_NAME: 'ft_session', S3_BUCKET: 'fundtogether-private',
    FUNDTOGETHER_INDEXER_POLL_ENABLED: 'true',
  })) if (env[field] !== expected) fail(field);
  try {
    const database = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !['localhost', '127.0.0.1'].includes(database.hostname)
      || database.port !== '5436' || database.pathname !== '/fundtogether') fail('database');
  } catch { fail('database'); }
  localUrl(env.FUNDTOGETHER_RPC_URL, 'FUNDTOGETHER_RPC_URL', '9548');
  localUrl(env.S3_ENDPOINT, 'S3_ENDPOINT', '9202');
  return { protocolKind: 'CAMPAIGNS', databaseName: 'fundtogether' };
}

module.exports = { guardEnvironment };
