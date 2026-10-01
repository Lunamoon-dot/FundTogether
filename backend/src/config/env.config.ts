export const configuration = () => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/fundtogether',
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL,
  chainId: process.env.CHAIN_ID
    ? Number.parseInt(process.env.CHAIN_ID, 10)
    : undefined,
});
