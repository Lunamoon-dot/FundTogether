async function probeVNextRpc(rpcUrl, request = fetch) {
  try {
    const response = await request(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    const result = await response.json();
    const chainId = Number.parseInt(result.result, 16);
    return { ok: response.ok && chainId === 31339, chainId };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function probeVNextFrontend(url, request = fetch) {
  const startedAt = performance.now();
  try {
    const response = await request(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { ok: false, status: response.status, milliseconds: Math.round(performance.now() - startedAt) };
    const sourceUrl = new URL('/src/lib/web3/deployment-context.ts', url);
    const identity = await request(sourceUrl, { signal: AbortSignal.timeout(4000) });
    const source = await identity.text();
    return {
      ok: identity.ok && source.includes('FUNDTOGETHER_VNEXT') && source.includes('FundTogether VNext'),
      status: response.status,
      milliseconds: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function isVNextDemoReady({ api, frontend, minio, rpc, database, identity }) {
  return Boolean(
    api.ok
      && api.body?.protocolKind === 'FUNDTOGETHER_VNEXT'
      && frontend.ok
      && minio.ok
      && rpc.ok
      && rpc.chainId === 31339
      && database.ok
      && database.indexer?.status === 'synced'
      && database.indexer.lag === '0'
      && identity.ok,
  );
}

module.exports = { isVNextDemoReady, probeVNextFrontend, probeVNextRpc };
