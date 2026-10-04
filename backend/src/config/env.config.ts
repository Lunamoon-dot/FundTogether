export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  authDomain: process.env.AUTH_DOMAIN ?? "localhost:5173",
  authChainId: Number.parseInt(process.env.AUTH_CHAIN_ID ?? "31337", 10),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/fundtogether",
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL,
  s3Endpoint: process.env.S3_ENDPOINT,
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3Bucket: process.env.S3_BUCKET,
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  chainId: process.env.CHAIN_ID
    ? Number.parseInt(process.env.CHAIN_ID, 10)
    : undefined,
});
