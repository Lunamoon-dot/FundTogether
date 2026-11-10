const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function initializeEnvironment(file, ports = {}) {
  const target = path.resolve(file);
  const databasePort = Number(ports.database ?? 15436);
  const minioPort = Number(ports.minio ?? 19202);
  const minioConsolePort = Number(ports.minioConsole ?? 19203);
  const rpcPort = Number(ports.rpc ?? 9548);
  const apiPort = Number(ports.api ?? 3002);
  const webPort = Number(ports.web ?? 5187);
  const database = 'fundtogether_vnext_demo';
  const user = `ftdemo_${crypto.randomBytes(5).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  const accessKey = `FT${crypto.randomBytes(10).toString('hex')}`;
  const secretKey = crypto.randomBytes(24).toString('hex');
  const origin = `http://127.0.0.1:${webPort}`;
  const lines = [
    `POSTGRES_USER=${user}`,
    `POSTGRES_PASSWORD=${password}`,
    `POSTGRES_DB=${database}`,
    `DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${databasePort}/${database}`,
    `FUNDTOGETHER_VNEXT_DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${databasePort}/${database}`,
    `POSTGRES_PORT=${databasePort}`,
    `MINIO_API_PORT=${minioPort}`,
    `MINIO_CONSOLE_PORT=${minioConsolePort}`,
    `MINIO_ROOT_USER=${accessKey}`,
    `MINIO_ROOT_PASSWORD=${secretKey}`,
    `S3_ENDPOINT=http://127.0.0.1:${minioPort}`,
    'S3_REGION=us-east-1',
    'S3_BUCKET=fundtogether-vnext-demo',
    `S3_ACCESS_KEY_ID=${accessKey}`,
    `S3_SECRET_ACCESS_KEY=${secretKey}`,
    `FUNDTOGETHER_RPC_URL=http://127.0.0.1:${rpcPort}`,
    `FUNDTOGETHER_VNEXT_RPC_URL=http://127.0.0.1:${rpcPort}`,
    'FUNDTOGETHER_PROTOCOL=FUNDTOGETHER_VNEXT',
    'FUNDTOGETHER_VNEXT_INDEXER_ENABLED=true',
    `FUNDTOGETHER_VNEXT_PORT=${apiPort}`,
    `PORT=${apiPort}`,
    'CHAIN_ID=31339',
    'AUTH_CHAIN_ID=31339',
    `AUTH_DOMAIN=127.0.0.1:${webPort}`,
    `AUTH_SESSION_COOKIE_NAME=ft_vnext_demo_${crypto.randomBytes(6).toString('hex')}`,
    `WEB_ORIGIN=${origin}`,
    `VITE_FUNDTOGETHER_API_URL=http://127.0.0.1:${apiPort}`,
    `VITE_FUNDTOGETHER_WEB_PORT=${webPort}`,
    'NODE_ENV=development',
    'LOG_LEVEL=info',
  ];
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const descriptor = fs.openSync(target, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${lines.join('\n')}\n`, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
  return { path: target, database, databasePort, minioPort, minioConsolePort, rpcPort, apiPort, webPort };
}

if (require.main === module) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('Usage: node initialize-vnext-demo.cjs <environment-file> [database minio minio-console rpc api web ports]');
    const values = process.argv.slice(3).map(Number);
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > 65535)) throw new Error('All provided ports must be integers from 1 to 65535');
    const result = initializeEnvironment(file, Object.fromEntries(['database', 'minio', 'minioConsole', 'rpc', 'api', 'web'].map((key, index) => [key, values[index]]).filter(([, value]) => value !== undefined)));
    console.log(JSON.stringify({ status: 'CREATED', ...result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { initializeEnvironment };
