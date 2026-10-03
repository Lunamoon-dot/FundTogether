import { SiweMessage } from "siwe";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "../../../../frontend/src/lib/web3/siwe";

describe("createSiweMessage", () => {
  it("creates a message verifiable with the backend's expected scheme", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = "0123456789abcdef0123456789abcdef";
    const message = createSiweMessage({
      address: account.address,
      chainId: 31337,
      nonce,
      domain: "localhost:5173",
      uri: "http://localhost:5173",
    });

    const parsed = new SiweMessage(message);
    const signature = await account.signMessage({ message });
    const result = await parsed.verify(
      { signature, scheme: "http", domain: "localhost:5173", nonce },
      { suppressExceptions: true },
    );

    expect(parsed.scheme).toBe("http");
    expect(parsed.domain).toBe("localhost:5173");
    expect(result.success).toBe(true);
  });
});
