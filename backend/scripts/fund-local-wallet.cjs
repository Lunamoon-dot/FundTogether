// Development-only funding; explicit target address and amount, no private keys.
const { createPublicClient, createWalletClient, http, isAddress, parseUnits, parseEther, keccak256 } = require('viem');
const { foundry } = require('viem/chains');
const manifest = require('../src/blockchain/generated/deployment.local.json');
const abi = require('../src/blockchain/generated/mock-usdc.abi.json');
async function main() {
  const [address, amount] = process.argv.slice(2);
  if (!isAddress(address ?? '') || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(amount ?? '')) throw new Error('Usage: node scripts/fund-local-wallet.cjs <address> <MockUSDC amount>');
  const units = parseUnits(amount, 6);
  if (units <= 0n || units > (1n << 256n) - 1n) throw new Error('Positive uint256 amount required');
  const client = createPublicClient({ chain: foundry, transport: http(manifest.rpcUrl), pollingInterval: 100 });
  const code = await client.getCode({ address: manifest.tokenAddress });
  if (await client.getChainId() !== 31337 || !code || keccak256(code) !== manifest.tokenCodeHash || (await client.getBlock({ blockNumber: 0n })).hash !== manifest.genesisHash) throw new Error('Configured local deployment required');
  const [operator] = await client.request({ method: 'eth_accounts' });
  const wallet = createWalletClient({ account: operator, chain: foundry, transport: http(manifest.rpcUrl) });
  const receipt = await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: manifest.tokenAddress, abi, functionName: 'mint', args: [address, units] }) });
  if (receipt.status !== 'success') throw new Error('Mint reverted');
  if (await client.getBalance({ address }) < parseEther('0.01')) {
    const gasReceipt = await client.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: address, value: parseEther('1') }) });
    if (gasReceipt.status !== 'success') throw new Error('Gas funding reverted');
  }
  console.log('Funded local wallet:', address, amount, 'MockUSDC; gas balance ready.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
