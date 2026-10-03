// Run after build/migrations: node scripts/auth-smoke.cjs
// Starts an isolated HTTP listener; creates and removes only its own test rows.
require("dotenv").config({ quiet: true });
process.env.LOG_LEVEL = "silent";
require("reflect-metadata");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { NestFactory } = require("@nestjs/core");
const { Pool } = require("pg");
const { SiweMessage } = require("siwe");
const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");
const { AppModule } = require("../dist/src/app.module");

async function main() {
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const emails = [1, 2, 3].map(
    (id) => `auth-smoke-${randomUUID()}-${id}@example.invalid`,
  );
  const password = "local-smoke-password-123";
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  let checks = 0;
  async function request(
    path,
    {
      method = "GET",
      body,
      cookie,
      expected = 200,
      requestOrigin = origin,
    } = {},
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: unexpected status`,
    );
    checks++;
    const text = await response.text();
    return {
      response,
      data: text ? JSON.parse(text) : null,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function proof(cookie, wallet, changes = {}) {
    const { data: challenge } = await request("/auth/wallets/nonce", {
      method: "POST",
      cookie,
    });
    const message = new SiweMessage({
      ...challenge,
      address: wallet.address,
      version: "1",
      scheme: new URL(challenge.uri).protocol.slice(0, -1),
      statement: "Link wallet to FundTogether test account.",
      issuedAt: new Date().toISOString(),
      ...changes,
    }).prepareMessage();
    return { message, signature: await wallet.signMessage({ message }) };
  }
  try {
    await request("/auth/session", { expected: 401 });
    await request("/auth/register", {
      method: "POST",
      body: { email: emails[0], password },
      requestOrigin: "https://untrusted.example",
      expected: 403,
    });
    await request("/auth/register", {
      method: "POST",
      body: { email: emails[0], password: "short" },
      expected: 400,
    });
    const first = await request("/auth/register", {
      method: "POST",
      body: { email: emails[0].toUpperCase(), password },
      expected: 201,
    });
    assert.equal(first.data.email, emails[0]);
    assert.deepEqual(first.data.wallets, []);
    assert.ok(first.response.headers.get("set-cookie").includes("HttpOnly"));
    assert.equal("passwordHash" in first.data, false);
    const token = first.cookie.slice("ft_session=".length);
    const stored = await pool.query(
      "SELECT token_hash FROM auth_sessions WHERE user_id = $1",
      [first.data.userId],
    );
    assert.equal(
      stored.rows[0].token_hash,
      createHash("sha256").update(token).digest("hex"),
    );
    await request("/auth/session", { cookie: first.cookie });
    await request("/auth/register", {
      method: "POST",
      body: { email: emails[0], password },
      expected: 409,
    });
    await request("/auth/login", {
      method: "POST",
      body: { email: emails[0], password: "wrong-password-123" },
      expected: 401,
    });
    const campaign = await request("/campaigns", {
      method: "POST",
      cookie: first.cookie,
      body: {
        title: "Auth smoke draft",
        description: "Account without a wallet",
        milestones: [
          {
            title: "First",
            description: "First milestone",
            acceptanceCriteria: [
              { criterionId: "C1", description: "Completed" },
            ],
          },
        ],
      },
      expected: 201,
    });
    const owner = await pool.query(
      "SELECT organizer_user_id FROM campaign_metadata WHERE id = $1",
      [campaign.data.id],
    );
    assert.equal(owner.rows[0].organizer_user_id, first.data.userId);
    const second = await request("/auth/register", {
      method: "POST",
      body: { email: emails[1], password },
      expected: 201,
    });
    await request(`/campaigns/${campaign.data.id}`, {
      cookie: second.cookie,
      expected: 403,
    });
    const wallet = privateKeyToAccount(generatePrivateKey());
    const signed = await proof(first.cookie, wallet);
    // Another session cannot consume the owner's challenge.
    await request("/auth/wallets/link", {
      method: "POST",
      body: signed,
      cookie: second.cookie,
      expected: 401,
    });
    const linked = await request("/auth/wallets/link", {
      method: "POST",
      body: signed,
      cookie: first.cookie,
    });
    assert.equal(linked.data.userId, first.data.userId);
    assert.equal(linked.data.wallets[0].address, wallet.address.toLowerCase());
    await request("/auth/wallets/link", {
      method: "POST",
      body: signed,
      cookie: first.cookie,
      expected: 401,
    });
    await request("/auth/wallets/link", {
      method: "POST",
      body: await proof(second.cookie, wallet),
      cookie: second.cookie,
      expected: 409,
    });
    const otherWallet = privateKeyToAccount(generatePrivateKey());
    await request("/auth/wallets/link", {
      method: "POST",
      body: await proof(first.cookie, otherWallet, {
        domain: "untrusted.example",
      }),
      cookie: first.cookie,
      expected: 401,
    });
    await request("/auth/wallets/link", {
      method: "POST",
      body: await proof(first.cookie, otherWallet, { chainId: 1 }),
      cookie: first.cookie,
      expected: 401,
    });
    await request("/auth/wallets/link", {
      method: "POST",
      body: await proof(first.cookie, otherWallet, {
        uri: "https://untrusted.example",
      }),
      cookie: first.cookie,
      expected: 401,
    });
    const expired = await proof(first.cookie, otherWallet);
    const nonce = new SiweMessage(expired.message).nonce;
    await pool.query(
      "UPDATE auth_challenges SET expires_at = now() - interval '1 second' WHERE nonce = $1",
      [nonce],
    );
    await request("/auth/wallets/link", {
      method: "POST",
      body: expired,
      cookie: first.cookie,
      expected: 401,
    });
    const bad = await proof(first.cookie, otherWallet);
    bad.signature = await wallet.signMessage({ message: bad.message });
    await request("/auth/wallets/link", {
      method: "POST",
      body: bad,
      cookie: first.cookie,
      expected: 401,
    });
    await request("/auth/wallets/link", {
      method: "POST",
      body: await proof(first.cookie, wallet),
      cookie: first.cookie,
    });
    const nonceLogin = await request("/auth/nonce");
    const loginMessage = new SiweMessage({
      ...nonceLogin.data,
      scheme: new URL(origin).protocol.slice(0, -1),
      address: wallet.address,
      version: "1",
      issuedAt: new Date().toISOString(),
    }).prepareMessage();
    const walletLogin = await request("/auth/verify", {
      method: "POST",
      body: {
        message: loginMessage,
        signature: await wallet.signMessage({ message: loginMessage }),
      },
    });
    assert.equal(walletLogin.data.userId, first.data.userId);
    await request("/auth/privy/token", {
      method: "POST",
      cookie: first.cookie,
      expected: 404,
    });
    await request("/auth/privy/jwks", { expected: 404 });
    const third = await request("/auth/register", {
      method: "POST",
      body: { email: emails[2], password },
      expected: 201,
    });
    await pool.query(
      "UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [third.data.userId],
    );
    await request("/auth/session", { cookie: third.cookie, expected: 401 });
    await request("/auth/logout", {
      method: "POST",
      cookie: first.cookie,
      expected: 204,
    });
    await request("/auth/session", { cookie: first.cookie, expected: 401 });
    const relogin = await request("/auth/login", {
      method: "POST",
      body: { email: emails[0], password },
    });
    assert.equal(relogin.data.userId, first.data.userId);
    assert.equal(relogin.data.wallets.length, 1);
    await request(`/campaigns/${campaign.data.id}`, { cookie: relogin.cookie });
    await request("/auth/logout", {
      method: "POST",
      cookie: relogin.cookie,
      expected: 204,
    });
    await request("/auth/logout", {
      method: "POST",
      cookie: relogin.cookie,
      expected: 204,
    });
    console.log(
      `Auth HTTP/PostgreSQL smoke passed: ${checks} response checks; account, drafts, wallet linking, removed provider routes and revocation assertions passed.`,
    );
  } finally {
    try {
      // All filters use this run's unique emails; existing accounts stay intact.
      await pool.query(
        "DELETE FROM campaign_milestone_drafts WHERE campaign_metadata_id IN (SELECT id FROM campaign_metadata WHERE organizer_user_id IN (SELECT id FROM users WHERE email = ANY($1)))",
        [emails],
      );
      await pool.query(
        "DELETE FROM campaign_metadata WHERE organizer_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        [emails],
      );
      await pool.query(
        "DELETE FROM wallet_links WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        [emails],
      );
      await pool.query(
        "DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))",
        [emails],
      );
      await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    } finally {
      await pool.end();
      await app.close();
      await app
        .get(require("../dist/src/database/database.constants").DRIZZLE_DB)
        .$client.end();
    }
  }
}

main().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
