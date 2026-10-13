const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const { probeWindowsRpc, requireRewardRpc } = require('./windows-rpc-probe.cjs');

async function startRpcServer(chainId) {
  const server = http.createServer(async (request, response) => {
    const body = JSON.parse(await new Promise((resolve) => {
      let data = '';
      request.on('data', (chunk) => { data += chunk; });
      request.on('end', () => resolve(data));
    }));
    const result = body.method === 'eth_chainId' ? chainId : 'anvil/v0.3.0';
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

test('probes a Windows-reachable local JSON-RPC endpoint', async () => {
  const { server, url } = await startRpcServer('0x7a6b');
  try {
    assert.deepEqual(await probeWindowsRpc(url), {
      chainId: 31339,
      clientVersion: 'anvil/v0.3.0',
    });
  } finally {
    server.close();
  }
});

test('rejects a Windows RPC endpoint on the wrong chain', async () => {
  const { server, url } = await startRpcServer('0x1');
  try {
    await assert.rejects(() => requireRewardRpc(url), /expected 31339, received 1/);
  } finally {
    server.close();
  }
});

test('reports the WSL forwarding action when Windows cannot reach an endpoint', async () => {
  const { server, url } = await startRpcServer('0x7a6b');
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(
    () => probeWindowsRpc(url),
    /Windows could not reach .*WSL localhost forwarding.*wsl --shutdown/i,
  );
});
