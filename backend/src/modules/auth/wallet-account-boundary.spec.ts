import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

describe("wallet connections at account boundaries", () => {
  it("disconnects a previous account's wallet and keeps an explicit connection within the same account", () => {
    let session: {
      userId: string;
      wallets: { address: string; chainId: number }[];
    } | null = { userId: "new-account", wallets: [] };
    const connector = { id: "browser-wallet" };
    const connections = [
      {
        connector,
        accounts: ["0x1111111111111111111111111111111111111111"],
        chainId: 31337,
      },
    ];
    const disconnect = jest.fn();
    const cache = { cancelQueries: jest.fn(), removeQueries: jest.fn() };
    let advance = false;
    const ref = { current: undefined as string | null | undefined };
    let hookIndex = 0;
    const effects: (() => void)[] = [];
    const output = {
      exports: {} as {
        AccountSessionProvider: (props: { children: null }) => unknown;
      },
    };
    const mocks: Record<string, unknown> = {
      "react/jsx-runtime": { jsx: () => null },
      react: {
        createContext: () => ({ Provider: {} }),
        useState: () => [[session, false, ""][hookIndex++], jest.fn()],
        useRef: () => ref,
        useEffect: (effect: () => void) => effects.push(effect),
      },
      wagmi: {
        useConnections: () => connections,
        useDisconnect: () => ({ disconnect }),
      },
      "@tanstack/react-query": { useQueryClient: () => cache },
      "../../lib/web3/deployment-context": { get isAdvance() { return advance; } },
      axios: { default: { isAxiosError: () => false } },
      "../../lib/api/auth": { getSession: () => new Promise(() => {}) },
      "../../lib/api/error": { getErrorMessage: () => "error" },
    };
    const source = readFileSync(
      join(
        __dirname,
        "../../../../frontend/src/features/auth/AccountSessionProvider.tsx",
      ),
      "utf8",
    );
    const js = transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(js, {
      exports: output.exports,
      module: output,
      require: (name: string) => mocks[name],
    });
    const render = () => {
      hookIndex = 0;
      effects.length = 0;
      output.exports.AccountSessionProvider({ children: null });
      // Wallet boundary effect is registered before bootstrap session loading.
      effects[0]();
    };
    render();
    expect(disconnect).toHaveBeenCalledWith({ connector });
    expect(cache.removeQueries).not.toHaveBeenCalled();
    disconnect.mockClear();
    render();
    expect(disconnect).not.toHaveBeenCalled();
    session = {
      userId: "linked-account",
      wallets: [{ address: connections[0].accounts[0], chainId: 31337 }],
    };
    render();
    expect(disconnect).not.toHaveBeenCalled();
    session = null;
    advance = true;
    render();
    expect(disconnect).toHaveBeenCalledWith({ connector });
    expect(cache.cancelQueries).toHaveBeenCalledTimes(1);
    expect(cache.removeQueries).toHaveBeenCalledTimes(1);
    const filter = cache.removeQueries.mock.calls[0][0].predicate;
    expect(filter({ queryKey: ["advance-review-workflow", "previous-user"] })).toBe(true);
    expect(filter({ queryKey: ["campaigns", "baseline"] })).toBe(false);
    render();
    expect(cache.removeQueries).toHaveBeenCalledTimes(1);
  });
});
