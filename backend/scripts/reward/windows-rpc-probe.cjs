const localAddress = 'http://127.0.0.1:9548';

function wslForwardingDiagnostic(url, cause) {
  return `Windows could not reach ${url}. WSL localhost forwarding is required: ensure %UserProfile%\\.wslconfig contains [wsl2] followed by localhostForwarding=true, run wsl --shutdown, then reopen Ubuntu/Docker Desktop and retry. ${cause.message}`;
}

async function request(url, method) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params: [] }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch (error) {
    throw new Error(wslForwardingDiagnostic(url, error));
  }
  if (!response.ok) throw new Error(`Reward RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error || typeof payload.result !== 'string') {
    throw new Error(`Reward RPC ${method} response invalid`);
  }
  return payload.result;
}

async function probeWindowsRpc(url = localAddress) {
  const [chainValue, clientVersion] = await Promise.all([
    request(url, 'eth_chainId'),
    request(url, 'web3_clientVersion'),
  ]);
  const chainId = Number.parseInt(chainValue, 16);
  if (!Number.isSafeInteger(chainId)) throw new Error('Reward RPC returned an invalid chain ID');
  return { chainId, clientVersion };
}

async function requireRewardRpc(url = localAddress) {
  const result = await probeWindowsRpc(url);
  if (result.chainId !== 31339) {
    throw new Error(`Reward RPC expected 31339, received ${result.chainId}`);
  }
  return result;
}

if (require.main === module) {
  requireRewardRpc(process.argv[2] || localAddress)
    .then(({ clientVersion }) => console.log(`Reward Windows RPC reachable on chain 31339 (${clientVersion})`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { probeWindowsRpc, requireRewardRpc };
