const fail = field => { throw new Error(`Workflow B isolated ${field} configuration required`); };
function localUrl(value, field, protocol, port, pathname) {
  let url;
  try { url = new URL(value); } catch { fail(field); }
  if (!protocol.includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.port !== port || url.pathname !== pathname || url.search || url.hash) fail(field);
  return url;
}
function guardDatabase(env) {
  localUrl(env.DATABASE_URL, 'database', ['postgres:', 'postgresql:'], '5434', '/fundtogether_workflow_b');
  return 'fundtogether_workflow_b';
}
function guardEnvironment(env) {
  for (const [field, expected] of Object.entries({ WORKFLOW_PROTOCOL: 'ADVANCE', PORT: '3001',
    WEB_ORIGIN: 'http://localhost:5174', AUTH_DOMAIN: 'localhost:5174', AUTH_CHAIN_ID: '31338',
    CHAIN_ID: '31338', AUTH_SESSION_COOKIE_NAME: 'ft_workflow_b_session', S3_BUCKET: 'fundtogether-workflow-b-private' })) {
    if (env[field] !== expected) fail(field);
  }
  const databaseName = guardDatabase(env);
  for (const [field, port] of [['BLOCKCHAIN_RPC_URL', '9547'], ['S3_ENDPOINT', '9100']]) {
    const url = localUrl(env[field], field, ['http:'], port, '/');
    if (url.username || url.password) fail(field);
  }
  return { protocolKind: 'ADVANCE', databaseName };
}
module.exports = { guardEnvironment, guardDatabase };
