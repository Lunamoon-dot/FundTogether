// Reuse the local Anvil without resetting state. Clock sync requires an explicit flag.
const { setTimeout: delay } = require('node:timers/promises');
const { createPublicClient, http, keccak256 } = require('viem');
const { foundry } = require('viem/chains');
const deployment = require('../src/blockchain/generated/deployment.local.json');

async function main() {
  const syncClock = process.argv.includes('--sync-clock');
  if (process.argv.slice(2).some(arg => arg !== '--sync-clock')) throw new Error('Usage: node configure-local-mining.cjs [--sync-clock]');
  const url = new URL(deployment.rpcUrl);
  if (deployment.chainId !== 31337 || url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('Only the configured local Anvil is supported');
  const client = createPublicClient({ chain: foundry, transport: http(url.href, { timeout: 5000, retryCount: 0 }) });
  const [chain, genesis, code, tokenCode, interval] = await Promise.all([
    client.getChainId(), client.getBlock({ blockNumber: 0n }),
    client.getCode({ address: deployment.contractAddress }), client.getCode({ address: deployment.tokenAddress }),
    client.request({ method: 'anvil_getIntervalMining' }),
  ]);
  if (chain !== deployment.chainId || genesis.hash !== deployment.genesisHash || !code || !tokenCode
    || keccak256(code) !== deployment.contractCodeHash || keccak256(tokenCode) !== deployment.tokenCodeHash)
    throw new Error('Deployment mismatch; mining configuration was not changed');
  if (deployment.deploymentBlockHash && (await client.getBlock({ blockNumber: BigInt(deployment.deploymentBlockNumber) })).hash !== deployment.deploymentBlockHash)
    throw new Error('Deployment anchor changed; mining configuration was not changed');
  const before = await client.getBlock({ blockTag: 'latest' });
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (syncClock) {
    if (before.timestamp > now) throw new Error('Chain is ahead of the machine clock; refusing to move time backwards');
    await client.request({ method: 'evm_setTime', params: [Number(now)] });
    console.log('Synchronized the local clock to current machine UTC. Existing deadlines remain unchanged.');
  }
  if (interval === null || Number(interval) !== 5) {
    await client.request({ method: 'evm_setIntervalMining', params: [5] });
    console.log('Enabled 5-second interval mining on the existing Anvil; transactions may wait up to 5 seconds.');
  }
  for (let i = 0; i < 12; i++) {
    await delay(1000);
    const after = await client.getBlock({ blockTag: 'latest' });
    if (after.number > before.number && after.timestamp > before.timestamp) {
      console.log(JSON.stringify({ beforeBlock: String(before.number), afterBlock: String(after.number),
        chainTimeUTC: new Date(Number(after.timestamp) * 1000).toISOString(),
        machineTimeUTC: new Date().toISOString(),
        intervalSeconds: await client.request({ method: 'anvil_getIntervalMining' }) }));
      if (Math.abs(Date.now() / 1000 - Number(after.timestamp)) > 60) {
        console.warn('Local chain clock differs from machine UTC by over 60 seconds. For a deliberate forward sync, run this script with --sync-clock; this makes elapsed deadlines effective.');
        // Identity and advancing mining passed; distinguish clock drift from RPC failure.
        process.exitCode = 2;
      }
      return;
    }
  }
  throw new Error('Mining is configured, but an advancing block was not observed; check the Anvil process');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
