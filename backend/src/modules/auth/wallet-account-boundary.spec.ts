import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

const { QueryClient } = require(require.resolve("@tanstack/query-core", {
  paths: [join(__dirname, "../../../../frontend")],
}));
type Session = { userId: string; wallets: { address: string; chainId: number }[] } | null;

function boundary() {
  let session: Session = null;
  let loading = true;
  const connector = { id: "browser-wallet" };
  const address = "0x1111111111111111111111111111111111111111";
  const connections = [{ connector, accounts: [address], chainId: 31339 }];
  const disconnect = jest.fn();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const ref = { current: undefined as string | null | undefined };
  let hookIndex = 0;
  const effects: (() => void)[] = [];
  const output = { exports: {} as { AccountSessionProvider: (props: { children: null }) => unknown } };
  const mocks: Record<string, unknown> = {
    "react/jsx-runtime": { jsx: () => null },
    react: {
      createContext: () => ({ Provider: {} }),
      useState: () => [[session, loading, ""][hookIndex++], jest.fn()],
      useRef: () => ref,
      useEffect: (effect: () => void) => effects.push(effect),
    },
    wagmi: { useConnections: () => connections, useDisconnect: () => ({ disconnect }) },
    "@tanstack/react-query": { useQueryClient: () => cache },
    axios: { default: { isAxiosError: () => false } },
    "../../lib/api/auth": { getSession: () => new Promise(() => {}) },
    "../../lib/api/error": { getErrorMessage: () => "error" },
  };
  const source = readFileSync(join(__dirname, "../../../../frontend/src/features/auth/AccountSessionProvider.tsx"), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { exports: output.exports, module: output, require: (name: string) => mocks[name] });
  return {
    cache, connector, address, disconnect,
    render(next: Session, isLoading = false) {
      session = next; loading = isLoading; hookIndex = 0; effects.length = 0;
      output.exports.AccountSessionProvider({ children: null });
      // Exercise the account boundary; session bootstrap is not part of this harness.
      effects[0]();
    },
  };
}

describe("wallet connections at account boundaries", () => {
  it("waits for session bootstrap, disconnects an unrelated wallet, and preserves same-account connections", () => {
    const { cache, connector, address, disconnect, render } = boundary();
    const remove = jest.spyOn(cache, "removeQueries");
    try {
      render(null, true);
      expect(disconnect).not.toHaveBeenCalled();
      render({ userId: "new-account", wallets: [] });
      expect(disconnect).toHaveBeenCalledWith({ connector });
      expect(remove).not.toHaveBeenCalled();
      disconnect.mockClear();
      render({ userId: "new-account", wallets: [] });
      expect(disconnect).not.toHaveBeenCalled();
      render({ userId: "linked-account", wallets: [{ address, chainId: 31339 }] });
      expect(disconnect).not.toHaveBeenCalled();
      render(null);
      expect(disconnect).toHaveBeenCalledWith({ connector });
      expect(remove).toHaveBeenCalledTimes(2);
      render(null);
      expect(remove).toHaveBeenCalledTimes(2);
    } finally { cache.clear(); }
  });

  it.each(["switch", "logout"])("%s clears Creator and Editions data, aborts pending requests, and rejects late results", async action => {
    const { cache, address, render } = boundary();
    const oldAccount = { userId: "creator-one", wallets: [{ address, chainId: 31339 }] };
    const privateKeys = [
      ["my-reward-creator-profile", oldAccount.userId], ["my-reward-campaigns", oldAccount.userId],
      ["reward-editions-entitlements", oldAccount.userId], ["reward-editions-feedback", "campaign", oldAccount.userId],
      ["reward-editions-evidence", "campaign", oldAccount.userId], ["reward-admin-creators", oldAccount.userId],
    ];
    let requestSignal: AbortSignal | undefined;
    let resolveRequest!: (value: string) => void;
    try {
      render(oldAccount);
      for (const key of privateKeys) cache.setQueryData(key, "PRIVATE OLD ACCOUNT");
      cache.setQueryData(["unrelated-public-reference"], "keep");
      const pendingKey = ["my-reward-campaigns", oldAccount.userId, "pending"];
      const pending = cache.fetchQuery({ queryKey: pendingKey, queryFn: ({ signal }: { signal: AbortSignal }) => {
        requestSignal = signal;
        return new Promise<string>(resolve => { resolveRequest = resolve; });
      } }).then(() => "resolved", () => "cancelled");
      render(action === "logout" ? null : { userId: "creator-two", wallets: [] });
      expect(requestSignal?.aborted).toBe(true);
      expect(await pending).toBe("cancelled");
      for (const key of [...privateKeys, pendingKey]) expect(cache.getQueryState(key)).toBeUndefined();
      expect(cache.getQueryData(["unrelated-public-reference"])).toBe("keep");
      cache.setQueryData(["my-reward-campaigns", "creator-two"], "NEW ACCOUNT");
      resolveRequest("LATE PRIVATE RESPONSE");
      await Promise.resolve();
      expect(cache.getQueryState(pendingKey)).toBeUndefined();
      expect(cache.getQueryData(["my-reward-campaigns", "creator-two"])).toBe("NEW ACCOUNT");
    } finally { cache.clear(); }
  });
});
