// Local HTTP/PostgreSQL verification with disposable accounts and signed wallets.
require("dotenv").config({ quiet: true });
process.env.LOG_LEVEL = "silent";
require("reflect-metadata");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { NestFactory } = require("@nestjs/core");
const { Pool } = require("pg");
const { SiweMessage } = require("siwe");
const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");
const { AppModule } = require("../dist/src/app.module");
const { DRIZZLE_DB } = require("../dist/src/database/database.constants");

async function main() {
  const emails = [1, 2].map(
    (n) => `org-wallet-${randomUUID()}-${n}@example.invalid`,
  );
  const password = randomBytes(24).toString("base64url");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = await NestFactory.create(AppModule, { logger: false });
  let checks = 0;
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    async function request(path, cookie, method = "GET", body, expected = 200) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: unexpected status`,
      );
      checks++;
      return {
        data: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    }
    async function link(cookie, wallet) {
      const { data: challenge } = await request(
        "/auth/wallets/nonce",
        cookie,
        "POST",
      );
      const { data: session } = await request("/auth/session", cookie);
      const message = new SiweMessage({
        ...challenge,
        address: wallet.address,
        scheme: new URL(origin).protocol.slice(0, -1),
        version: "1",
        statement: `Link this wallet to FundTogether account ${session.userId}.`,
        issuedAt: new Date().toISOString(),
      }).prepareMessage();
      await request("/auth/wallets/link", cookie, "POST", {
        message,
        signature: await wallet.signMessage({ message }),
      });
      return { address: wallet.address, chainId: challenge.chainId };
    }
    const owner = await request(
      "/auth/register",
      null,
      "POST",
      { email: emails[0], password },
      201,
    );
    const outsider = await request(
      "/auth/register",
      null,
      "POST",
      { email: emails[1], password },
      201,
    );
    const { data: org } = await request(
      "/organizations",
      owner.cookie,
      "POST",
      {
        name: "Temporary wallet organization",
        description: "Disposable verification profile.",
      },
      201,
    );
    assert.equal(org.representativeWallet, null);
    const route = `/organizations/${org.id}/wallet`;
    const wallet = privateKeyToAccount(generatePrivateKey());
    const input = {
      address: wallet.address,
      chainId: Number.parseInt(process.env.AUTH_CHAIN_ID ?? "31337", 10),
    };
    await request(route, null, "PUT", input, 401);
    await request(route, outsider.cookie, "PUT", input, 403);
    await request(route, owner.cookie, "PUT", input, 403); // Address alone proves nothing.
    const foreign = await link(
      outsider.cookie,
      privateKeyToAccount(generatePrivateKey()),
    );
    await request(route, owner.cookie, "PUT", foreign, 403);
    const verified = await link(owner.cookie, wallet);
    await request(
      route,
      owner.cookie,
      "PUT",
      { ...verified, chainId: verified.chainId + 1 },
      403,
    );
    await request(
      route,
      owner.cookie,
      "PUT",
      { address: "invalid", chainId: verified.chainId },
      400,
    );
    await request(
      route,
      owner.cookie,
      "PUT",
      { ...verified, userId: owner.data.userId },
      400,
    );
    await request(
      `/organizations/${randomUUID()}/wallet`,
      owner.cookie,
      "PUT",
      verified,
      403,
    );
    const expected = {
      address: wallet.address.toLowerCase(),
      chainId: verified.chainId,
    };
    assert.deepEqual(
      (await request(route, owner.cookie, "PUT", verified)).data
        .representativeWallet,
      expected,
    );
    assert.deepEqual(
      (await request(route, owner.cookie, "PUT", verified)).data
        .representativeWallet,
      expected,
    );
    const second = await link(
      owner.cookie,
      privateKeyToAccount(generatePrivateKey()),
    );
    const list = (await request("/organizations", owner.cookie)).data;
    assert.deepEqual(
      list.find((item) => item.id === org.id).representativeWallet,
      expected,
    );
    await request(route, owner.cookie, "PUT", second, 409);
    const relogin = await request("/auth/login", null, "POST", {
      email: emails[0],
      password,
    });
    assert.deepEqual(
      (await request("/organizations", relogin.cookie)).data.find(
        (item) => item.id === org.id,
      ).representativeWallet,
      expected,
    );
    // A separate OWNER must not bind their personal wallet to the creator's organization.
    await pool.query(
      "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')",
      [org.id, outsider.data.userId],
    );
    await request(route, outsider.cookie, "PUT", foreign, 403);
    await pool.query(
      "DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [org.id, owner.data.userId],
    );
    await request(route, relogin.cookie, "PUT", verified, 403);
    assert.equal(
      (await request("/organizations", relogin.cookie)).data.length,
      0,
    );
    const { data: concurrent } = await request(
      "/organizations",
      relogin.cookie,
      "POST",
      {
        name: "Concurrent wallet fixture",
        description: "One initial wallet wins.",
      },
      201,
    );
    const responses = await Promise.all(
      [verified, second].map((body) =>
        fetch(`${base}/organizations/${concurrent.id}/wallet`, {
          method: "PUT",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            Cookie: relogin.cookie,
          },
          body: JSON.stringify(body),
        }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    checks += 2;
    console.log(
      `Organization wallet smoke passed: ${checks} HTTP checks; signed ownership, creator membership, persistence, idempotency and concurrent selection verified.`,
    );
  } finally {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM organization_members WHERE organization_id IN (SELECT id FROM organizations WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))",
        [emails],
      );
      await client.query(
        "DELETE FROM organizations WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        [emails],
      );
      await client.query(
        "DELETE FROM wallet_links WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        [emails],
      );
      await client.query(
        "DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        [emails],
      );
      await client.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
      await client.query("COMMIT");
      console.log("Temporary organization wallet accounts/rows removed.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
      await app.close();
      await app.get(DRIZZLE_DB).$client.end();
    }
  }
}
main().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
